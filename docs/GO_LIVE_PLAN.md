# Emergent Labs Upsell CRM — Master Go-Live Plan

**Product:** Emergent Labs Upsell CRM — an inside-sales upsell CRM (FastAPI single-file `backend/server.py` ~3836 lines + React/CRA dark "Sales Console" frontend + MongoDB). Branch `Draft-June-20` is a near-complete redesign that **runs in demo mode** and now needs finishing + production go-live. Sales motion: campaign → Calendly booking → round-robin to agent (returning customers stick to owner) → Google Meet on the agent's calendar → Circleback recording → follow-up (email/WhatsApp/call) → Stripe (USD) / Razorpay (INR) payment link → Won; LTV from the Emergent Users DB; products include Credit Top-Up (USD × multiplier 6–10, default 7.5). This plan synthesizes four implementation workstreams (A security/correctness, B integrations, C UX, D QA/ops) and two adversarial critiques (completeness + risk/sequencing) into a single, dependency-ordered, blindly-executable runbook. All line references are verified against `backend/server.py` as read.

---

## How to use this plan

- **Execute milestones in order (M0 → M5).** Within a milestone, respect the per-task `Deps` line. Do **not** start a later milestone until the earlier milestone's **exit criteria** pass.
- **Stable task ids** (`A1`, `B3`, `C3`, `D3.4`, `G2`…) are preserved from the source workstreams so cross-references stay valid. Gap-critic items keep their `G#` ids and are folded into the milestone where they belong.
- **The single most important pre-work item:** reconcile the production flag to **one** constant — **`APP_MODE ∈ {demo, production}`** (default `demo`). Workstream A called it `APP_ENV`/`IS_PROD`; B/D called it `APP_MODE`. **Use `APP_MODE` everywhere** (the dangerous default is the *demo* path, so "production" must be explicitly opted into). Every guard in A4, A5, B9, D2, D3 reads this one constant. This is currently a latent merge conflict across three plans — fix it first.
- **The ownership/IDOR guard is `A1`** (Workstream A). C and D mislabel it as "Workstream B/C" in places (gap **G16**) — ignore those labels; it is A1.
- **"Done when…"** acceptance criteria are contracts. A task is not done until its tests are green on a `_test` DB.
- **"Verified" gate (D1.6):** a change is verified when (1) `pytest -m "not live"` is green on a `_test` DB (conftest aborts if `DB_NAME` lacks `_test`), (2) the IDOR suite passes, (3) the relevant `test_result.md` task is flipped to `working:true` by the testing agent, (4) for FE-affecting changes the Playwright happy path is green.
- **Effort:** S (small), M (medium), L (large). **Priority:** P0 (go-live blocker), P1 (material), P2 (polish).
- **Before the first prod boot:** take a full Mongo backup and complete a restore drill (D4.5). This is the one irreversible-if-wrong step.

---

## Decisions locked (2026-06-19)

All prior open product decisions are **RESOLVED** — see **Resolved decisions** at the end of this doc. Headlines: Lifetime Access starts **$15,000**; Stripe keeps **`emergentintegrations`** (official `stripe` SDK only as a non-interfering off-platform `try/except` fallback); WhatsApp **log-only**; single shared **Calendly org**; a lead can only become Won through a **paid payment record** (incl. the Manual provider); credit presets **repriced to ≥6×**; Circleback **deferred to post-launch**; notifications v1 **= the follow-ups queue** (richer reminders are a documented post-launch item). No product input is required to execute.

---

## Milestone overview

