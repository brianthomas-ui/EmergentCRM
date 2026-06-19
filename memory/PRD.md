# Emergent Labs Upsell CRM — PRD

> ⚠️ AUTHORITATIVE SPEC = `/app/EMERGENT_HANDOFF.md` (dark "Emergent Dark Sales Console").
> The sections below this changelog are LEGACY (pre-redesign, light theme) — defer to the handoff.

## Changelog
### 2026-06-19 — FULL code-quality refactor batch (user: "Yes full batch")
Behavior-preserving refactor. Backend 48/48 pytest pass; frontend regression (iter_9) 100% pass, dark theme intact, zero runtime errors.
**Backend (`server.py`) — complexity reductions:**
- `_resolve_payment_amount()` (cx 37) → dispatcher + `_is_credit_topup()`, `_resolve_credit_topup_amount()`, `_resolve_fixed_amount()`.
- `dashboard()` (cx 50) → `_deal_value()`, `_attach_derived_status()`, `_compute_group_counts()`, `_compute_product_revenue()`, `_today_meeting_buckets()`.
- `create_lead()` (cx 21) → `_maybe_enrich_lead()`, `_resolve_referral()`, `_backfill_package()`.
- `calendly_webhook()` (cx 19) → `_verify_calendly_signature()`, `_calendly_get_or_create_lead()`, `_calendly_book_meeting()`.
- Removed unused `pydantic.Field` import.
**Frontend — component extractions (new files) + size reductions:**
- DealDrawer.js (cx45) → DealFooter/DealProfile/DealTimeline + buildTimeline helper.
- LeadModals.js PaymentModal (cx25) → CreditFields/FxNote + lineDefaults/creditPreview helpers.
- NewLeadModal.js (cx23) → LeadFields/ReferralPicker.
- Deals.js 453→315 (components/deals/DealsParts.js: DealsSummary/DealsFilters/DealsTable).
- Leads.js 479→208 (components/leads/LeadsParts.js: KpiCard/TodaysMeetings/RecentNotes/LeadsTable).
- Campaigns.js 605→123 (components/campaigns/CampaignsParts.js: KPIs/charts/table/sidebar/modal).
- Meetings.js 751→220 (components/meetings/MeetingsParts.js: TimeGutter/DayColumn/MeetingDrawer/AgentPill + helpers).
- LeadDetail.js 677→245 (components/lead/LeadDetailPanels.js: LeadProfileHeader/NotesPanel/TasksPanel/OverviewPanel).
- Inline chart-config props hoisted to module constants in Team.js & Campaigns.js.
**Note:** review's "undefined vars", "26 `is` comparisons", and most "missing hook deps" were verified FALSE POSITIVES and intentionally not changed.

### 2026-06-19 — Code-review pass #3 (env 8940ca30, re-send)
- ✅ Fixed empty catch in `AuthContext.js` logout (now `console.warn`, session still cleared) — applied prior round.
- ✅ **Refactored `_resolve_payment_amount()` (complexity 37 → thin dispatcher)** into `_is_credit_topup()`, `_resolve_credit_topup_amount()`, `_resolve_fixed_amount()`. Behavior-preserving; all 48 backend tests pass.
- ❌ Re-confirmed FALSE POSITIVES: `backend_test.py:145` is `is not None` (correct); `Deals.js:130` useCallback has correct empty deps (`e` is the inline catch param); zero real literal-`is` comparisons exist; the named hook "missing deps" are vars declared inside the hooks or intentional eslint-disables that prevent infinite loops.
- ⏭️ Still deferred (large effort / higher regression risk): `dashboard()` (cx 50) refactor, frontend component splits (Deals/Meetings/Campaigns/LeadDetail/Leads), DealDrawer/NewLeadModal/PaymentModal splits, inline-prop memoization.

### 2026-06-19 — Code-review pass (env 8940ca30)
- ✅ Fixed 6 array-index React keys → stable keys (Team/Campaigns donut Cells by name, Dashboard recent-activity by id, DealDrawer timeline, Meetings grid slots descriptive keys).
- ✅ Removed unused `pydantic.Field` import.
- ❌ Declined as FALSE POSITIVES: backend "4 undefined variables" (pyflakes finds none; every `_resolve_payment_amount` return path assigns amount/currency/desc, else-branches raise) and "26 `is` comparisons" (all are correct `is None`/`is not None`; changing to `==` would be wrong).
- ⏭️ Deferred (high regression risk, no functional benefit): complexity refactors of dashboard()/create_lead()/etc., oversized-component splits (Deals/Meetings/Campaigns/LeadDetail/Leads), the 45 hook-dependency warnings (mostly stable module imports; blanket changes risk infinite render loops), and inline-prop memoization. Available on request.

