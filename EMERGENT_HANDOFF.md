# Emergent Upsell CRM — Build & Handoff (read this first)

> This document assumes **no prior context**. It fully describes the app so it can be
> built, run, and extended from scratch. This is the authoritative spec; the older
> `memory/PRD.md` and `design_guidelines.json` are historical (pre-redesign) — defer to
> this file and the mockups in `docs/visual-spec/` where they differ.

---

## 1. What this is

A **B2C inside-sales "upsell" CRM** for **Emergent Labs**. A small team (1 sales head +
~5 agents) converts existing Emergent power users into bigger commitments: **credit
top-ups, Annual Pro, Dedicated Support, Lifetime Access**. Leads are **individual people**
(name + email always; phone/company sometimes), not companies.

**The real sales motion the app models:**
1. Marketing **campaigns** email power users with a Calendly link (the sales head Diyea's
   common round-robin link).
2. A user books a slot (booking window 12:00–24:00 IST, 24 half-hour slots).
3. The booking is **round-robined** to an agent (availability + next-in-line; Diyea = admin,
   not in rotation). **Returning customers stick to their original owner.**
4. A **Google Meet** is created on the **assigned agent's** calendar (agent = organiser).
5. The meeting happens (recorded via **Circleback**); ~15 min discovery, then a soft,
   time-bound sell.
6. Follow-up by email / WhatsApp / call (logged, not used for agent accountability).
7. The agent sends a **Stripe or Razorpay payment link**; on payment the deal is Won.
8. High repeat rate (credits run out → they return → upsell, same owner). **LTV** is pulled
   from the Emergent Users DB.

---

## 2. Tech stack

- **Frontend:** React (CRA + **craco**), Tailwind, shadcn-style UI, lucide-react, recharts,
  sonner, axios. Source in `frontend/`. Dev: `craco start` (port 3000). Build: `craco build`.
- **Backend:** **FastAPI**, single file `backend/server.py`, all routes under `/api`. Auth =
  **httpOnly JWT cookie + double-submit CSRF** (`jwt`, `bcrypt`). Run with `uvicorn server:app`.
- **DB:** **MongoDB** (Motor async driver; uuid string ids). Collections: `users`, `leads`,
  `meetings`, `activities`, `payments`, `campaigns`, `audit_logs`, `counters`, `settings`.
- Emergent base image (see `.emergent/emergent.yml`): `fastapi_react_mongo_shadcn`.

---

## 3. How to run

```bash
# MongoDB must be reachable (local or hosted); set MONGO_URL accordingly.

# Backend
cd backend
cp .env.example .env            # set MONGO_URL, DB_NAME, JWT_SECRET, CORS_ORIGINS
pip install -r requirements.txt # (numpy/pandas/boto3/etc. are unused at runtime; the
                                #  app only needs fastapi, uvicorn, motor, pymongo,
                                #  pydantic[email], bcrypt, pyjwt, python-dotenv, python-multipart)
uvicorn server:app --host 0.0.0.0 --port 8001

# Frontend
cd frontend
cp .env.example .env            # set REACT_APP_BACKEND_URL=http://localhost:8001
yarn install
yarn start                      # http://localhost:3000
```

The backend **seeds demo data on startup** (idempotent) and runs a status migration. It is
**demo-safe with zero integration keys** — every integration falls back to a mock.

**Demo logins** (seeded; `@emergent.sh`): `diyea@emergent.sh / leader123` (admin / sales
head); agents `brian@emergent.sh`, `aryan.f@emergent.sh`, `dipan@emergent.sh`,
`vinay.p@emergent.sh`, `abhishek@emergent.sh` — all `agent123`.

---

## 4. Environment variables

Required: `MONGO_URL`, `DB_NAME`, `JWT_SECRET`, `CORS_ORIGINS` (set to the frontend origin,
e.g. `http://localhost:3000`; do not use `*` with cookie auth in production). Frontend:
`REACT_APP_BACKEND_URL`.

**Optional integration keys — each activates a real integration; absent = mock/demo (never
crashes):**

| Var | Powers | Demo fallback |
|---|---|---|
| `STRIPE_API_KEY` | Stripe Checkout payment links | local simulated payment-return URL |
| `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` | Razorpay Payment Links | simulated link |
| `CALENDLY_WEBHOOK_SIGNING_KEY` | verify Calendly `invitee.created` webhook | accepts unsigned |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | create Google Meet on the agent's calendar (agent = organiser) | mock join URL |
| `CIRCLEBACK_API_KEY` | auto-pull meeting summaries | recording_url/summary stay manual |
| `EMERGENT_USERS_API_URL` (+ `EMERGENT_USERS_API_KEY`) | pull LTV / monthly spend / region by email | deterministic per-email mock |

Webhook URLs to register once live: `{APP_URL}/api/webhook/stripe`,
`{APP_URL}/api/webhook/razorpay`, `{APP_URL}/api/webhook/calendly`.

---

## 5. Data model

**Lead** (the core record): `name, email, phone, company, region, usage tier,
monthly_spend, lifetime_value, product_line, owner (agent), source, referred_by_lead_id +
referred_by_name`, and the **three status fields** below. **Meeting**: `lead, agent,
scheduled_at, duration, status, join_url, recording_url, summary (Circleback)`. **Payment**:
`lead, agent, provider, amount, currency, amount_usd, fx_rate, credits, boost_credits,
multiplier, payment_status, session_id, payment_link`. Plus `users, campaigns, activities,
audit_logs`.