| Milestone | Goal | Exit criteria |
|---|---|---|
| **M0 — Boot safety & prod hardening** | Make a prod boot non-destructive; one `APP_MODE` flag; CORS/secret fail-fast; demo/impersonation/reseed/password-reset guarded. **NOTHING ELSE ships until this lands.** | Prod-mode boot against a DB of fake-real leads: zero `delete_many`, zero password mutation, exactly one admin, no demo data, `/demo/reset`→403, impersonation still works via `/admin/impersonate`. Boot fails fast on missing/weak `JWT_SECRET`, missing `INTEGRATION_ENC_KEY`, or `CORS_ORIGINS` unset/`*`. (D5.1 staging miniature; first go/no-go.) |
| **M1 — Authorization & data-shape correctness** | Close IDOR on all by-id endpoints; single-writer status model; FE status write-path fix; `leads.email` dedup→unique index. | IDOR suite (D1.2) green (cross-agent→404, no state change, `simulate` can't forge revenue); status round-trip suite (D1.1) green (all 10 statuses, no raw field holds a visible-status string); `leads.email` unique index EXISTS (not swallowed) after dedup migration. |
| **M2 — Money correctness** | Multiplier floor + FX/currency validation; Stripe cents (×100) + Razorpay paise; central credential resolver; webhook signature + idempotency; server-pinned webhook URLs. | Multiplier floored at 6×; Stripe charge == `amount*100` reconciles to dashboard; stored keys beat env and take effect ≤30s; tampered webhook→4xx; replay→single revenue increment (all 3 providers); webhook/success URLs use server `PUBLIC_BASE_URL`, not client `origin_url`. |
| **M3 — Real-mode integrations & funnel fidelity** | Google Meet on agent calendar (IST); Razorpay INR guard; Calendly registration/cancel/dedup + real campaign→booking attribution; returning-customer reopen wiring; per-integration test-connection. | At least one payment provider end-to-end live (link→pay→Won, exactly once); Meet produces a real `meet.google.com` link with agent as organiser + `timeZone=Asia/Kolkata`; a booking from campaign X increments campaign X's `booked_count` and carries `campaign_id=X`; a returning Won customer re-book reopens (upsell cycle) without corrupting the won record; B9 test-connection endpoints return real provider errors. |
| **M4 — QA suite, migration safety & importer correctness** | Full pytest harness + test_result.md; reconciliation routine; importer reconciled to unique index + status model; perf/pagination/durable lockout. | `pytest -m "not live"` green on `_test` DB; reconcile dry-run flags drift, apply converges, second apply no-op; importers don't throw mid-batch under the unique index and route Won rows through `status_set`; durable login lockout survives restart (or single-replica acceptance documented). |
| **M5 — Deploy & go-live** | Staging/UAT pass, webhook/DNS/CORS live, monitoring, backups, rollout + rollback drilled. | Full Go-Live Checklist (below) all green; staging booking→meeting→payment→Won passes with test providers; rollback drilled (restore without triggering reseed). |

---

# M0 — Boot safety & prod hardening

> The only changes that can run against a real DB without a guard, so they come first — on a disposable Mongo, fully tested. **No other milestone starts until M0's gate passes.**

### P0-FLAG — Single `APP_MODE` flag (do this literally first) · S · P0
- **Intent.** One production constant, read by every guard. Reconciles A's `APP_ENV`/`IS_PROD` and B/D's `APP_MODE`.
- **Change.** Add near top of `server.py` (after line 54):
  ```python
  APP_MODE = os.environ.get("APP_MODE", "demo").lower()   # {demo, production}
  IS_PROD  = APP_MODE == "production"
  ```
  Replace all `APP_ENV`/`IS_PROD` references from Workstream A with this. Every guard in A4, A5, B9, D2, D3 reads `IS_PROD`/`APP_MODE`.
- **Done when.** Boot log echoes `APP_MODE`. No-go if unset (defaults to demo = destructive path). **Deps:** none. **Blocks:** everything in M0.

### A5.0/D3.1 — Boot-time fail-fast asserts + env contract · S · P0
- **Intent.** A deployer needs the exact env list; boot must refuse to start misconfigured. There is **no `.env`** in the repo today and `JWT_SECRET` is a hard `os.environ[...]` (server.py:51) that crashes boot if unset.
- **Change.**
  - Assert `JWT_SECRET` present and **≥32 chars** in prod (keep the hard read, add length assert; reject known-weak defaults).
  - Assert `INTEGRATION_ENC_KEY` set and **distinct from `JWT_SECRET`** (see D3.2 decoupling).
  - Assert `CORS_ORIGINS` set and **≠ `*`** when `IS_PROD` (A5.2 / D4.3).
  - Create `backend/.env.example` listing **required**: `MONGO_URL`, `DB_NAME`, `JWT_SECRET`, `INTEGRATION_ENC_KEY`, `CORS_ORIGINS`, `APP_MODE=production`, `PUBLIC_BASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`. **Optional integrations:** `STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET`, `RAZORPAY_KEY_ID/SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `CALENDLY_WEBHOOK_SIGNING_KEY`, `CALENDLY_TOKEN`, `CIRCLEBACK_API_KEY/URL`, `SENDGRID_API_KEY`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `EMERGENT_USERS_API_URL/KEY`. **Demo-only:** `DEMO_EMAIL`, `DEMO_PASSWORD`, `EMERGENT_SIM_AUTOPAY`.
- **Done when.** Boot fails fast with a clear message if any required var is missing or `CORS_ORIGINS=='*'` while `IS_PROD`; `.env.example` lists every var the code reads. **Deps:** P0-FLAG.

### D2.1 + A5.5 + B9 — Reseed/wipe guards (the #1 go-live blocker) · M · P0
- **Intent.** Never wipe a real DB. `_migrate_clean_reseed_v3` (server.py:3756) and `/demo/reset` (3745) both call `reset_demo_data()` → `_wipe_demo_data()` → `delete_many({})` on leads/payments/meetings/activities/coverage_snapshots. It runs every boot, gated only by the `clean_reseed_believable_v4` migration key — **absent on a fresh prod DB**, so an unguarded first prod boot wipes real data and demo-seeds.
- **Change.**
  - Guard the **top** of `_migrate_clean_reseed_v3` (3756): `if IS_PROD: return` — short-circuit **before** the migration-key check (the key check is downstream of the wipe decision).
  - Split `seed()` (3765–3775) into `bootstrap_production()` (always-safe, idempotent: settings, indexes, admin/agent provisioning, structural migrations, status-model backfill) vs `seed_demo()` (demo account, demo leads, coverage history, clean_reseed, password reset). Call `seed_demo()` **only when not `IS_PROD`**.
  - Guard `/demo/reset` (3745): `if IS_PROD: raise HTTPException(403, "Disabled in production")` at the top (even though admin-only).
  - Guard `/demo/impersonate` (1089) / `/demo/stop-impersonate` (1106) — see P0-IMP below (moved, not just disabled).
- **Done when.** Boot with `APP_MODE=production` on a DB containing real leads → `delete_many` never called; lead count unchanged; demo account not created; `/demo/reset`→403. Demo boot unchanged. **Deps:** P0-FLAG.
- **Edge/failure.** Mixed history (someone ran demo once on a DB that becomes prod) — `bootstrap_production` must tolerate demo leftovers (don't assume empty). Multi-replica concurrent boot — keep the `migrations` upsert-key pattern; make seeds idempotent.

### A5.6 + D2.3 — Password-reset migration prod-skip · S · P0
- **Intent.** `_migrate_reset_passwords` (server.py:3176) stamps every admin+agent password to `emergent@12345`. A known-credential exposure if it runs on real data.
- **Change.** Move the call into `seed_demo()` (demo-only). In prod, no auto-reset — operators are provisioned by D3.3 and set their own password on first login. Keep the migration key guard so a demo→prod transition won't re-run it.
- **Done when.** Prod boot does not touch any `password_hash`; a user with a custom hash is unchanged after boot. Demo boot still normalizes to `emergent@12345`. **Deps:** D2.1, D3.3. **Note:** existing test fixtures assuming `emergent@12345` must run with `APP_MODE=demo`.

### P0-IMP / C7 — De-conflict impersonation from the `/demo/*` purge · S · P0
- **Intent.** "View as agent" is a legitimate, audited manager feature (`require_admin`, `log_audit("impersonate")` at 1098, reversible via the always-visible `ImpersonationBanner`). It must survive the prod disabling of `/demo/*`.
- **Change.** In the **same change** that disables `/demo/*`, move `/demo/impersonate`→`/admin/impersonate` and `/demo/stop-impersonate`→`/admin/stop-impersonate` (or explicitly allowlist them from the prod guard). Update `frontend/src/contexts/AuthContext.js:45,53` paths to match. Ensure `stop_impersonate` re-verifies `imp_by` is still an admin (already does, 1112) and add an audit log on **stop** (currently only start logs).
- **Done when.** Disabling `/demo/*` in prod does **not** break impersonation; "View as agent" works against `/admin/*`, is still audit-logged, and the impersonated session is `role:agent` (admin-only routes redirect). **Deps:** D2.1 (must land together). C7 flags this; it is pulled forward into M0 — do **not** leave it at M-polish or impersonation 404s the moment the reseed guard lands.

### A5.2 / D4.3 — CORS fail-closed · S · P0
- **Intent.** `allow_origins` defaults to `'*'` with `allow_credentials=True` (server.py:3829–3834) — invalid/insecure for cookie auth.
- **Change.**
  ```python
  _cors = os.environ.get("CORS_ORIGINS", "")
  if IS_PROD and (not _cors or _cors.strip() == "*"):
      raise RuntimeError("CORS_ORIGINS must be an explicit allowlist in production")
  allow_origins = [o.strip() for o in _cors.split(",") if o.strip()]
  if not allow_origins:                      # non-prod fallback
      allow_origins = ["*"]; allow_credentials = False   # G18: never pair * with credentials
  ```
  **G18 fix:** when origins resolve to `*` (non-prod), set `allow_credentials=False` so the invalid `*`+credentials combo never ships.
- **Done when.** App refuses to boot in prod with `CORS_ORIGINS` unset/`*`; a browser from a non-listed origin is blocked; the real FE origin works with cookies. **Deps:** P0-FLAG.

### A5.3 — Secure cookies / HTTPS · S · P0
- **Change.** Cookies already `Secure; HttpOnly; SameSite=Lax` (412–415) — keep `lax` (needed for the payment-return redirect; `strict` is too aggressive). HTTPS end-to-end (any plain-HTTP hop logs everyone out). Optional `COOKIE_DOMAIN` for cross-subdomain.
- **Done when.** `/api/auth/me` returns the `Secure` cookie over the prod domain.

### M0 GATE (first go/no-go)
Boot a Mongo seeded with fake "real" leads under `APP_MODE=production`; assert: **zero `delete_many`** (spy/mock the call), **zero password mutation**, **exactly one admin**, **no demo leads/account**, `/demo/reset`→403, **impersonation still works** via `/admin/impersonate`, boot fails fast on missing/weak `JWT_SECRET` / missing `INTEGRATION_ENC_KEY` / `CORS_ORIGINS` unset-or-`*`. (This is D5.1 staging in miniature.)

---

# M1 — Authorization & data-shape correctness

> Before multi-user, before any real customer. IDOR holes are invisible in single-user demo testing but immediately exploitable once agents share the instance.

### A1 — Single reusable ownership guard across all by-id endpoints · M · P0
- **Intent.** An agent may only read/mutate records for leads they own; admins see everything. Today only `reopen_lead` (1547) and `get_meeting` (2014) enforce this. **This is the ownership guard the whole plan refers to (G16: it is A1, not B or C).**
- **Targets (server.py).** Add helpers near `require_admin` (after line 572), then wire into every by-id endpoint that currently does NOT scope by owner:
  - `GET /leads/{id}` `get_lead` (1393); `PUT /leads/{id}` `update_lead` (1427); `PUT /leads/{id}/stage` `update_stage` (1446); `POST /leads/{id}/notes` `add_note` (1564); `POST /leads/{id}/enrich` `enrich_lead` (1580); `POST /leads/{id}/touch` `touch_lead` (1601).
  - `POST /meetings` `create_meeting` (1903): guard the **target lead** (`body.lead_id`) AND, when a non-admin supplies `body.agent_id` for another agent → 403.
  - `PUT /meetings/{id}/outcome` `meeting_outcome` (1945); `PUT /meetings/{id}/reschedule` `reschedule_meeting` (1984).
  - `POST /payments/link` `create_payment_link` (2345): guard target lead.
  - `GET /payments/status/{sid}` `payment_status` (2399); `POST /payments/simulate/{sid}` `simulate_payment` (2421, **forges Won revenue today**); `POST /payments/fail/{sid}` `fail_payment` (2430).
  - Already scoped (standardize on the helper, leave behavior): `reopen_lead` (1541), `get_meeting` (2010). List endpoints (`list_leads` 1282, `list_meetings` 1838, `list_payments` 2200, `recent_notes` 1376) already scope — **do not touch.** `assign_lead`/`round_robin_assign` already `require_admin` — no change.
- **Change.** Add helpers (sync, take the already-fetched record):
  ```python
  def _is_admin(user): return user.get("role") == "admin"
  def _owns_lead(user, lead): return _is_admin(user) or lead.get("owner_id") == user["id"]
  def require_lead_access(user, lead):
      if not _owns_lead(user, lead):
          raise HTTPException(404, "Lead not found")     # 404 not 403: no id-enumeration leak
  def require_meeting_access(user, meeting):
      if not (_is_admin(user) or meeting.get("agent_id") == user["id"]):
          raise HTTPException(404, "Meeting not found")
  async def require_payment_access(user, record):
      if _is_admin(user) or record.get("agent_id") == user["id"]:
          return
      lead = await db.leads.find_one({"id": record.get("lead_id")}, {"_id":0, "owner_id":1})
      if not (lead and lead.get("owner_id") == user["id"]):
          raise HTTPException(404, "Payment not found")
  ```
  Insert one call immediately after each `find_one(...); if not <rec>: 404` block. For `create_meeting`: `require_lead_access(user, lead)` after 1907, plus after resolving agent (1909–1916): `if body.agent_id and not _is_admin(user) and body.agent_id != user["id"]: raise HTTPException(403, "Agents can only book meetings for themselves")`. Convert the two existing 403s (`reopen_lead` 1548, `get_meeting` 2015) to the helpers (keep `reopen_lead`'s 400 "no owner" check before the access check).
- **Decision: return 404 (not 403)** for unowned records — uniform with the "not found" path, prevents id-enumeration. **Unowned-lead policy:** `owner_id is None` → only admins may act (`_owns_lead` returns False for agents — correct).
- **Done when.** Any agent acting on a record they don't own → 404 and **no DB write** (verify mutation count unchanged); owner/admin succeed unchanged; `simulate_payment` by a non-owner cannot mark Paid (no revenue increment); non-admin passing another agent's `agent_id` to `/meetings` → 403; `reopen_lead`/`get_meeting` behavior preserved.
- **Edge/failure.** Impersonation: token's effective id/role is the agent — guard scopes correctly (intended). Legacy payments without `agent_id` fall back to lead owner; if both absent, only admins pass (no backfill needed). Webhooks are unauthenticated by design (A4 covers them) — they never call these guards.
- **Tests (D1.2 is the contract).** `test_idor.py`: agentB on agentA's lead/`/stage`/`/notes`/`/enrich`/`/touch` → 404; `POST /payments/simulate/{sid_B}` → 404 and `total_revenue_usd` unchanged; `POST /meetings {lead_id:B}` → 404; `{lead_id:A, agent_id:<other>}` → 403; admin → 200; agentB's list excludes agentA's records.
- **Deps.** None; do first in M1. **Blocks** C2 (assign UI), C4c (export) — those widen blast radius if A1 isn't in.

### D3.4 — `leads.email` dedup-then-unique index (mis-sequenced in source — move up) · M · P0
- **Intent.** The returning-customer / sticky-owner motion assumes one lead per email. `leads.email` is **non-unique** today (server.py:3793). This unique index is a **prerequisite** for webhook/Calendly idempotency (A4/B5) and returning-customer stickiness.
- **Targets.** `index_specs` in `_run_startup` (server.py:3789–3796).
- **Change.** Run a **pre-flight dedup migration FIRST** (merge duplicate-email leads: keep oldest `owner_id`/ownership_history, sum revenue, union notes/activities), **then** `create_index("email", unique=True)` with **surfaced failure** (raise in prod). Also add perf compounds (D4.6): `meetings(agent_id, scheduled_at)`, `payments(lead_id)`, `leads(owner_id, stage)`.
- **CRITICAL failure mode.** `create_index(unique=True)` **throws if dupes exist, and the current except-clause at 3804 swallows it**, silently leaving a NON-unique index and a false sense of safety. Dedup must run first; index creation must surface failure. Emails must be lowercased consistently (seed does; verify import paths — see G7). Do this **before any inbound webhook traffic.**
- **Done when.** `leads.email` unique index EXISTS; duplicate-email insert is rejected/upserted; Calendly re-booking updates the existing lead (sticky owner preserved). **Deps:** D2.1. **Tests:** `test_migrations.py::test_email_unique_after_dedup`.
- **Snapshot before this step** — it is the only data-destructive forward step (merges/deletes duplicate leads). See Rollback.

### A2 — Dual-status single-writer refactor (single source of truth) · L · P0
- **Intent.** Lead status lives across five fields (`stage`, `payment_status` legacy; `sales_stage`, `outcome`, `payment_state` new) collapsed by `derive_status` (123) into one of 10 `VISIBLE_STATUSES`. Many writers set 4–5 fields by hand and can drift, producing a badge that contradicts the pipeline. The fix: one authoritative projector used by every writer. `_status_fields(status)` (3214–3229) already maps a visible status → all 5 fields — promote it.
- **Decision: keep all five fields** (legacy clients/tests/reporting read both) but route **every write** through one function.
- **Change.**
  1. Add wrapper:
     ```python
     def status_set(status, **extra):
         if status not in VISIBLE_STATUSES:
             raise HTTPException(400, f"Invalid status '{status}'")
         fields = _status_fields(status)
         fields["updated_at"] = now_iso(); fields["last_activity"] = now_iso()
         if status == "Payment Link Paid":
             fields["owner_locked"] = True; fields["won_at"] = now_iso()
         fields.update(extra)
         return fields
     ```
  2. `update_stage` (1446–1481): validate `body.stage` maps to a visible status (alias dict translates legacy `Won`→`Payment Link Paid` etc.), then `status_set(mapped)`; delete per-branch `$set`s.
  3. `_apply_payment_status` (2440–2473): paid → `status_set("Payment Link Paid", priority="None", next_action="View customer / ask for referral")`; failed/expired/canceled → `status_set("Payment Link Failed", priority="Follow-up This Week", next_action="Retry payment link")`. Keep the `$inc` revenue block. **Bug fixed in passing:** current paid branch sets `sales_stage="Payment Link Sent"` while `outcome="Won"`.
  4. `create_payment_link` (2383–2388): `status_set("Payment Link Sent", priority="Payment Pending", provider=body.provider)` + merge product/amount.
  5. `meeting_outcome` (1964–1973): completed → `status_set("Interested", last_meeting_at=...)`; no_show → `status_set("No-Show", priority="Follow-up This Week")`.
  6. `_apply_lead_update_mappings` (1408–1425) / `update_lead` (1427): when FE sends a new-vocab `stage` (visible status), route through `status_set`; field-only updates (name/phone/amount) untouched.
  7. `reopen_lead` (1549–1556): `status_set("Contact in Future", priority="Follow-up This Week", owner_locked=False)` + keep `$inc upsell_cycles`.
  8. `_assign_lead` (1490–1498) and `create_meeting` lead update (1935–1939): `status_set("Contacted")` (preserve the New→Contacted-only guard). **⚠ See G2 below — returning Won customers must NOT be force-set to "Contacted"; route them through reopen.**
- **G17 — write the precedence table.** `derive_status` "outcome precedence" is relied on but never documented. **Add an explicit precedence table to A2** (what wins when `payment_state=Paid` but `outcome=No-Show`, etc.) so an executor extending writers knows the rule. D1.1 tests "no path leaves Paid+outcome≠Won," but the tie-break order is the actual contract.
- **G5 — phantom-Won contract (decide & document).** `status_set("Payment Link Paid")` sets `owner_locked` + `won_at` but does **not** `$inc` revenue (revenue only fires on the real money event in `_apply_payment_status`). A manually-"Won" lead with $0 revenue would appear in Won groups, the leaderboard, and referrer-eligibility (`_eligible_referrers` 2938) while `total_revenue_usd=0`. **Decision (pick one and implement): EITHER forbid manual "Payment Link Paid" without a paid payment record, OR add a `won_without_payment` flag and make revenue/leaderboard reports exclude/separately-bucket these.** Do not ship the contradiction unspecified.
- **Done when.** Every status-changing path calls `status_set` (grep: no remaining `$set` literal containing both `"sales_stage"` and `"payment_state"` outside `status_set`/`_status_fields`); for all 10 statuses, write X then read → `serialize_lead["status"] == X`; drawer moves to No-Show/Changed Their Mind/Contact in Future actually change the badge; "Mark paid" wins the deal once; no serialized status contradicts `outcome`/`payment_state`.
- **Edge/failure.** Won double-count: `status_set("Payment Link Paid")` must NOT `$inc` revenue. Legacy leads: `serialize_lead` (449–458) derives from legacy when `sales_stage` absent; `status_set` always writes both. `Payment Link Failed` stays **Recoverable**, not Lost.
- **Tests (D1.1 is the contract).** `test_status_model.py`: parametrize all 10 statuses (round-trip + assert the 5 storage fields == `_status_fields(S)`); simulate-pay → Paid/owner_locked/revenue+1-once; fail → Failed/Recoverable/unlocked/revenue-unchanged. Drift guard: no API path leaves `payment_state="Paid"` with `outcome!="Won"`.
- **Deps.** After A1. **Blocks** A4 (webhook idempotency reuses the projector) and C3.

### C3 — FE status write-path fix (ship with A2) · M · P0
- **Intent.** The FE can write invalid/contradictory status fields; the corruption is **silent** because `serialize_lead` re-derives on read — bad data hides until a report or filter behaves wrongly.
- **Verified bugs.** `DealDrawer.js:189` sends `onPatch({ stage: e.target.value, payment_status: e.target.value })` where `e.target.value` is a VISIBLE_STATUS → backend maps `stage` only if in `SALES_STAGES`, `payment_status` only if in `PAYMENT_STATES`; a visible status is in **neither**, so both are written **raw**, corrupting the doc. `OverviewPanel` (`LeadDetailPanels.js:124–202`) has four selectors; its "Sales Status" selector writes `{status}` which `LeadUpdate` (694–715) has **no field for** → silently dropped; Outcome/Payment persist and can contradict the derived status.
- **Change.**
  1. **DealDrawer.js:** route the "Move status" Select through a new `patchStatus(value)` calling `PUT /leads/{leadId}/stage {stage: value}` (not `PUT /leads/{id}`). Change line 189 to `onChange={(e) => patchStatus(e.target.value)}`. Reroute `onMarkPaid` (267) to `patchStatus("Payment Link Paid")` so Won side-effects fire identically.
  2. **OverviewPanel:** **remove** the Sales-Status selector (138–142, the no-op) and the Payment-Status selector (155–164). **Replace** the legacy-STAGES "Pipeline Stage" selector with one **"Status"** selector over `meta.statuses` writing via `PUT /leads/{id}/stage`. Render **Outcome + Payment State as read-only chips**. Keep Priority/Region.
  3. **Deals.onRowAction** (`Deals.js:187–194,210–218`): `mark_paid`→`{payment_status:"Paid"}` (in PAYMENT_STATES, OK), `follow_up`→`{stage:"Contact in Future"}` (in SALES_STAGES, OK), `mark_interested`→`{stage:"Interested"}` (OK). No change; add comments pinning each string to its model set; add dev-only `assertSalesStage`/`assertPaymentStatus` console.warn helpers in `helpers.js`.
  4. **OverviewPanel / legacy vocab audit.** Replace hard-coded `PIPELINE_STAGES` user-facing labels/filters in `pages/Dashboard.js`, `pages/Deals.js`, `pages/Leads.js`, `components/lead/LeadDetailPanels.js`, `components/helpers.js` with `meta.statuses` + `meta.status_groups` from `GET /api/meta` (2905–2918). `OverviewPanel`/Dashboard buckets read `status_groups` (Active/Won/Recoverable/Lost).
- **Done when.** Status edits for "Payment Link Paid"/"No-Show"/"Not Interested"/"Changed Their Mind" produce the correct derived status on refresh and **never write a VISIBLE_STATUS into raw `stage`/`payment_status`** (verify stored doc); OverviewPanel exposes exactly one editable status control; grep for `payment_status: e.target.value` and the OverviewPanel `status:` write returns nothing; round-trips.
- **Edge/failure.** "Changed Their Mind" via `/stage` sets only `outcome` (1476–1477) — `derive_status` outcome precedence still resolves it. Concurrent edits = last-write-wins; `onChanged()`/`refresh()` after every patch narrows the window.
- **Tests.** Backend: per VISIBLE_STATUS, `/stage` then GET asserts `status==sent` and raw fields never hold a visible-status string; regression test for the old double-field write. FE smoke: drawer status cycle reflects in row badge.
- **Deps.** Pair with A2; ship together. Do **before** C4 polish; pairs with C2 (same files).

---

# M2 — Money correctness

> Before any real payment link is sent. Front-loaded because a single wrong line undercharges 100×, and silent mock fallback hides dead links.

### A3 — Multiplier floor + currency/amount/FX validation · S · P0
- **Intent.** Credit Top-Up: `credits = USD × multiplier`, multiplier 6–10, default 7.5, cap 10. Today `_resolve_credit_topup_amount` (2229) clamps `max(1.0, min(mult,10))` — floor is **1.0**, not 6 (`CREDIT_MULTIPLIER_MIN=6` at line 216 is defined but unused). Currency is free-form; `amount_usd` divides by a possibly-stale/zero FX rate.
- **Change.**
  - Fix clamp at line 2229: `mult = max(float(CREDIT_MULTIPLIER_MIN), min(float(mult), float(CREDIT_MULTIPLIER_MAX)))`.
  - `SUPPORTED_CURRENCIES = {"usd","inr"}` (near 217). In `_resolve_credit_topup_amount` (2226) and `_resolve_fixed_amount` (2252): `if currency not in SUPPORTED_CURRENCIES: raise HTTPException(400, ...)`. Add a `field_validator` on `PaymentIn.currency` (754, lower-case + whitelist).
  - FX guard in `create_payment_link` (2353–2354): `fx_rate = await get_inr_rate(); if fx_rate <= 0: fx_rate = 85.0; amount_usd = round(amount/fx_rate,2) if currency=="inr" else round(amount,2)`. Reject `inr_per_usd<=0` in `update_settings` (2778).
  - Reject non-positive amounts in both resolvers (`if amount<=0: 400`); cap absurd upper bound (`>1_000_000`).
- **G14 — preset-band contradiction (decide & document).** A3 keeps `body.credits` override and legacy `credits_*` presets "by design," but the presets bake a 2× bonus (e.g. `credits_100` = 100 credits for $20 = 5×, server.py:221) — **below the advertised 6× min**. The headline "min 6×" invariant is violated by the preset catalog itself. **Decide: either explicitly exempt presets from the band (and document it) or reprice them.** Don't leave it contradictory.
- **Done when.** `multiplier<6` → exactly 6×; `multiplier>10` → 10×; omitted → 7.5×; non-whitelisted currency → 400 (model + resolver); `amount<=0` → 400; INR `amount_usd` never divides by zero/negative; `update_settings` rejects `inr_per_usd<=0`.
- **Edge/failure.** `body.credits` override kept (legit custom deals), source of truth when supplied. Legacy fixed-credit presets routed via `legacy_fixed_credit` (2280) untouched. `amount_usd` frozen at link creation (2365), reused at webhook (2446) — no FX drift.
- **Tests.** `multiplier=1`→×6; `=10.5`→×10; omitted→×7.5; `currency="gbp"`→400; `"INR"` lower-cased+accepted; `amount=-5/0`→400; `PUT /settings {inr_per_usd:0}`→400.
- **Deps.** Independent; before A4 (webhook tests assert final `amount_usd`). Also owns **IST-aware "today"/period windows** (see failure mode #8) — make `period_window`/"today" boundaries IST-aware so evening-IST bookings aren't misattributed.

### B1 — Central credential resolver (read encrypted `integrations`, env fallback) · M · P0
- **Intent.** Admin saves keys in Settings and they take effect with no redeploy; env remains a fallback. **Root defect across all of B:** every adapter reads `os.environ` only; the Fernet-encrypted `db.integrations` (`_save_integrations` 3631) is **never read** — saving keys in the UI has **zero runtime effect.** B1 **blocks B2–B8.**
- **Targets.** `server.py`. New resolver near the Fernet block (after `_dec`, ~3606). Convert callsites: `fetch_circleback_summary` (498), `enrich_from_emergent` (614,620), `create_google_meet` (1858), `_create_stripe_link` (2294), `_create_razorpay_link` (2316,2317), `payment_status` (2409), `stripe_webhook` (2477), `_verify_razorpay_signature` (2496), `razorpay_webhook`, `_verify_calendly_signature` (2048), new SendGrid (B7).
- **Change.**
  ```python
  _SECRET_CACHE = {"ts": 0.0, "doc": {}}
  async def _org_secrets():
      now = time.time()
      if now - _SECRET_CACHE["ts"] > 30:
          doc = await _read_integration_doc("org")
          _SECRET_CACHE.update(ts=now, doc={f: _dec(doc.get(f,"")) for f in ORG_INTEGRATION_FIELDS})
      return _SECRET_CACHE["doc"]
  async def get_secret(field, *env_names):
      v = (await _org_secrets()).get(field, "")
      if v: return v
      for e in env_names:
          if os.environ.get(e): return os.environ[e]
      return ""
  ```
  Field map per adapter, e.g. `get_secret("stripe_secret_key","STRIPE_API_KEY")`. **Add to `ORG_INTEGRATION_FIELDS` (3613):** `stripe_webhook_secret`, `razorpay_webhook_secret`, `calendly_webhook_signing_key`, `google_service_account_json`, `emergent_users_api_url`, `emergent_users_api_key`, `circleback_api_url`, `sendgrid_api_key`, `from_email` (keep masked). Invalidate cache at end of `put_org_integrations` (3647): `_SECRET_CACHE["ts"]=0`. For sync-thread adapters (`fetch_circleback_summary._call` at 502, Razorpay lambda), resolve keys in the async outer scope **before** `run_in_executor`.
- **D3.2 — decouple integration encryption (adopt, don't just document).** `_fernet()` derives from `JWT_SECRET` (3596) → rotating `JWT_SECRET` makes every stored key decrypt to `""` → silent mock fallback. **Derive Fernet from a dedicated `INTEGRATION_ENC_KEY` env** (set + asserted distinct in M0). Add a startup WARN if `integrations.org` exists but all decrypts are empty.
- **Done when.** With env unset, saving a Stripe key in Settings makes `POST /payments/link` use the real path (session id no longer `cs_test_<pid>`); clearing the key reverts to mock ≤30s (or immediately on save via cache invalidation); env-injected keys still work with `integrations` empty; a key value never appears in any GET (masked); after rotating `JWT_SECRET`, stored keys still decrypt (proves decoupling).
- **Edge/failure.** Per-replica 30s cache → key change propagates fleet-wide within 30s (document). Bad/whitespace key → 401 + mock fallback (each adapter wraps in try/except).
- **Tests.** `test_integrations_resolver.py`: stored beats env; env when store empty; cache invalidation after PUT; GET masks; JWT-rotation decrypt test.
- **Deps.** None. **Blocks B2–B8.**

### B3 — Stripe USD: official SDK, cents (×100), webhook signature, idempotency · L · P0
- **Intent.** Agent sends a USD Stripe link; on payment the deal becomes Won exactly once.
- **Change.**
  - **Dependency resolution.** `emergentintegrations==0.2.0` is off-PyPI. **Chosen approach: replace with the official `stripe` SDK** for prod (add `stripe>=9.0.0` to requirements; keep `emergentintegrations` only as the platform path via `try/except ImportError`). Implement `StripeCheckoutCompat` with `create_checkout_session`/`get_checkout_status`/`handle_webhook` backed by `stripe.checkout.Session.create/retrieve` and `stripe.Webhook.construct_event`. Dev shim at `tools/dev-shims/emergentintegrations` stays for local-no-keys.
  - **CENTS BUG (most dangerous single line — pull out as its own micro-change with its own test).** `_create_stripe_link` passes `amount` in major units (line 2301) but Stripe expects the smallest unit. **Send `amount*100` for non-zero-decimal currencies.** Without this every USD charge is **100× wrong**. Enumerate zero-decimal currencies (or, per A3's whitelist, hardcode ×100 for usd/inr-paise — see G10). **No real Stripe key goes live until this is proven.**
  - **Webhook signature.** Verify via `stripe.Webhook.construct_event(body, sig, get_secret("stripe_webhook_secret","STRIPE_WEBHOOK_SECRET"))`. On `SignatureVerificationError` return **400** (not 200). Today `stripe_webhook` (2489–2491) swallows all exceptions and returns `{"received":True}` — fix it.
  - **Idempotency.** Keep the `if payment_status=="paid": return` guard (2441) — protects the revenue total. Add a `webhook_events` collection + unique index (A4) and make `payments.session_id` index **unique** (currently non-unique at 3797). Pass `idempotency_key=payment_id` to `Session.create`. Unknown `session_id` webhook → insert into a `payment_reconcile` collection + WARN (never silently drop).
- **G10 — Razorpay paise too (see B4).** If Stripe gets the fix but Razorpay doesn't, INR links undercharge 100×.
- **Done when.** With Stripe test keys + real webhook secret, completing checkout flips payment→paid, lead→Won; replay → revenue `$inc` runs **once**; invalid signature → 400, no state change; no key → simulated `cs_test_*` works.
- **Tests.** create→retrieve→paid; replay→one increment; bad sig→400; **assert amount sent == `amount*100` for USD**; reconcile a test-mode charge against the dashboard.
- **Deps.** B1. **Do cents-fix + unique index before any real Stripe traffic.**

### P2-e / B3-edge — Pin webhook/success URLs to server `PUBLIC_BASE_URL` (P0 security, miscategorized in source) · S · P0
- **Intent.** `body.origin_url` (PaymentIn 765) is **client-supplied** and currently drives `webhook_url`/`success_url` (2299–2303). An attacker sets `origin_url` to their own host → controls where "paid" callbacks are aimed.
- **Change.** Pin `webhook_url`/`success_url` to a server `PUBLIC_BASE_URL` env (set in M0). Use `origin_url` **only** for the return redirect.
- **Done when.** A payment-link request with a foreign `origin_url` → the stored/created webhook URL uses the server base, not the client value. **Deps:** B3. Fix **with** the cents conversion.

### A4 — Webhook signature + idempotency (Stripe / Razorpay / Calendly) · M · P0
- **Intent.** Webhooks are the real money/booking ingress; verify signatures, never 200 on bad sig, idempotent under provider re-delivery.
- **Current.** Stripe swallows bad sigs → 200 (fixed in B3). Razorpay `_verify_razorpay_signature` (2493) 401s only when `RAZORPAY_WEBHOOK_SECRET` set. Calendly `_verify_calendly_signature` (2045) 401s when key set, but **no idempotency** → retries create duplicate meetings.
- **Change.**
  1. Stripe fail-closed (B3): bad sig → 400.
  2. **Idempotency table.** `webhook_events` collection, unique index on `event_key`; add `("webhook_events","event_key",{"unique":True})` to index_specs (3792):
     ```python
     async def _dedupe_webhook(provider, event_id):
         if not event_id: return True
         try:
             await db.webhook_events.insert_one({"event_key": f"{provider}:{event_id}", "at": now_iso()})
             return True
         except DuplicateKeyError:
             return False
     ```
     Stripe: dedupe on `event.id`. Razorpay: `x-razorpay-event-id` header (or `payment_ent.id`). Calendly: `payload.uri` (stable per booking) → duplicate returns 200 without a second meeting; **also** `_calendly_book_meeting` checks for an existing meeting `{lead_id, scheduled_at}` before insert (second-line guard, 2103).
  3. In prod require `RAZORPAY_WEBHOOK_SECRET` and `CALENDLY_WEBHOOK_SIGNING_KEY` at boot (fail-fast). All three keep 401 from verify helpers except Stripe (fixed).
- **Done when.** Tampered Stripe body → 400, no state; same Stripe/Razorpay paid event twice → one revenue increment + one activity log; same Calendly `invitee.created` twice → one meeting; missing webhook secrets fail boot in prod; bad Razorpay/Calendly sig → 401, no write.
- **Edge/failure.** Atomic gate = unique-index insert (loser gets `DuplicateKeyError`). Out-of-order paid-then-failed: paid is terminal (2441). Missing event id → process + WARN. **Mongo unavailable during webhook → return 500 (not 200) so the provider retries** (returning 200 on unprocessed loses the event).
- **Tests.** `test_webhooks.py`: Calendly twice → one meeting; Razorpay paid twice → revenue once; Stripe bad sig → 400; Razorpay wrong sig → 401, no writes; DB-write monkeypatched to raise inside webhook → 5xx not 200.
- **Deps.** After A2 (`status_set`), A3 (`amount_usd`), B1 (resolver), P0-FLAG.

---

# M3 — Real-mode integrations & funnel fidelity

> Each integration verifiable independently. Folds in the gap-critic's funnel-fidelity tasks (G1, G2, G3, G4) that the four workstreams missed.

### B2 — Google Meet on the assigned agent's calendar (deps + IST + persist + reschedule) · M · P0
- **Intent.** Each booking produces a Meet link with the **assigned agent as organiser** (Circleback joins via the agent).
- **Change.**
  - **Add to `requirements.txt`:** `google-auth>=2.29.0`, `google-api-python-client>=2.130.0`, `google-auth-httplib2>=0.2.0`. The real Meet path is dead **purely because these are missing** (D3.5).
  - Resolve creds via `get_secret("google_service_account_json","GOOGLE_SERVICE_ACCOUNT_JSON")`.
  - `create_google_meet` returns `(hangoutLink, event_id, organiser_email)`; callers (`create_meeting` 1928, `_calendly_book_meeting` 2102) unpack and persist `gcal_event_id` + `meet_organiser`.
  - **`"timeZone": "Asia/Kolkata"` on start/end** — `datetime.fromisoformat(scheduled_at)` (1875) yields a **naive** datetime; Google needs an explicit timeZone or events shift to UTC. (Failure mode #8.)
  - **Reschedule must move the calendar event** (`reschedule_meeting` 1984 only updates Mongo today): if `gcal_event_id` present + creds configured, `events().patch(...)`; on failure log + keep DB change. One retry with 1s backoff on rate limit.
- **G11 — organiser fallback policy (decide & specify).** Seeded/real agents are on `@emergent.sh`; `with_subject(agent_email)` (1873) raises 403 if the agent isn't a real Workspace user → no Meet link → **no Circleback → no summary** (silently breaks the recording chain). **Specify the fallback: either fall back to a designated service/organiser calendar and still produce a link, OR block the booking with a clear error.** Don't ship "no link, never crash" silently.
- **Done when.** `pip install -r requirements.txt` installs google libs; with valid SA JSON + domain-wide delegation, `POST /meetings` returns `https://meet.google.com/...` on the **agent's** calendar with the agent as organiser; `gcal_event_id` stored; reschedule moves the real event; missing/invalid creds → `join_url=""`, booking still succeeds (no 500).
- **Tests.** Monkeypatch `build` → assert persisted fields; creds present but `_insert` raises → `join_url=""`, 200; reschedule → patch called with new time.
- **Deps.** B1.

### B4 — Razorpay INR go-live (INR-only guard, paise, idempotency, link-error surfacing) · M · P0
- **Intent.** INR customers pay via Razorpay; deal becomes Won once.
- **Change.** Already a real REST integration (2332) — needs B1 wiring for keys + `get_secret("razorpay_webhook_secret","RAZORPAY_WEBHOOK_SECRET")`. Idempotency via the `_apply_payment_status` paid-guard + **unique `session_id` index** (B3). Add `"reference_id": payment_id` to the create payload. Handle `payment_link.expired/cancelled` (already at 2533).
  - **G10 — paise conversion.** Razorpay amounts are in **paise** (×100). `_create_razorpay_link` (2313) passes `amount` raw. Specify the exact minor-unit conversion for **both** providers; add the Razorpay-paise assertion to tests.
  - **INR-only guard.** Payload hardcodes `"currency":"INR"` (2324) but `amount` may be USD if an agent picked USD+Razorpay. **In `create_payment_link` (2371) reject provider=razorpay with currency≠inr (400)** — chosen over silent FX conversion.
  - **Link-error surfacing.** On urllib timeout (15s, 2337) the catch falls back to a simulated link the customer can't pay. **Set `record["status"]="link_error"`** and surface "retry" to the agent rather than handing out a dead link.
- **Done when.** Real test-mode `payment_link.paid` (valid HMAC) flips lead→Won once; replay no-op; invalid HMAC→401, no mutation; keys unset → simulated `rzp_*` + `/payments/simulate` works; USD+razorpay → 400; amount sent == paise.
- **Tests.** HMAC-signed paid → 200+Won; tampered → 401; replay → single increment; USD+razorpay → 400; paise assertion.
- **Deps.** B1, B3 (unique index).

### B5 — Calendly inbound hardening (registration, signing secret, idempotency, cancel branch) · M · P0
- **Intent.** A real Calendly booking creates/updates the lead, round-robins (sticky for returning), and books the meeting with the agent as Meet organiser.
- **Change.**
  - Wire signing key via `get_secret("calendly_webhook_signing_key","CALENDLY_WEBHOOK_SIGNING_KEY")` (B1); require it in prod (fail-fast + startup WARN if token set but no signing key).
  - **Idempotency.** Extract the Calendly event URI in `_calendly_extract`, store `calendly_event_uri` on the meeting, skip insert if it exists; add an index. (Also A4's `{lead_id, scheduled_at}` second-line guard.)
  - **Registration runbook.** `POST /webhook_subscriptions` (scope=organization, events=`["invitee.created","invitee.canceled"]`, url=`{PUBLIC_BASE_URL}/api/webhook/calendly`, save returned `signing_key` in Settings).
  - **Cancel branch.** Only `invitee.created` passes today (2123); add `invitee.canceled` → mark the matching meeting `cancelled`, move the lead to Follow-up Later.
  - **No active agents** (returns `{"received":True}` and drops the booking, 2138): insert into a `pending_bookings` collection + WARN so it can be assigned manually — never lose a paid-intent booking.
- **Done when.** Signed `invitee.created` → exactly one lead + one meeting (owner sticky if existing, else round-robin, admin excluded); same webhook twice → one meeting; `invitee.canceled` cancels; bad sig → 401.
- **Tests.** Signed happy path (1/1); duplicate (1 meeting); cancel branch; no-agents → pending_bookings row.
- **Deps.** B1, B2, D3.4 (email index for dedup).

### G1 — Real campaign → booking attribution (NEW — funnel's first metric is fabricated) · M · P0
- **Intent.** "Campaign emails power users a Calendly link → user books." Reporting (`booking_drivers`, campaign opened/replied/booked) depends on real attribution.
- **Verified reality.** `send_campaign` (2172–2190) sends NO email and **fabricates** counts via `random.uniform`; it only stamps `lead.source = campaign["name"]` (2184). The inbound Calendly path (`_calendly_get_or_create_lead` 2067, `_calendly_book_meeting` 2090) **hardcodes `source:"Calendly"` and `booking_driver:""`** (2075,2097) — never reads the driving campaign, never increments `booked_count`, never carries a `booking_driver`. So even after B7, a real booking won't increment `booked_count` or link to its campaign.
- **Change.**
  - Pass a campaign/UTM token in the Calendly link (Calendly `utm_campaign`/`tracking` fields arrive in the webhook payload); `_calendly_extract` parses it; `_calendly_get_or_create_lead` sets `lead.campaign_id` + `meeting.booking_driver`.
  - On `invitee.created`, `$inc` the matching campaign's `booked_count` (and `replied_count` if modeled), keyed by the parsed `campaign_id`.
- **Done when.** A booking from campaign X increments campaign X's `booked_count` by exactly 1 and the resulting lead/meeting carry `campaign_id=X`. **Deps:** B5.

### G2 — Returning-customer reopen wiring (NEW — A2/B5 will CORRUPT won customers without this) · M · P0
- **Intent.** "Returning customers stick to original owner; credits run out → return → upsell, same owner."
- **Verified reality.** Sticky-owner works **only while `owner_id` is still set**. `_calendly_get_or_create_lead` (2069) does `find_one({"email"})` and **returns the existing lead unchanged** — no LTV re-enrich (stale numbers at the upsell moment), no re-lock/re-open, no status reset. A returning Won customer who re-books lands on a lead whose `sales_stage` is still Won — then A2/B5's `status_set("Contacted")` **overwrites the Won status, destroying the won-deal record.** `reopen_lead` (1541) is the correct path (`$inc upsell_cycles`, unlocks, resets to "Contact in Future") but **nothing wires Calendly re-bookings to it.**
- **Change.** When `_calendly_get_or_create_lead` finds an existing lead with `deals_won>0` or `stage=="Won"`, route through the **reopen** path (new upsell cycle) instead of overwriting status; re-enrich LTV (B8); preserve the original owner even if cleared (look up last owner from `ownership_history`).
- **Done when.** A returning Won customer who re-books gets `upsell_cycles+1`, keeps the original owner, has fresh LTV, and does **not** lose the prior won-deal/revenue record. **Deps:** A2, B5, B8. **This must land before B5/A2's "Contacted" rule touches returning customers.**

### G3 — Calendly booking-window validation (12:00–24:00 IST, 24 half-hour slots) (NEW — decide owner) · S · P1
- **Intent (explicit).** Window 12:00–24:00 IST, 24 half-hour slots.
- **Verified reality.** **Zero** slot/window validation anywhere (no `Asia/Kolkata`, no slot logic). `scheduled_at` is taken verbatim. D1.4 *asserts validation that doesn't exist* — the test must be fixed or the feature built.
- **Change (decide one).** **If Calendly enforces availability:** document it and **remove D1.4's slot assertion.** **If the CRM must enforce it** (manual `POST /meetings` bypasses Calendly): add a validator rejecting `scheduled_at` outside 12:00–24:00 IST or off a :00/:30 boundary with a concrete error.
- **Done when.** The chosen owner is implemented and D1.4 matches reality (no test against nonexistent behavior). **Deps:** B5.

### G4 — Reschedule cap + "Follow-ups due/overdue" surface (NEW — no-show recoverable motion) · M · P1
- **Intent.** Follow-up by email/WhatsApp/call after meetings; no-show is a recoverable bucket to chase.
- **Verified reality.** `reschedule_meeting` (1985) has **no limit** (infinite reschedules; `reschedule_status` free string). No-show sets "Follow-up Later" (1969–1973) but there is **no automated follow-up task/queue** — `next_action_at`/`next_meeting_at` set ad hoc, nothing surfaces overdue follow-ups; recoverable leads silently rot.
- **Change.**
  - Specify a reschedule cap (e.g. max 3) and the past-cap behavior (auto-no-show? flag?).
  - Add a concrete **"Follow-ups due / overdue"** surface: backend query `next_action_at < now` (role-scoped, reuse A1 ownership), FE list page/widget.
- **Done when.** Reschedules are capped with defined past-cap behavior; an agent can see their overdue follow-ups (no-show/recoverable leads are actionable). **Deps:** A1, B5.

### B9 — Integration self-test endpoints (test-connection) · M · P0
- **Intent.** Admin verifies each integration before go-live; converts silent mock-fallback failure into visible failure. This is how B2's domain-wide-delegation and B6's Circleback-id correlation get verified — land **with** B2–B5, not after.
- **Change.** `POST /api/settings/integrations/test/{name}` (admin) for `stripe|razorpay|calendly|google_meet|circleback|sendgrid|emergent_users` — each does a minimal live call (Stripe: retrieve test session/balance; Razorpay: GET an order; Google: dry-run event insert+delete; SendGrid: GET scopes; Circleback: GET a meeting; Emergent: enrich a sentinel email) returning `{ok, detail}` with the **real provider error** on failure.
- **Done when.** Each endpoint returns `ok:true` against valid test creds and a meaningful error otherwise. **Deps:** B1–B8 (the prod/demo seed guards from the source B9 already live in M0/D2.1).

### B6 — Circleback recording linkage · M · P1
- **Intent.** After a recorded call, recording link + AI summary attach to the meeting. `circleback_id` is **read (504) but never written.**
- **G12 — correlation key must be committed, not "decide later."** Source B6 says "store `gcal_event_id` until confirmed via B9 test" — that violates the blindly-executable bar. **Commit to a strategy now: match Circleback by meeting start-time + invitee email (both known without Google)** — OR mark B6 explicitly **blocked-pending-discovery and out of the go-live cut.** Do not present it as executable while undecided.
- **Change (if in cut).** Persist the chosen correlation id at booking; add outbound webhook `/api/webhook/circleback` (recording.ready/summary.ready) matching by that id, persisting `recording_url`+`summary` (add to `CSRF_EXEMPT_PATHS` 3813, HMAC via `circleback_webhook_secret`). Keep the on-read pull (2016) as fallback; make the base URL a `circleback_api_url` org field.
- **Done when.** A completed meeting's `GET /meetings/{id}` returns a real `recording_url`+`summary` (webhook or on-read pull); correlation id persisted at booking; no key → stored values, never crashes.
- **Deps.** B1, B2. **Inherits B2's G11 organiser gap** (keys on a Meet/event id that won't exist if no Workspace identity).

### B7 — SendGrid: real outbound campaign email · M · P1
- **Intent.** The blast that starts the funnel must actually deliver email with the Calendly link.
- **Change.** **REST via urllib** (chosen, minimal deps, matches Razorpay) to `https://api.sendgrid.com/v3/mail/send`; resolve `get_secret("sendgrid_api_key","SENDGRID_API_KEY")` + a `from_email` org field. New `_send_campaign_email(to, subject, html)`. When a key is configured: send real mail, set `sent_count` to actual sends, **stop fabricating `opened/replied/booked`** (init 0; opens via a SendGrid Event Webhook → `/api/webhook/sendgrid`; bookings via the **G1** attribution). No key → keep simulated metrics (demo). Throttle in batches with `asyncio.sleep`; cap recipients (`to_list(2000)`).
- **Edge.** Must include a List-Unsubscribe header + verified sender domain (SPF/DKIM in runbook) or deliverability craters. Per-recipient try/except (`failed_count`). **Resend guard:** if `status=="sent"`, require `?resend=true`. No cross-recipient PII leakage (one request per recipient / correct personalizations).
- **Done when.** With a key, `POST /campaigns/{id}/send` delivers real mail and `sent_count` reflects accepted sends; no key → simulated unchanged; one recipient failure doesn't abort the batch. **Deps:** B1, G1.

### B8 — Emergent Users enrichment (real LTV/usage, `enrichment_source` flag) · S · P1
- **Intent.** Lead cards show real LTV/usage/plan/region driving upsell prioritization.
- **Change.** Wire URL/key via `get_secret` (B1). Confirm the response contract (maps `monthly_spend/lifetime_value/region/usage_trend/plan`, 626–632); store a `raw` passthrough. 10s timeout + one retry; on failure keep the deterministic mock (635) so cards never blank.
- **Edge (important).** **Add an `enrichment_source` field** distinguishing "no record" (zeros + `enrichment_source:"none"`) from "API down" (mock) — so agents don't trust fabricated LTV in prod. Importer (`import_historical` 1706) tolerates per-row enrichment failures with backoff.
- **Done when.** Configured → real fields; unconfigured → deterministic mock (demo unchanged); slow/erroring API doesn't block lead creation; `enrichment_source` set correctly. **Deps:** B1.

### G9 — Add `call` touch channel + assert metric-neutral contract (NEW) · S · P1
- **Intent.** Intent says follow-ups by "email/WhatsApp/**call**," logged but **not used for accountability.** `touch_lead` (1601) is built to NOT change stage/priority/revenue (good), but `TouchIn.channel` is only `email|whatsapp` (1598) — **call logging is missing.**
- **Change.** Add `call` to `TouchIn.channel` (and any call-disposition fields if calls log outcome). Add a test asserting touches never mutate accountability fields. A1 already wraps `/touch` in the ownership guard.
- **Done when.** `call` is a valid touch channel; a test proves touches don't mutate stage/priority/revenue. **Deps:** A1.

### C2 — Manual assign / reassign UI · M · P0
- **Intent.** Managers have **no UI** to reassign a misrouted lead, hand a returning customer to the right owner, or trigger round-robin. Endpoints exist (`PUT /leads/{id}/assign` 1501, `POST /leads/{id}/round-robin`, admin-only) but are orphaned.
- **Change.** New reusable `frontend/src/components/dark/AssignControl.js` (`{lead, team, onAssigned}`): a Select of agents (`role==="agent"` only, to match round-robin) + a "Round-robin" button. Select → `PUT /leads/{id}/assign {agent_id}` + toast; round-robin → `POST /leads/{id}/round-robin` + toast. If `owner_locked`: Lock chip + helper, round-robin **disabled** (mirrors backend 400 at 1530), explicit assign still allowed (with a "Reassign anyway?" confirm). Render only for admins. Wire into `OverviewPanel` (Owner row) and `DealDrawer` (`DealBody`). `LeadDetail` fetches `/team` for admins.
- **Done when.** Admin can reassign from Lead detail and the Deals drawer; owner + `ownership_history` update on next load; round-robin blocked for locked leads; agents never see the control (no 403s); new owner reflected in the Deals "Owner" column and lead header.
- **Edge.** Locked override doesn't reset `owner_locked` (intended). No active agents → 400 toast. Stale/deactivated agent → 404 toast + refetch. Admin filtered out of the Select (matches rotation).
- **Deps.** **A1 must be in first** (C2 widens blast radius of by-id endpoints otherwise). `/team` exists.

---

# M4 — QA suite, migration safety & importer correctness

> Can largely run in parallel with M1–M3 implementation; the harness and migration-safety items gate the deploy. Folds in importer-correctness gaps (G7, G8).

### D1.0 — Test harness, fixtures, isolated `_test` DB · M · P0
- **Change.** `backend/tests/conftest.py`: read `MONGO_URL`/`DB_NAME`; **assert `DB_NAME` ends in `_test`** (else `pytest.exit`); `httpx.AsyncClient` bound to the ASGI app via `ASGITransport` (no live server); `clean_db` autouse fixture; `seed_minimal` (1 admin `diyea`, 2 agents `agentA/agentB`, a few leads each, no demo reseed); session-scoped `admin_client`/`agentA_client`/`agentB_client` doing login + CSRF double-submit (`csrf_protect` 3812–3826). Add `pytest-asyncio`, `httpx`, `mongomock-motor`. Split suites: `test_auth.py`, `test_status_model.py`, `test_idor.py`, `test_integrations.py`, `test_webhooks.py`, `test_migrations.py`; keep `backend_test.py` as `@pytest.mark.live` (excluded by default).
- **Done when.** `DB_NAME=emergent_crm_test pytest -m "not live"` runs green with no uvicorn + no network; non-`_test` DB name aborts; two agent clients log in concurrently with valid CSRF.
- **Edge.** CSRF cookie must be echoed (else POST/PUT 403). `mongomock-motor` may lack some aggregation operators (`/coverage`, `/dashboard`) → mark those `@pytest.mark.realdb` against an ephemeral Mongo. conftest sets a fixed test `JWT_SECRET` before importing server (else import crashes at line 51).
- **Deps.** None (foundation).

### D1.1 / D1.2 / D1.3 / D1.4 — Backend test suites · M · P0/P1
- **D1.1 status model (P0).** Table-driven: all 10 visible statuses round-trip; every legacy `(stage, payment_status)` pair → `map_legacy_stage` → `derive_status` is idempotent; writer tests (paid sets all fields + revenue once + idempotent at 2442); drift guard (no path leaves `payment_state="Paid"` with `outcome!="Won"`). **This is A2's contract.** Edge: won-without-payment, `Payment Link Failed` stays Recoverable.
- **D1.2 IDOR (P0).** **This is A1's contract** — see A1 tests. Cross-agent → 404, no state change, `simulate` can't forge revenue; lists exclude others; impersonated-admin restricted to the agent.
- **D1.3 integration adapters (P1).** Mock mode (no creds) returns simulated tuples/None/stored, no exceptions; real-mode contract monkeypatches the network boundary, asserts field mapping + fallback-to-mock on network error; Settings-wiring test (save key via `PUT /settings/integrations`, assert pickup) — **fails today, passes after B1.**
- **D1.4 webhooks (P1).** Signed→applied-once, unsigned→rejected, replay→no-op for all three. **G3 fix:** the slot-window assertion must match the G3 decision (don't assert nonexistent behavior).
- **Deps.** D1.0; D1.2 needs A1; D1.1 needs A2; D1.3 needs B1; D1.4 Calendly dedup needs D3.4.

### D1.5 / D1.6 — FE e2e + `test_result.md` · L/S · P2/P1
- **D1.5 (P2).** Playwright under `frontend/e2e/`: login → open lead → move status (new model) → send link → simulate pay → Won in the right group; assert the "Move status" request carries exactly **one** status field (catches the old dual-field bug). **Deps:** C3, D1.0 stack.
- **D1.6 (P1).** Populate `test_result.md` below the DO-NOT-EDIT END marker (never edit lines 1–~95): `backend:`/`frontend:`/`metadata:`/`test_plan:`/`agent_communication:` per the in-file schema; one entry per D1.1–D1.5 suite; define **"verified"** (see "How to use this plan"). **Deps:** D1.1–D1.5 exist.

### D2.2 — Migration idempotency + observability · S · P1
- **Change.** Keep the two every-boot backfills (`_migrate_meeting_scheduled_to_assigned` 3553, `_migrate_to_sales_status_model` 3565 — filtered + idempotent). Ordering: indexes → status backfill → provisioning → (demo seed only if demo). Add `migrations` records with `last_run`/`count` for the two backfills (don't gate; naturally no-op once converged).
- **Done when.** Running `seed()` twice → all `modified_count==0` on the second run. **Deps:** D2.1.

### D2.4 — Real-data reconciliation routine (dual-status backfill/repair) · M · P1
- **Change.** Admin endpoint `POST /admin/reconcile-status` (`require_admin`), **dry-run by default** (`?apply=false` returns the diff; `?apply=true` writes). Scans all leads: (a) backfill missing `sales_stage/outcome/payment_state` via `map_legacy_stage`; (b) repair drift (`payment_status=paid` but `outcome≠Won` → Won/owner_locked; `payment_state=Paid` with no payment record → log to an `audit_logs` report, don't silently win — ties into **G5**).
- **Done when.** On a drifted-lead fixture, dry-run lists every drift; apply converges; second apply no-op. **Deps:** D1.1 fixtures.

### G7 — Reconcile importers with the unique index (NEW — sequencing will throw mid-batch) · M · P1
- **Intent/reality.** `create_lead` (1339) already 400s on duplicate email, but `_calendly_get_or_create_lead` (2069), `_csv_row_to_lead_doc` (1619), and `import_historical` (1706) `insert_many` **without** dedup. Once `leads.email` is unique (D3.4), the importers throw `DuplicateKeyError` **mid-batch and partially import with no rollback.**
- **Change.** Specify importer behavior under the unique constraint: **upsert-by-email**, OR pre-dedup the batch, OR per-row try/except with a skipped-count report. Lowercase emails consistently across all import paths.
- **Done when.** Importing a batch containing an existing email does not throw mid-batch; a skipped/updated count is reported; no partial-insert corruption. **Deps:** D3.4.

### G8 — Importer routes Won rows through `status_set` (NEW — importer bypasses A2's single source of truth) · S · P1
- **Intent/reality.** `import_historical` (1706) sets `deals_won/total_revenue_usd/won_at/owner_locked` directly and can produce leads that violate the A2 status-model invariants from day one. No test covers importing a Won-with-revenue historical lead and asserting it round-trips through `derive_status`/`serialize_lead`.
- **Change.** Route Won import rows through `status_set`/`_status_fields` so imported data can't drift the model. Add a test importing a Won-with-revenue row and asserting consistent round-trip.
- **Done when.** Imported Won rows produce model-consistent leads (`serialize_lead["status"]` matches; no contradictory fields); the test passes. **Deps:** A2, D3.4.

### D3.3 — Real admin/agent provisioning + first-login password flow · M · P0
- **Change.** Prod: seed **only** the bootstrap admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD` with `must_change_password=True`; do **not** seed the 5 demo agents. Admin invites real agents via `POST /team` (1173) with a one-time temp password + `must_change_password`; login returns 401-with-reason until changed, routing to `POST /profile/password` (1212).
- **Done when.** Prod boot yields exactly one admin; no `emergent@12345` accounts; first login forces a change. **Edge:** admin excluded from round-robin (preserve `_round_robin_agent` exclusion at 1514), may own via reassignment. **Deps:** D2.1, D2.3.

### D3.5 — Dependency install (Stripe SDK + Google libs) · S · P1
- **Change.** Requirements: `stripe>=9.0.0` (B3), `google-auth`/`google-auth-httplib2`/`google-api-python-client` (B2), pinned. Document the Emergent-internal index/vendored wheel for `emergentintegrations` (or declare Stripe off via the simulated fallback as a go-live decision). Dockerfile pip step resolves the private package (build-arg index URL); lazy imports keep boot working without the package.
- **Done when.** `pip install -r requirements.txt` succeeds in the prod build; with creds, `POST /meetings` produces a real `hangoutLink` (mocked in D1.3); without the package, boot still succeeds. **Deps:** D1.3.

### D4.6 / D4.7 / D4.8 / A5.1 — Perf, pagination, durable lockout · S–M · P1/P2
- **D4.6 perf (P1).** Add the D3.4 compound indexes; push filtering/aggregation into Mongo where `/coverage` (2857/2859), `/campaigns` (2146), `/meetings` (1837), `/dashboard` (2701) pull up to 5000 docs into Python. Make `period_window`/"today" **IST-aware** (failure mode #8). Done when p95 on coverage/campaigns/meetings < 150ms.
- **D4.7 pagination (P2).** `limit`/`offset` (or cursor) + `total` on `GET /leads`, `/payments`, `/meetings`, `/audit-logs` with a default cap.
- **A5.1 / D4.8 durable lockout + rate limiting (P1).** Replace the in-memory `_LOGIN_FAILS` `defaultdict` (1008–1031, per-replica/lost-on-restart) with a Mongo-backed `login_attempts` counter keyed by `ip:email` + TTL index; basic rate limiting on `/auth/login` and webhooks. Done when lockout survives restart and works across replicas (11 bad logins → 429; restart → still 429 within window). **Single-replica launch may defer this with documented acceptance.**

### A5.4 / A5.7 — Password policy + JWT rotation · S · P1
- **A5.4.** Shared `validate_password_strength` (≥10 chars, must mix letters+digits) called in `create_agent` (1174) and `change_my_password` (bump 8→10). Done when weak passwords → 400.
- **A5.7.** Support `JWT_SECRETS` (comma-sep; sign with `[0]`, decode by trying each) in `get_current_user` (559) so a secret rotates without logging everyone out. Done when prepending a new secret keeps existing sessions valid. **Note:** integration-key encryption is decoupled to `INTEGRATION_ENC_KEY` (B1/D3.2), so JWT rotation no longer breaks stored keys.

---

# M5 — Deploy & go-live

### M-UX — Remaining UX polish (can follow first customers) · S–M · P1/P2
> Not gating for the first real customer; ship behind the launch. Detailed per C1/C4/C5/C6/C7.

- **C1 (P1).** Finish native dark theme on `Payments.js`, `PaymentsWidgets.js`, `AuditLog.js`, `PaymentReturn.js` (replace `bg-white`/`text-zinc-*` literals with semantic `var(--*)` classes / Primitives). **Keep the CSS shim** (`index.css:163–211`) as a documented-but-deprecated safety net. Done when all three render correctly with the shim disabled and in both themes; testids preserved.
- **C4 (P1).** **C4a** PeriodFilter on Deals (`/leads` already honors `period`/`from`/`to`, server.py:1287). **C4b** Coverage page — **surface** the fully-built `GET /coverage`/`/coverage/drilldown` as a new admin-only `/coverage` route + nav (reuse `DrillDownModal`). **C4c** CSV export — new `GET /api/leads/export` (`StreamingResponse`, reuse `_build_lead_query`+`resolve_period`, role-scoped, `csv` module quoting, `to_list(2000)` cap); enable the dead Deals Export button via `window.open`.
- **C5 (P1).** Define `animate-fadeIn` keyframe in `index.css` (fixes `ChangePasswordModal.js:37`, `TourParts.js:25`, `CampaignsParts.js:155`); add `.catch`/loading/error states to `AuditLog.js` and `Payments.js`; **delete dead files** `pages/Calendar.js`, `components/lead/LeadListWidgets.js`, `components/meetings/MeetingsWidgets.js` (grep-confirmed unreferenced; build after).
- **C6 (P1).** `Drawer` a11y (`Primitives.js:219–243`): `role="dialog"`, `aria-modal`, Escape handler, focus trap + restore; same for modals; responsive sidebar (off-canvas below `lg`); `overflow-x-auto` on dense tables; contrast/`aria-label` fixes. **Test the shadcn Select/portal interaction inside the drawer** (a focus-trap bug locks every drawer/modal at once). Drawer change lands before/with C2.
- **C7 (P1 for impersonation move, P2 for tour).** Tour content fixes (remove demo-only "reset the demo dataset" copy at `tourSteps.js:94`; add a Coverage step if C4b ships). The **impersonation route move to `/admin/*` already shipped in M0 (P0-IMP)** — C7 here is the FE tour polish + confirming `AuthContext.js` paths match.

### G13 — Notifications/reminders: explicit scope decision (NEW) · S · P2
- No email/in-app reminders for upcoming meetings, no-show nudges, payment-link-sent-but-unpaid chase, or "lead assigned to you." The motion implies an action queue; nothing notifies agents. **Decision required: build a minimal reminder surface (ties to G4's follow-ups view) OR explicitly mark notifications out of scope for v1 and record it.** Currently silently missing.

### D4.1 — Webhook URL registration · S · P0
Register `/api/webhook/stripe|razorpay|calendly` (CSRF-exempt, 3811) in each provider console at the prod domain with matching signing secrets. Confirm creators pass the right `webhook_url` (server `PUBLIC_BASE_URL`, per P2-e). **Done when** a live test event from each provider hits the endpoint, passes signature, and converges a lead. **Deps:** A5.0/D3.1.

### D4.2 — DNS / custom domain · — · P0
Point the prod domain at the backend over HTTPS; resolve the Caddy/Cloudflare 401/DNS issues noted in `PERFORMANCE_TEST_REPORT.md` before relying on those URLs. **Done when** the prod domain serves `/api/auth/me` and webhooks over HTTPS (cookies are always `Secure` → break on plain HTTP). **Deps:** D4.1.

### D4.4 — Monitoring / logging / alerting · — · P1
Structured logging to the platform sink; Sentry (or equivalent) with `APP_MODE`/release tags; alert on 5xx rate, webhook-signature failures, `seed() failed` (3825), Mongo-unreachable (3786). **Done when** a forced 500 and a bad-signature webhook both alert.

### D4.5 — Backups · — · P0
Automated Mongo backups (Atlas continuous or `mongodump` cron) with a **tested restore**; document RPO/RTO. **Done when** a restore drill recreates the DB. **Backup taken before the first prod boot** (in case the reseed guard is mis-set) and immediately before D3.4's dedup migration.

### D5.1 — Staging / UAT · — · P0
Stand up staging with `APP_MODE=demo` against a **separate** DB, mirroring prod config (real CORS origin, HTTPS, Stripe/Razorpay test mode, Calendly sandbox). Run the full D1 suite + the FE happy path. **Done when** booking→meeting→payment→Won passes end-to-end on staging with test providers. **Deps:** D1.*, D3.*.

### D5.2 — Rollout sequence (ordered — execute exactly) · — · P0
This is the risk critic's ordered execution sequence, reconciled across workstreams:

1. **M0 first, complete:** P0-FLAG → A5.0/D3.1 env asserts → D2.1 reseed guard → A5.6/D2.3 password-reset prod-skip → P0-IMP impersonation move → A5.2/D4.3 CORS → A5.3 cookies/HTTPS. **M0 GATE.**
2. **M1:** A1 IDOR → D3.4 dedup+unique `leads.email` (snapshot first) → A2 + C3 status single-writer.
3. **M2:** A3 (multiplier/FX) → B1 resolver (+ INTEGRATION_ENC_KEY decouple) → B3 Stripe cents + unique `session_id` index → P2-e PUBLIC_BASE_URL → A4 webhook fail-closed + idempotency.
4. **D4.5 backup taken before first prod boot.**
5. **First prod boot** (empty/real DB): verify **no wipe**, exactly one admin, indexes present, demo absent.
6. **M3:** B2 Meet (deps + IST + organiser fallback) → B4 Razorpay (INR guard + paise) → B5 Calendly (registration/cancel/dedup) → G1 attribution → G2 reopen wiring → B9 test-connection. Then D4.1–D4.3 webhooks/DNS/CORS live; verify ≥1 provider end-to-end.
7. **M4:** D2.4 reconciliation dry-run → apply on imported real data; G7/G8 importer fixes; D1.* suites green; D4.4/D4.6/D4.7/D4.8 monitoring/perf/pagination/lockout.
8. **M5 polish** (C-workstream, B6/B7/B8, G13 decision) behind monitoring/feature-flag.

**Must precede the first real customer** vs **can follow (monitored/flagged):**

| Must precede first real customer | Can follow |
|---|---|
| All of M0 (reseed/password/CORS/impersonation guards) | B6 Circleback, B7 SendGrid real send |
| A1 IDOR, A2/C3 status single-writer | B8 enrichment-source flag |
| D3.4 email dedup+unique index | A5.1 durable lockout / D4.8 rate-limit (if single-replica at launch) |
| A3 + B3 cents + B1 resolver | D4.6 perf / D4.7 pagination (low launch volume) |
| A4 webhook fail-closed + idempotency + PUBLIC_BASE_URL | All Workstream-C polish (C1/C4/C5/C6) except C3 |
| B2 Google Meet (the motion needs a Meet link) | C7 tour; G13 notifications |
| ≥1 payment provider verified live via B9 | The other payment provider |
| G2 returning-customer reopen (else re-bookings corrupt won leads) | G3/G4 (if Calendly enforces window; G4 follow-up surface) |

---

## Production failure modes & guards

Each with a concrete guard and the test that proves it.

| # | Failure mode (where it breaks) | Guard | Test |
|---|---|---|---|
| 1 | **Boot wipes prod data (catastrophic, verified).** `_migrate_clean_reseed_v3`→`delete_many({})` every boot, gated only by a migration key absent on fresh DBs. | `APP_MODE=production` short-circuit at the top of the migration AND `seed_demo()` not called in prod (D2.1). **Rollback compounding risk:** a prior image re-introduces the unguarded reseed. | Boot a prod-mode DB with seeded fake-real leads → collection counts byte-identical, `delete_many` never invoked (spy/mock). |
| 2 | **Webhook replay → double-Won / double-revenue / double-book.** Providers retry; Stripe swallowed bad sigs+200; Calendly no dedupe. | `webhook_events` unique-index insert as the atomic gate (A4); Stripe returns 400 on bad sig; Calendly `{lead_id, scheduled_at}` second-line guard. The paid-guard saves the revenue total but not the activity log/second meeting. | Same paid event twice → one `$inc`, one activity row; same `invitee.created` twice → one meeting; tampered Stripe body → 400, no change. |
| 3 | **Stripe 100× undercharge (verified line 2301 passes major units).** | Compat multiplies by 100 for non-zero-decimal currencies (B3). | Amount sent to `Session.create` == `amount*100` for USD; reconcile a test charge to the dashboard. |
| 4 | **Webhook URL hijack via client `origin_url`.** | Server-pinned `PUBLIC_BASE_URL` for webhook/success URLs; `origin_url` only for the return redirect (P2-e). | POST with a foreign `origin_url` → stored webhook URL uses the server base. |
| 5 | **IDOR — any agent forges revenue** (`simulate_payment` 2421 has no ownership check). | A1 `require_payment_access` → 404 for non-owners. | D1.2: agentB simulates agentA's payment → 404, `total_revenue_usd`/`deals_won` unchanged. |
| 6 | **Dual-status drift (silent).** Re-derivation on read hides corruption until a report disagrees. | `status_set` single writer (A2); FE routes visible statuses only through `PUT /leads/{id}/stage` (C3). | Round-trip every visible status; raw `stage`/`payment_status` never hold a visible-status string; D2.4 dry-run flags drift. |
| 7 | **Integration keys silently ineffective + Fernet/JWT coupling.** Adapters read env only; encrypted `integrations` never read; Fernet derived from `JWT_SECRET` → rotation → silent mock. | B1 `get_secret()` (DB>env>mock); decouple to `INTEGRATION_ENC_KEY` (D3.2); startup WARN if `integrations.org` exists but all decrypts empty; B9 test-connection + `status:"link_error"`/`enrichment_source` flags. | Stored key beats env; after rotating `JWT_SECRET`, stored keys still decrypt. |
| 8 | **Timezone / IST correctness (under-covered).** Naive `datetime.fromisoformat`; UTC "today" misattributes evening-IST bookings. | `"timeZone":"Asia/Kolkata"` on Google events (B2); IST-aware `period_window`/"today" (A3/D4.6); validate slots in 12:00–24:00 IST (G3). | A 23:30-IST booking lands on the correct IST day + "today" count; Google event shows IST. |
| 9 | **Round-robin under concurrency.** Two simultaneous Calendly bookings read the same "next agent." | Atomic assignment (`findOneAndUpdate` counter or unique-constraint retry); email-unique index (D3.4) collapses duplicate-lead races. | Fire N concurrent Calendly webhooks for distinct emails → even distribution, no double leads/owners. |
| 10 | **Secure-cookie + CORS lockout.** Cookies always `Secure`; `*`+credentials invalid. | HTTPS end-to-end; explicit `CORS_ORIGINS` allowlist enforced at boot (M0). | Non-listed origin blocked; real FE origin works with cookies; `/api/auth/me` returns the cookie over the prod domain. |
| 11 | **Multi-replica in-memory lockout.** Per-replica, lost on restart. | Mongo/Redis `login_attempts` with TTL (A5.1). | 11 bad logins → 429; restart the app object → still 429 within window. |
| 12 | **Mongo unavailable mid-webhook.** Returning 200 drops the event → payment lost. | Return 500 (not 200) on DB failure so the provider retries. | Monkeypatch the DB write to raise inside the webhook → 5xx, not 200. |

---

## Go-live checklist (go/no-go)

Every item is a hard gate; any **NO = no-go**.

**Tier 0 — Data safety (verify on staging first, then prod pre-boot)**
- [ ] `APP_MODE=production` set; boot log echoes it. *No-go if unset (defaults to demo = destructive).*
- [ ] Prod-mode boot against a DB with fake-real leads: zero `delete_many`, zero password mutation, exactly one admin, no demo leads/account. (D5.1)
- [ ] `clean_reseed_believable_v4` migration key present in `migrations` (so old code can't re-wipe on rollback).
- [ ] **Full Mongo backup taken and restore drill completed BEFORE first prod boot** (D4.5).

**Tier 1 — Auth / network**
- [ ] `JWT_SECRET` ≥32 chars, not a default; boot fails fast otherwise.
- [ ] `INTEGRATION_ENC_KEY` set and distinct from `JWT_SECRET` (decoupled).
- [ ] `CORS_ORIGINS` = explicit FE origin, not `*`; boot rejects `*` in prod.
- [ ] HTTPS end-to-end; `/api/auth/me` returns the `Secure` cookie over the prod domain.
- [ ] `/demo/reset`→403; impersonation moved to `/admin/impersonate` and working; no `emergent@12345` accounts; first-login forces a password change.

**Tier 2 — Correctness**
- [ ] `pytest -m "not live"` green on a `_test` DB (conftest aborts if DB name lacks `_test`).
- [ ] IDOR suite (D1.2) green — cross-agent → 404, no state change, `simulate` can't forge revenue.
- [ ] Status round-trip suite (D1.1) green — all 10 statuses; no raw field holds a visible-status string.
- [ ] `leads.email` unique index EXISTS (not swallowed); dedup migration ran; duplicate insert rejected.
- [ ] Importers don't throw mid-batch under the unique index (G7); Won import rows route through `status_set` (G8).

**Tier 3 — Money / integrations (verify live with B9 test endpoints)**
- [ ] Stripe cents conversion proven (test charge reconciles to dashboard).
- [ ] Webhook signatures enforced; bad sig → 4xx; replay → single revenue increment (all 3 providers).
- [ ] `webhook_url`/`success_url` use server `PUBLIC_BASE_URL`, not client `origin_url`.
- [ ] ≥1 payment provider (Stripe USD or Razorpay INR) end-to-end: link → pay → Won, exactly once.
- [ ] Provider webhooks registered at the prod domain with matching signing secrets; one live test event from each converges a lead.
- [ ] Google Meet produces a real `https://meet.google.com/...` link with the agent as organiser and `timeZone=Asia/Kolkata`; reschedule moves the real event; organiser fallback decided (G11).
- [ ] Razorpay rejects USD deals (INR-only guard); paise conversion correct; link-create failure surfaces `link_error`, not a dead link.
- [ ] Campaign→booking attribution real (G1): a booking from campaign X increments X's `booked_count` and carries `campaign_id=X`.
- [ ] Returning Won customer re-book reopens (G2): `upsell_cycles+1`, original owner kept, fresh LTV, won record preserved.

**Tier 4 — Ops (can be partial at launch if single-replica + monitored)**
- [ ] Monitoring/alerting on 5xx rate, webhook-signature failures, `seed() failed`, Mongo-unreachable.
- [ ] Durable login lockout + rate limiting (or documented single-replica acceptance until A5.1 lands).
- [ ] IST-correctness check: a 23:30-IST booking lands on the right IST day in calendar + "today" count.
- [ ] **Lifetime Access = $15,000** in `PRESET_PACKAGES`; Annual Pro $1,999 / Dedicated Support $3,499 confirmed-or-still-placeholder noted (G15).
- [ ] Credit presets repriced to ≥6× (G14); Circleback deferred to backlog (G12, not in cut); notifications v1 = follow-ups queue only (G13).

---

## Rollback plan

The app is a single image, so rollback = redeploy the prior tag — **but the prior image contains the unguarded reseed and the 100× Stripe bug**, which makes naive rollback dangerous. Rules (ordered, drilled):

1. **Snapshot before the one irreversible step.** Take a Mongo snapshot immediately before the D3.4 dedup+unique-index migration (it merges/deletes duplicate leads) — the only data-destructive forward step; everything else is additive or env-flag-reversible.
2. **Config-level rollback first (instant, no redeploy).** Most issues are recoverable by env: flip a feature flag, correct `CORS_ORIGINS`, disable a payment provider by clearing its key in Settings (B1 makes this take effect ≤30s). Prefer this over image rollback.
3. **Image rollback guardrails (mandatory pre-checks).** Before redeploying any prior tag:
   - Confirm `APP_MODE=production` remains set (or the old code's demo path wipes data).
   - Confirm `clean_reseed_believable_v4` exists in `migrations` (or old code's `_migrate_clean_reseed_v3` fires).
   - **If rolling back past the Stripe cents fix, disable Stripe (clear key) first** — otherwise you resume 100× undercharging silently.
4. **Money-path rollback is one-way-careful.** Never roll back the webhook idempotency table or the `payments.session_id` unique index while live payments are in flight (losing them re-enables double-counting). If you must, pause inbound webhooks at the provider during the window.
5. **DB restore drill.** A documented `mongorestore` from the pre-go-live backup (and the pre-D3.4 snapshot) must be tested on staging before launch, with measured RTO/RPO. Restoring must be paired with re-asserting the migration-key/flag pre-checks in (3) so the restored DB isn't immediately re-wiped.
6. **Per-phase reversibility.** M0 = env flips (instant). M1 IDOR/status = additive code (forward-fix preferred — rolling back re-opens IDOR). M1 index = snapshot-restore. M2–M3 integrations = disable via Settings key-clear. The sequence front-loads the irreversible/destructive work behind guards and a backup so that by the time real customers transact, the only rollback you should ever need is a config flip.

**The single most important rule:** never let an older image boot against the live DB without first verifying `APP_MODE=production` and the reseed migration-key are intact. That one check is the difference between a clean rollback and an irrecoverable data wipe.

---

## Resolved decisions (LOCKED 2026-06-19)

Every prior open decision is locked. Execute these directives — no further product input needed.

| Id | Decision | LOCKED resolution → plan directive |
|---|---|---|
| **G15** | Product prices | **Lifetime Access starts at $15,000 USD** — update `PRESET_PACKAGES` (228–232). Annual Pro **$1,999** / Dedicated Support **$3,499** remain placeholders; keep the go-live checklist line to confirm them before real customers. |
| **Stripe dep** | `emergentintegrations` vs official SDK | **Keep `emergentintegrations` as the PRIMARY path** (Brian continues building on Emergent's platform). Add the official `stripe` SDK only behind `try/except ImportError` as an **off-platform fallback** so it never interferes on-platform. B3's cents fix + webhook-signature + idempotency apply to whichever path is active. |
| **WhatsApp** | real send vs log-only | **Log-only for v1.** G9: add the `call` channel; email/WhatsApp/call are logged touches (no send). No WhatsApp provider wired. |
| **Calendly model** | org vs per-user | **Single shared team Calendly org**; agents = org members; **one org-scoped webhook subscription** (`invitee.created` + `invitee.canceled`). Drives B5 registration + the round-robin/organiser mapping. |
| **G3** | Calendly window owner | **Calendly is the source of truth** for the 12:00–24:00 IST half-hour slots; the CRM adds a **soft validator only on the manual `POST /meetings` path** (reject off-grid manual bookings). Remove D1.4's assertion against nonexistent CRM-side slot enforcement. |
| **G4** | Reschedule cap | **Max 3 reschedules per meeting.** Past the cap: auto-set priority "Follow-up This Week" + surface in the follow-ups queue. **No** auto-no-show. |
| **G5** | Phantom-Won | **A lead can reach "Payment Link Paid" ONLY via a paid payment record** (incl. the **Manual** provider — agent logs amount + marks paid). `status_set("Payment Link Paid")` is reachable only from `_apply_payment_status`; the drawer/lead "Mark paid" must **create a Manual payment**, not set status directly. Revenue and Won never diverge — no `won_without_payment` bucket needed. Resolves A2's G5 contract. |
| **G6** | Leaderboard attribution | **Revenue credits to the owner at payment time** (the closer). Reassigning a Won lead does **not** move historical revenue. Add the reassign-a-Won-lead attribution test (D1.1). |
| **G11** | Meet organiser fallback | If the assigned agent has no Google Workspace identity, **fall back to a designated service/organiser calendar and still produce a Meet link** (log a WARN). Never silently no-link (keeps the Circleback chain intact). |
| **G14** | Credit presets vs 6× floor | **Reprice the `credits_*` presets to ≥6×** (221+) so the catalog honors the headline minimum. No promo exception. |
| **G13** | Notifications v1 | **v1 = the "Follow-ups due/overdue" queue only** (G4). The richer in-app reminder surface (upcoming meetings, link-sent-but-unpaid chase, no-show nudge, "lead assigned to you") is a **documented POST-LAUNCH enhancement** (Brian to build later) — see Post-launch backlog; **not** in the go-live cut. |
| **G12** | Circleback | **Deferred to post-launch.** Keep the manual `recording_url`/`summary` field for v1. **Move B6 out of the go-live cut** (mark P3/backlog); remove the Circleback row from the Tier-3 checklist. |

### Post-launch backlog (explicitly out of the go-live cut)
- **G13** richer in-app/email reminder surface (Brian to build).
- **B6** Circleback auto-linkage (match by meeting start-time + invitee email).
- **B7** real SendGrid send / **B8** enrichment-source can follow if not ready.
- Real prices for Annual Pro / Dedicated Support (confirm).
- **A5.1/D4.8** durable lockout + rate limiting if launching multi-replica.

---

### Decision rationale (for reference — now resolved above)

| Id | Decision | Why it matters |
|---|---|---|
| **G15** | **Real prices** for Annual ($1999), Support ($3499), Lifetime ($5999) — flagged PLACEHOLDER, hardcoded in `PRESET_PACKAGES` (228–232). | Shipping placeholder prices to a real team is a revenue error. Add a go-live-checklist confirmation. |
| **G14** | **Preset credit-band policy** — `credits_*` presets bake a 2× bonus (e.g. 5×, below the advertised 6× min the floor fix guarantees). Exempt presets from the band (document) or reprice. | The headline "min 6×" invariant is otherwise violated by the catalog itself. |
| **G3** | **Calendly window ownership** — does Calendly enforce 12:00–24:00 IST / 24 half-hour slots, or must the CRM validate it (manual `POST /meetings` bypasses Calendly)? | D1.4 currently asserts validation that doesn't exist. Decide before that test can pass. |
| **G4** | **Reschedule cap** (e.g. max 3) and past-cap behavior (auto-no-show? flag?). | Currently unlimited; undefined behavior the executor would otherwise have to invent. |
| **G5** | **Phantom-Won policy** — forbid manual "Payment Link Paid" without a paid payment record, or add `won_without_payment` and bucket it separately in revenue/leaderboard. | A manually-Won, $0-revenue lead silently inflates Won counts vs revenue. |
| **G6** | **Leaderboard attribution rule** — revenue credited to current owner vs owner-at-payment-time; how reassigned/locked/impersonated deals attribute. | Comp rides on this; under-specified today. Add a test for reassigning a Won lead. |
| **G11** | **Google Meet organiser fallback** when an agent has no Workspace identity — fall back to a service/organiser calendar (still produce a link) or block booking with a clear error. | "No link, never crash" silently breaks the Circleback recording chain. |
| **G12** | **Circleback correlation strategy** — commit to start-time + invitee-email matching, or declare B6 out of the go-live cut. | Without a committed key, B6 is not blindly executable. |
| **G13** | **Notifications/reminders** — build a minimal reminder surface (ties to G4) or explicitly mark out of scope for v1. | The motion implies an action queue; nothing notifies agents today. |
| — | **Calendly account model** — single org webhook subscription vs per-user; confirm `scope` and which calendars/agents map to which Calendly users. | Drives B5 registration and the organiser/round-robin mapping. |
| — | **WhatsApp provider** — intent lists WhatsApp follow-ups; no provider is wired (touch logs the channel only). Confirm the provider (e.g. Twilio/Meta Cloud API) or keep WhatsApp as log-only for v1. | Determines whether G9's `whatsapp` touch is a real send or a manual log. |
| — | **`emergentintegrations` availability off-platform** — vendored wheel/private index, or accept the official `stripe` SDK as the prod path (B3 default) with the simulated fallback when absent. | Determines whether Stripe is live or simulated at launch. |