### 2026-06-19 — "Fix Everything" batch (this session)
- 🔴 **P0 FIX — backend was crash-looping on startup**: previous agent's `lifespan` called an undefined `_run_startup()`. Renamed the `@app.on_event("startup")` handler to `_run_startup()` and removed the duplicate `on_event` startup/shutdown handlers (lifespan owns startup + `client.close()`). This was the root cause of the user's "app stops working after sign in" report. Verified login → /auth/me → dashboard now works.
- 🔴 **P0 FIX — self avatar upload/remove** (`Layout.js`): now POSTs `{data_url}` for upload and `DELETE /profile/avatar` for removal (was sending wrong field `avatar_url` + POSTing null).
- 🔴 **P0 FIX — admin rep-avatar remove** (`Team.js` `RepAvatarCell`): removal now calls `DELETE /team/{id}/avatar` (was POSTing empty string → 400).
- 🔴 **P0 FIX — `GET /api/activities/recent`** added (dashboard recent-activity feed; was 404). Enriched with actor + lead_name; agent-scoped.
- 🟠 **`GET /api/leads/notes/recent`** added (Leads sidebar recent-notes; was 404).
- 🟠 **Dashboard FX accuracy**: `_deal_val` now uses the admin-managed `settings.inr_per_usd` rate instead of hardcoded `/85.0`.
- 🟠 **CSRF**: added `/api/webhook/razorpay` to `CSRF_EXEMPT_PATHS` (was being blocked).
- 🟡 **Tech debt**: deleted dead pages `Pipeline.js`, `Coverage.js` + orphaned components (`coverage/CoverageWidgets.js`, `dashboard/DashboardWidgets.js`) and removed their routes from `App.js`.
- 🟡 **Tests**: fixed `test_stripe_preset_usd` (accepts real Stripe URL when key present). **48/48 backend pytest pass.** Frontend regression (testing agent iter 8): all 7 flows pass, both P0 avatar flows confirmed.
- ⏸️ **PAUSED (user request)**: Team leaderboard "Add-ons" (won×2) & "Payment Links Sent" (won+leads×0.1) fabricated columns — left as-is pending user clarification.

### Backend fixes already present from prior batch (verified)
- DELETE avatar routes, Razorpay webhook handler, CORS hardening, brute-force login lockout, regex escaping on lead search.

## Problem Statement
Web CRM for an inside sales team (4–10 agents + 1 sales head) to convert existing power users ($50–$200/mo) into $1,000–$5,000 plans. Replaces Google Sheets + Calendly with a centralized system for booked-meeting routing, account context, pipeline tracking, and payment links.

## Architecture
- **Frontend:** React (CRA + craco), Tailwind, shadcn/ui, lucide-react, sonner. emergent.sh-inspired light theme (General Sans, monospace-texture background, pill buttons, blue→indigo gradient accents).
- **Backend:** FastAPI (single server.py, /api prefix), JWT Bearer auth (localStorage `crm_token`).
- **DB:** MongoDB (uuid string ids). Collections: users, leads, meetings, activities, payments, campaigns, audit_logs, counters, settings.

## Roles / Users
- **Sales Head (admin):** Diyea — diyea@emergent.com / leader123
- **Agents:** Aryan, Deepin, Vinay, Brian — *@emergent.com / agent123

## Implemented (current)
- **Coverage & Burn analytics (admin):** coverage by usage tier (toggle Monthly Spend / Lifetime Value) and by region (NA/Europe/APAC/LATAM/MEA/Other) as stacked bars (Uncovered→Assigned→Met→Advanced→Won); burn-up line (cumulative total vs covered vs won); region breakdown table; revenue rolled up in USD. Endpoint `/api/coverage`.
- **Sticky sales ownership (hard lock):** Won leads lock to their owner; future meetings auto-route to that owner; round-robin blocked on locked leads; admin can still manually reassign. Repeat revenue tracked per lead (total_revenue_usd, deals_won, upsell_cycles).
- **Reopen for upsell/cross-sell:** Won/Lost leads can start a new opportunity (Upsell/Cross-sell/Renewal) keeping the same owner; logs activity + audit.
- **Region** field on leads (create form, detail edit, CSV import).
- Auth + RBAC (admin vs agent scoping on all data).
- Lead/account workspace: profile, account context panel, activity timeline, notes (Note/Call Outcome/Follow-up), ownership history, priority tags (Hot/Follow-up/Payment Pending), duplicate-email guard, CSV import.
- Assignment: manual + round-robin + reassignment (traceable).
- Pipeline: 8-stage kanban with drag-drop; stage/priority controls on lead detail.
- Meetings: manual/Calendly intake, today filter, outcome (completed/no-show+reason/cancelled, reschedule status) with stage automation.
- **Booking driver tracking:** capture the hook that got each lead to book (Support, Lifetime Access, Top-Up Credits, Discount, Pricing/Upgrade, Feature Request, Renewal, Onboarding Help, Other); Meetings "Driver" column + filter; dashboard "What's Driving Bookings" widget (meetings/completed/won per driver).
- Payments: Stripe LIVE (test mode) + Razorpay SIMULATED links, preset packages + custom amounts. **Multi-currency (USD/INR)** — each payment stores amount, currency, amount_usd, fx_rate. **Admin-editable FX rate** (INR per USD, default 85) via settings. All revenue/dashboards/leaderboard reported in USD.
- Campaigns (admin): segmented Gmail mail-merge (SIMULATED) with sent/opened/replied/booked metrics + source attribution.
- Dashboards: KPIs, target tracking, pipeline funnel, today's meetings, priority queues, agent leaderboard, booking-driver analytics.
- Audit log (admin) incl. update_fx_rate, assignments, campaign sends.

