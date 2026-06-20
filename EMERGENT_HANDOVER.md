# Go-Live Build — Handover (read this first)

This branch (`Draft-June-20`) was taken from "near-complete redesign" to **code-complete &
redeploy-ready** against the plan in [`docs/GO_LIVE_PLAN.md`](docs/GO_LIVE_PLAN.md). Milestones
**M0–M4 are implemented and verified** on a live local stack; only deploy-time actions (set real
keys, register webhooks, point DNS) and a few polish items remain.

- Authoritative product spec: [`EMERGENT_HANDOFF.md`](EMERGENT_HANDOFF.md) (updated by the decisions below).
- Execution plan + every task's acceptance criteria: [`docs/GO_LIVE_PLAN.md`](docs/GO_LIVE_PLAN.md).
- Verified regression suite: `backend/tests/test_golive.py` (14 tests, all green) + `test_auth.py`.

## ⚠️ Two things that changed and will surprise you
1. **`APP_MODE` now gates everything.** Default is `demo` (self-seeding, all the demo data + the
   `/demo/*` helpers). **Production requires `APP_MODE=production`**, which turns OFF every
   destructive path (the every-boot reseed/wipe, the team-password reset, demo accounts) and turns
   ON strict config asserts. A prod boot **never wipes data** and seeds **only** the bootstrap admin.
2. **Login password is `emergent@12345`** in demo (a migration reset the seeded team). In production,
   only `ADMIN_EMAIL`/`ADMIN_PASSWORD` is seeded; agents are invited via the UI.

## What was built (M0–M4), all verified
- **M0 — boot safety:** `APP_MODE` flag; fail-fast prod asserts (`JWT_SECRET≥32`, `INTEGRATION_ENC_KEY`
  set+distinct, explicit `CORS_ORIGINS`, `PUBLIC_BASE_URL`); `seed()` split into always-safe
  `bootstrap_production()` vs demo-only `seed_demo()`; reseed/`/demo/reset` guarded; impersonation moved
  to `/admin/*`; CORS fail-closed; integration-key encryption decoupled from `JWT_SECRET`.
  *Proven: prod boot keeps real leads, seeds one admin, no demo data, passwords intact.*
- **M1 — auth & data shape:** one ownership guard on **all** by-id lead/meeting/payment endpoints
  (cross-agent → 404; `simulate/fail` gated out of prod) — the IDOR cluster is closed. **Single-writer
  status model** (`status_set`) so the 5 status fields can't drift. **G5:** a deal becomes Won **only**
  via a real paid payment record (incl. the **Manual** provider's "mark paid"). Unique `leads.email`
  (with a dedup-merge migration) + perf indexes.
- **M2 — money:** multiplier floored at 6× / capped 10×; currency whitelist (USD/INR) + amount
  validation; **Razorpay = INR-only / Stripe = USD** rail guard; **Stripe official-SDK fallback with
  correct cents (×100)**; webhook **signature verification (400 on bad) + idempotency**
  (`webhook_events`); webhook URLs pinned to `PUBLIC_BASE_URL`; **credential resolver** so keys saved in
  Settings actually take effect; Lifetime Access **$15,000**; credit presets repriced to ≥6×.
- **M3 — integrations & funnel:** **returning Won customers re-booking open a new upsell cycle**
  (owner kept, fresh LTV, won-history preserved); Calendly webhook hardened (signing key, cancel branch,
  idempotency, no-agent → `pending_bookings`); campaign→booking attribution; Google Meet via IST timezone
  + organiser fallback (+ google libs); **manual assign/reassign UI**; **`POST /settings/integrations/test/{name}`**
  surfaces real provider errors; `call` follow-up channel; reschedule cap.
- **M4 — QA:** `backend/tests/test_golive.py` (IDOR, status/G5, money, returning-customer, Calendly
  idempotency) green against the live stack. Importers are dedup-safe under the unique index.

## Deploy steps (the only things left for go-live)
1. Set env (see `backend/.env.example`): `APP_MODE=production`, `MONGO_URL`, `DB_NAME`, `JWT_SECRET`
   (≥32), `INTEGRATION_ENC_KEY` (≠ JWT_SECRET), `CORS_ORIGINS` (explicit), `PUBLIC_BASE_URL`,
   `ADMIN_EMAIL`/`ADMIN_PASSWORD`, frontend `REACT_APP_BACKEND_URL`.
2. Add integration keys (env **or** Settings → Integrations, which now works): Stripe + `STRIPE_WEBHOOK_SECRET`,
   Razorpay + `RAZORPAY_WEBHOOK_SECRET`, `CALENDLY_WEBHOOK_SIGNING_KEY`, `GOOGLE_SERVICE_ACCOUNT_JSON`
   (+ optional `GOOGLE_ORGANISER_FALLBACK_EMAIL`), `EMERGENT_USERS_API_URL`, etc.
3. Register webhooks at `{PUBLIC_BASE_URL}/api/webhook/{stripe,razorpay,calendly}`.
4. Verify each integration via the **test-connection** button/endpoint; run a Stripe test charge and
   confirm it reconciles (proves cents). HTTPS + DNS; turn on backups + monitoring.
5. Work the **Go-Live Checklist** in `docs/GO_LIVE_PLAN.md` (Tiers 0–4).

## Backlog (intentionally deferred — not blockers)
- Native dark theme polish on Payments / AuditLog / PaymentReturn (they render dark via a CSS shim today).
- Surface the built `/coverage` page; CSV export; Deals period filter.
- **B6 Circleback** auto-linkage and **B7 SendGrid** real send (currently mock/manual).
- **G13** richer in-app reminders (the follow-ups queue covers v1).
- Durable multi-replica login lockout (in-memory today; fine single-replica).
- Confirm real Annual Pro / Dedicated Support prices (Lifetime is set to $15k).

## Run locally
`backend/.env` + `frontend/.env` (demo-safe with no keys) → `docker compose up` (or the user's
`tools/`-based shim). Demo login: `diyea@emergent.sh` / `emergent@12345`.