### Status model (separated, not one flat enum)
- **stage** (active journey): `New / Needs Review`, `Contacted`, `Interested`,
  `Contact in Future`, `Payment Link Sent`
- **outcome** (terminal/semi): `` (open), `Won`, `No-Show`, `Not Interested`, `Changed Their Mind`
- **payment_status**: `Not Sent`, `Link Sent`, `Paid`, `Failed`

The 10 visible statuses each map to a badge tone via `STATUS_META` (served from `/api/meta`).
**Reporting groups:** Active Pipeline / **Won** (Payment Link Paid) / Recoverable (No-Show,
Payment Failed, Changed Their Mind) / Lost. (Do **not** reintroduce the legacy `Meeting
Scheduled` stage — it was removed; `Assigned` ≡ meeting booked.)

---

## 6. Products & pricing

Four **product lines** (default currency **USD**; INR is a per-deal override):

| Product line | Pricing |
|---|---|
| **Credit Top-Up** | **credits = USD amount charged × multiplier**, where multiplier is **6–10, default 7.5, absolute max 10** (clamped server-side). e.g. $200 × 7.5 → 1,500 credits. |
| Annual Pro Subscription | fixed **$1,999** *(placeholder — confirm real price)* |
| Dedicated Support | fixed **$3,499** *(placeholder)* |
| Lifetime Access | fixed **$5,999** *(placeholder)* |

`credit_multiplier {min:6, default:7.5, max:10}` is served from `/api/meta`. The payment
modal shows a multiplier slider + live computed credits for Credit Top-Up; the other three
are fixed (editable to discount). Stripe (intl/USD) + Razorpay (INR) + Manual providers.

---

## 7. Pages (all dark "Emergent Dark Sales Console" theme)

Sidebar: **Dashboard, Leads, Campaigns, Meetings, Deals, Team** (+ Payments, Audit Log).
Coverage is intentionally hidden. Reference mockups: `docs/visual-spec/mockup-1..7.png`.

- **Dashboard** (mockup-1): KPI cards (revenue, open pipeline, meetings today, payment
  pending, no-shows, conversion) — each opens a drill-down; revenue-by-product donut;
  high-contrast pipeline-by-stage; recent activity; today's meetings; top agents.
- **Deals** (mockup-2): the hero — **table-first pipeline** (not kanban). Product cards,
  stage-summary strip, filters (search/product/status/provider/owner-mine), dense table
  (Lead, Product, Amount, Provider, Status, Owner, Last activity, Next action, Created,
  contextual Action), and a **row-detail drawer**. "Send Payment Link" opens the payment modal.
- **Leads** (mockup-3) + **Lead detail** (mockup-4): leads table + referral picker; rich
  profile with overview, payment links, activity timeline (incl. Circleback), notes/tasks/meetings.
- **Meetings** (mockup-5 + Google-Calendar feel): a **week/day time-grid** like Google
  Calendar; event blocks; **manager has an agent toggle**, agents see only their own.
- **Campaigns** (mockup-6): campaign performance, leads-by-channel, table.
- **Team** (mockup-7): rep leaderboard, stage conversion, workload, avatar upload.

**Time-period filter** (Today / This Week / This Month / This Quarter / Custom) scopes the
metrics on Dashboard / Deals / Team / Campaigns (backend `?period=&from=&to=`).

**Avatars:** default to **initials**; users can upload a picture (`POST /api/profile/avatar`),
admins can set a rep's (`POST /api/team/{id}/avatar`); visible to all.

---

## 8. Design system

Dark premium SaaS: near-black/slate background, slightly lighter surfaces, subtle borders,
near-white primary text, muted gray secondary, **emerald accent**, amber warning, rose/red
destructive, blue/cyan info. Emergent "e" logo (`frontend/public/emergent-logo.jpeg`),
"INSIDE SALES" wordmark. No heavy animated backgrounds. Status badges follow the `STATUS_META`
tone map. Initials avatars by default.

---

## 9. Key API surface (`/api`)

`POST /auth/login`, `GET /auth/me`, `POST /auth/logout` · `GET /meta` (statuses, status_meta,
product_lines, credit_multiplier, booking_drivers, regions) · `GET/POST/PUT /leads`,
`/leads/{id}` (+ `/notes`, `/stage`, `/enrich`, `/touch`, `/assign`) · `GET /customers` ·
`GET/POST /meetings`, `GET /calendar` · `GET /payments`, `POST /payments/link`,
`/payments/status/{id}`, webhooks `/webhook/{stripe,razorpay,calendly}` · `GET /campaigns` ·
`GET /team`, `POST /team/{id}/avatar`, `POST/DELETE /profile/avatar` · `GET /dashboard`
(+ `/dashboard/drilldown?metric=`) · `GET /coverage` (unlinked) · `GET /audit`.

---

## 10. For Emergent: what to do

1. **Build & run** per §3 (FastAPI + React + MongoDB; matches the `.emergent` base image).
2. It works immediately in **demo mode** (seeded data, mock integrations). To go live, add
   the keys in §4 — no code changes needed.
3. Replace the **placeholder USD prices** (§6) for Annual Pro / Dedicated Support / Lifetime
   Access with the real ones.
4. Match the UI to `docs/visual-spec/mockup-1..7.png` if regenerating any page.
5. Preserve: the separated stage/outcome/payment_status model, the Credit Top-Up multiplier
   rule, sticky ownership + round-robin, demo-safe fallbacks, and the dark theme.