## Integrations status
- **Stripe:** LIVE (test key sk_test_emergent) — real checkout links + status polling/webhook.
- **Razorpay / Calendly / Gmail:** SIMULATED for V1.

## Backlog (P1/P2)
- P1: Real Calendly webhooks; real Gmail two-way/reply parsing; auto no-show → follow-up queue after TTL.
- P1: Live FX feed option (auto-refresh rate) alongside manual override.
- P2: Lead scoring by usage/spend; AI meeting summaries; mobile notifications; advanced campaign A/B analytics; pagination on list endpoints; modularize server.py into routers.

## Design System (Emergent rebrand — Jun 2026)
Clean, minimal "Emergent" identity. Blueprint at `/app/design_guidelines.json`. Key rules:
- **Monochrome zinc/black/white**, NO gradients anywhere (removed `bg-gradient-brand` / `text-gradient`). Single accent = emerald only for positive money/won signals; rose/amber for danger/warning status.
- Tokens in `index.css`: `--radius: 0.5rem` (→ rounded-md 6px, rounded-lg 8px), `--ring`/`--primary` = near-black. `slate-*` globally replaced with `zinc-*`.
- **Badges** (helpers.js): outline style — `bg-white` + 1px border + colored TEXT only, `font-mono uppercase tracking-wider` (no filled "rainbow" pills).
- **Buttons/inputs** (Modal.js): black primary (`bg-zinc-950`), white outline secondary, black focus ring, `rounded-md`, `active:scale-[0.98]`.
- **Sidebar** (Layout.js): zinc-50 surface, black square "e" logo (no gradient), active nav = white card + border + shadow. Mono "EMERGENT LABS" sublabel.
- **Login** (Login.js): centered white card, no gradients, mono-uppercase field labels, dashed mono "Demo credentials" box with click-to-fill (`demo-fill-sales-head` / `demo-fill-agent`).
- **Charts** (Coverage.js): monochrome zinc ramp for stacked bars, monochrome burn-up lines, stark black tooltips.

## Deployment status (as of Jun 2026)
- Production custom domain **emergentcrm.com** returned platform "Application not found" (router-level) — deployment/domain mapping was torn down (user mentioned an internal "sweep"). NOT an app-code issue; deployment readiness check PASSES. Resolution = redeploy (Deploy → Deploy Now), verify on default `*.emergent.host`, then re-link custom domain via Entri.
- **Backend auth/seed HARDENED (Jun 2026)** so the earlier production 401 cannot recur on a fresh Atlas DB:
  - Startup now does a **MongoDB ping-with-retry (5×2s)** before seeding (handles Atlas cold start); index creation + `seed()` wrapped in try/except so the app still serves even if either fails.
  - `seed()` is **idempotent across replicas** via `_safe_insert()` (swallows `DuplicateKeyError` on concurrent admin/agent inserts); admin creds fall back to `diyea@emergent.sh`/`leader123` if env vars are missing in prod, and the admin password self-heals.
  - `/api/auth/login` adds **diagnostic logging** (user-not-found vs password-mismatch vs DB error) while keeping a generic 401 to clients; DB errors now return 503 (retryable) instead of a misleading 401.
  - bcrypt `_pw_bytes()` truncates to 72 bytes (no ValueError on long inputs); `verify_password` tolerates malformed/empty hashes.
  - Regression test: `/app/backend/tests/test_auth.py` (9 tests, all pass).
  - NOTE: httpOnly-cookie auth migration remains DEFERRED (P1); app still uses Bearer token in localStorage.

## Code-review fixes (Jun 2026)
Applied from automated code-quality report:
- **Perf**: `AuthContext` value now `useMemo` + `useCallback` (stable context ref); Coverage chart `dot` objects hoisted to a module const (`LINE_DOT`).
- **Backend complexity refactor** (behavior-preserving, verified via curl + 9 pytest): `dashboard()` → `_revenue()`, `_booking_driver_stats()`, `_agent_leaderboard()`; `coverage()` → `_cov_blank/_cov_group_stats/_cov_week_start/_cov_weekly_burnup/_cov_persist_snapshot`; `seed()` → `_seed_admin/_seed_agents/_seed_demo_leads/_seed_coverage_history`. `Counter` moved to top-level import.
- **Tests**: replaced `is True/False` boolean asserts with plain truthiness in `tests/test_auth.py` + `tests/backend_test.py`.
- **Keys**: `BackgroundTexture` documented positional key (static decorative list).
- **Demo creds**: Login demo-account hints (NOT secrets — they map to seeded demo users) are now hideable in production via `REACT_APP_SHOW_DEMO_LOGINS=false` (defaults to shown).

### Triaged as FALSE POSITIVES / intentionally NOT changed
- "server.py:269 undefined `user`" — no genuinely unbound `user`; all usages are `Depends(get_current_user)` params. No defensive code added (would be over-engineering).
- "15 missing hook deps" — flagged effects already use the documented `eslint-disable-next-line react-hooks/exhaustive-deps` (mount-only fetches) or proper `useCallback` deps (PaymentReturn). Listed deps like `r`, `data`, `attempt`, `client` are callback params / stable module imports, not reactive deps.

### DEFERRED (with rationale)
- **localStorage → httpOnly cookies** (P1): explicitly deferred by user; needs coordinated FE+BE change + full re-test cycle.
- **Remaining frontend component splits** (Dashboard / Leads / Coverage / Meetings / Payments, P2): working + fully tested; lower priority than LeadDetail. Can follow in a dedicated, individually-tested cycle.
- **TypeScript / Python type hints**: large separate initiative.

## Code-review fixes — Round 2 (Jun 2026)
- **Security (recurring "hardcoded creds" flag, resolved)**: Login demo accounts moved OUT of source into `REACT_APP_DEMO_LOGINS` (JSON env var, parsed in Login.js). Demo box auto-hides if the var is absent (e.g. production). No credentials remain hardcoded in `Login.js`.
- **Frontend complexity (LeadDetail, was complexity 42 / 449 lines)**: SPLIT into `src/components/lead/LeadPanels.js` (LeadContextPanel, LeadMeetingsList, LeadPaymentsList, LeadActivityTimeline) + `src/components/lead/LeadModals.js` (PaymentModal, ReopenModal, MeetingModal); `LeadDetail.js` is now ~250-line orchestration. All data-testids preserved.
- **Backend complexity**: `import_leads` → `_csv_row_to_lead_doc`/`_csv_float`; `create_payment_link` → `_resolve_payment_amount`/`_create_stripe_link`; `_seed_demo_leads` → `_build_demo_lead`/`_seed_demo_meetings`. Behavior-preserving (curl + 35/35 pytest verified).
- **Hooks**: added the documented `eslint-disable-next-line react-hooks/exhaustive-deps` on AuthContext's mount-only effect.
- **Verified**: testing agent iteration_5 — backend 35/35 pytest pass, frontend 0 regressions across LeadDetail (all sub-panels + 3 modals), env-driven login, payments, and full nav RBAC.

### Round-2 FALSE POSITIVES (confirmed, no change)
- `server.py:270` "undefined user" — `user` is guaranteed defined past the 401 early-returns.
- `server.py:366` & `tests/backend_test.py:145` "is vs ==" — both are `is not None`, which is the CORRECT use of `is` (PEP8).
- "`<span>` inside `<option>`" hydration warning — no such markup exists in source; all `<option>`s contain plain text/strings.

## Test Status
- iteration_1: 22/22 backend + UI verified.
- iteration_2: 28/28 backend + UI verified (booking drivers, FX/multi-currency, new team).
- iteration_3: 35/35 backend + UI verified (coverage analytics, sticky ownership, reopen, region). Fixed a missing fxRate useState in LeadDetail.
- iteration_4: Frontend regression after Emergent visual rebrand — 100% pass, 0 console errors, no functional regressions (login, nav RBAC, dashboard, leads, lead detail, meetings/outcome modal, payments, coverage charts, team, campaigns, audit).
- iteration_5: Post-refactor regression (LeadDetail split + env-driven demo creds + backend import/payment/seed extractions) — backend 35/35 pytest pass, frontend 0 regressions across all LeadDetail sub-panels + 3 modals, login, payments, nav RBAC.
