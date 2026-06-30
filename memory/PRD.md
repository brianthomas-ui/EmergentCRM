# Emergent Labs Upsell CRM — PRD

> ⚠️ AUTHORITATIVE SPEC = `/app/EMERGENT_HANDOFF.md` (dark "Emergent Dark Sales Console").
> The sections below this changelog are LEGACY (pre-redesign, light theme) — defer to the handoff.

## Changelog
### 2026-06-30 — Chrome-like browser TABS replace modal drill-downs + density/dark polish + meetings→Jul 10
Frontend testing agent iteration_19 = **100% (all 15 review items pass), 0 functional bugs**. Verified across demo + real admin, incl. workspace isolation.
- **Browser-style TAB system (desktop)**: replaced all data-drill-down MODALS with a persistent, kept-alive (state-preserving) tab strip rendered below the top of the content area; sidebar stays. New infra wired in: `TabsProvider` (App.js), `TabStrip` + keep-alive `TabHost` in desktop `Layout.js`, `useOpen` hook (openPage/openLead/openDrill/openAgent/openPayment), `registry.js` (type→view). Sidebar (`SidebarParts.js`) now drives tabs via `openPage`; active highlight follows the active tab. A URL→tab safety-net effect (depends only on stable `openTab`+pathname) lets any `<Link>`/navigate land as a tab. `/payment-return` stays a bare route. Mobile keeps route-based single-view (useOpen falls back to navigate).
- **New tab views**: `pages/DrillView.jsx` (metric/teamstat/payments drill tables, sortable), `pages/AgentView.jsx` (profile, won-vs-target, KPI tiles, pipeline-by-stage, assigned-leads), `pages/PaymentView.jsx` (full payment detail). `LeadDetail.js` accepts a `leadId` prop so it renders inside a tab. Dashboard KPIs + Top Agents, Team KPIs + rep names, Payments summary + rows all open TABS now (input dialogs New Payment Link / Add Agent remain modals per `design_guidelines.json`).
- **Per-user tab isolation**: tab set persisted in localStorage keyed `crm_tabs_v1:<userId>` and reset on identity change — demo/real workspaces never inherit each other's drill/agent/payment tabs.
- **Density + dark polish**: reduced desktop container padding (px-6/8→px-5/6, py-6/8→py-5/6); standardized headings to text-2xl. **Payments page + `PaymentsWidgets.js` fully converted light→dark** (summary cards, table, FX card, lead-picker modal).
- **Demo meetings extended through 2026-07-10**: `_seed_demo_meetings` `end_day = max(today+7, 2026-07-10)`; reseeded demo (840 leads / 638 payments / 13,644 meetings; 133 meetings/day on Jul 9 & 10).
- Backlog (optional, from testing agent): a11y `role="dialog"`+testid on PaymentModal; tab-strip right-edge fade when 10+ tabs overflow; sync active tab → URL for shareable deep links.

### 2026-06-29 — Date refresh + free-input multiplier + clickable grouped numbers
Testing agent iter_17/iter_18 = frontend 100% after fixing one missing useState. Backend curl + 5 multiplier pytest pass.
- **Demo data refreshed to "today" (29 Jun 2026)**: reseeded the demo workspace (841 leads / 640 payments / 13,098 meetings); newest leads now dated 2026-06-29. June seed factor bumped 0.72→0.97 (month-end near-complete). `POST /api/demo/reset` re-anchors all relative dates to `now`.
- **Payment multiplier — slider → free numeric input** (`LeadModals.js` CreditFields): rep types any value. **Stern amber warning above 8×** (`multiplier-warning`), **red error + disabled Generate button above 15×** (`multiplier-error`, `generate-payment-btn` disabled). Backend `CREDIT_MULTIPLIER_MAX` 10→**15** (MIN stays 6 floor); verified 12→12, 50→clamp 15. Updated cap tests in `test_payments_import.py` + `test_golive.py`.
- **Clickable grouped numbers (drill-downs)**: Payments summary cards Collected/Pending/Links Sent (`pay-summary-*`) now open `PaymentsBreakdownModal` listing the exact payments behind each total (paid-only / non-paid / all), lead names link to the lead. Team KPI cards Deals Won / Payment Links Paid / Meetings Held / Avg Conversion (`team-kpi-*`) open `TeamStatModal` with a per-rep breakdown. (Dashboard KPIs + Workspace tiles already drilled down.)
- **Fix**: added missing `breakdown` useState in `Payments.js` (was crashing the route).

### 2026-06-29 — Roadmap FRONTEND wired (Forecast, AI Assist, Win/Loss, real team stats)
Backend for these was already built+verified; this session surfaced them in the React UI. Testing agent iteration_16 = frontend 100%, 0 bugs (fixed 1 pre-existing primitive bug).
- **Pipeline Forecast widget** (`components/dashboard/ForecastWidget.jsx`, `GET /api/forecast`): committed + probability-weighted-open vs target, attainment % pill, target progress bar, weighted-by-stage breakdown. Rendered on the **Dashboard** (after KPIs) AND the agent **My Work** page. Verified: $396k committed / $216k weighted / $612.1k forecast / 98.7% attainment.
- **AI Assist** (`AiAssistPanel` in `components/lead/LeadDetailPanels.js`, `POST /api/leads/{id}/ai-assist`): right-column panel on Lead Detail with "Draft follow-up email" + "Summarize account" buttons (real Claude Sonnet 4.6 via Emergent key, ~10-20s) + copy-to-clipboard. Verified: email returned 'Subject: …' draft, summary returned bulleted brief.
- **Win/Loss analytics** (`components/team/WinLossPanel.jsx`, `GET /api/analytics/winloss`, admin only): win rate, won/lost, funnel, loss-reason breakdown — section below the Team leaderboard. Verified: 94.1% win rate, 449 won / 28 lost.
- **Real leaderboard stats**: Team "Add-ons" (paid txns) & "Payment Links Sent" columns now read `stats.add_ons` / `stats.payment_links_sent` from `/api/team?period=…` instead of fabricated formulas. Demo-fallback rows updated to include these fields.
- **Fix (testing agent)**: `components/dark/Primitives.js` `TR` now forwards `...rest` (incl. `data-testid`) — `lead-row-{id}`/`team-row-{id}` testids were silently dropped.

### 2026-06-29 — Mobile visual optimization pass (responsive polish, no logic change)
Self-verified on real 390px iPhone + 1440px desktop renders (Playwright + vision critique). Mobile scores went from "cramped/tiny" to Dashboard 8/10, Leads 8/10, Team 9/10; desktop confirmed unchanged.
- **Root cause**: the whole console was authored with desktop micro-typography (9–11px) and tight spacing — technically responsive (no overflow) but read as a shrunk desktop on phones.
- **Mobile design system** (`index.css`, `@media max-width:1023.98px`, scoped to `<main>` + `[role="dialog"]` so desktop/login/fonts/palette are untouched): bumped the tiny type utilities to comfortable phone sizes (10px→12px, 11px→12.5px, text-xs→13px, text-sm→14.5px, text-2xl→~30px), looser line-heights, reduced over-tracking on mono overlines, +padding inside cards, larger grid gaps, 16px inputs (no iOS zoom) at 44px min-height, tactile `:active` feedback. Implements `/app/design_guidelines.json`.
- **Targeted fixes**: Dashboard "Revenue by Product" now stacks donut-over-full-width-legend on mobile (no truncated names); wider pipeline labels; KPI cards taller. Leads filter bar → full-width search + 2-col select grid on mobile. Buttons get a taller mobile tap target (`max-lg:py-2.5`). **Team leaderboard**: the 8-column horizontal-scroll table is now a clean mobile **card list** (rank, avatar, name, won revenue, target progress bar, 4-stat row) below `lg`, table preserved on desktop.


### 2026-06-23 — P0: Absolute Demo/Real workspace isolation + Slack real-payment alerts
Both features verified by testing agent (iteration_15): **20/20 backend tests + frontend smoke pass, 0 bugs**. Real workspace left clean (0 leads/payments/meetings/activities).
- **Workspace isolation (`is_demo` flag)**: every user/lead/payment/meeting/activity/saved_view/coverage_snapshot carries `is_demo`. New helpers `_ws`, `_lead_scope`, `_agent_scope` and hardened guards `_owns_lead`/`require_lead_access`/`require_meeting_access`/`require_payment_access` (compare `is_demo` BEFORE the admin check → even managers get 404 across workspaces). Every list/create/access path is workspace-scoped. `log_activity` inherits `is_demo` from the lead.
- **Two isolated teams**: REAL (`is_demo=false`) = Diyea (mgr) + Aryan/Dipan/Vinay/Brian/Abhishek; DEMO (`is_demo=true`) = Demo Manager (demo@emergent.sh) + Western-name agents Olivia Hayes, James Carter, Sophia Bennett, Noah Brooks, Liam Foster. Demo dataset (793 leads) now owned by DEMO agents. **Real workspace starts EMPTY** (clean slate for the team). Login page advertises only the "Demo View" button (no credentials shown).
- **Migrations**: `_migrate_tag_workspaces` (all modes, non-destructive) tags users/records; `_migrate_demo_isolation_v1` (DEMO/preview only, one-time, IS_PROD-guarded) wipes legacy mixed sample data for a clean reseed. `_wipe_demo_data`/`/api/demo/reset` now delete ONLY `is_demo=true` — real data is never touched. Leads unique index changed to compound **(email, is_demo)** so the same email can exist in both workspaces.
- **Slack Incoming Webhook** (`slack_webhook_url` org integration, masked at rest): `_notify_slack_payment` posts Customer / Amount (USD/INR) / Product / Sales Agent / Payment ID / timestamp / deal link to Slack. Fires ONLY for REAL paid payments via `_apply_payment_status(notify=True)` (Stripe + Razorpay webhooks, Stripe status poll, manual mark-paid). **Demo payments and Simulate-payment NEVER fire** (early-return on `record.is_demo` + simulate omits `notify`). Non-blocking (try/except) — a Slack failure never breaks the payment flow. Settings page has a "Slack — payment alerts" card with Save + Test (`data-testid=settings-slack`). Added `PUBLIC_BASE_URL` to backend/.env so the Slack deal link resolves.


### 2026-06-23 — Backend tests (payments/import) + final mobile QA (deploy-ready)
- **Backend tests**: new `backend/tests/test_payments_import.py` (25 tests) covering credit-top-up multiplier pricing + 6x/10x clamping, INR→credits conversion, legacy fixed-credit presets, custom-amount-overrides-preset (agent discount), currency/amount/rail validation guards, manual mark-paid→Won, simulate→Won+credits persisted, and the historical import preview→commit→dedupe→update-existing semantics + email-linking + per-row error reporting + templates/RBAC. **Full suite: 98/98 pass** (73 prior + 25 new). Cleaned all TEST_ artifacts from the demo DB afterward.
- **Final mobile QA** (testing agent iteration_14, 390x844): 6/6 mobile flows pass — mobile shell, Global Search overlay, right-anchored Notification panel (on-screen), /leads tappable cards (bulk checkboxes correctly desktop-only), Settings go-live checklist + Test button toast. ZERO horizontal overflow on every route, zero non-401 console errors. No code changes required.
- Status: feature-complete & verified. Pending only user action: **Save to GitHub** + **Deploy** (agent cannot trigger). Reminder: swap the placeholder Stripe test key for a valid `sk_test_*` for clean live demos.

### 2026-06-23 — Backlog frontend (Search, Bulk, Saved Views, Notifications) + Settings go-live
Backend endpoints already existed (curl-verified). Built the FE; testing agent iteration_13 = 100% (7/7 flows), 0 bugs, 0 console errors.
- **Global Search** (`components/layout/GlobalSearch.jsx`): debounced (250ms, >=2 chars) cross-entity search via `GET /api/search` → grouped Leads/Meetings/Payments dropdown; click navigates. Desktop = sidebar input; mobile = top-bar icon → full-screen overlay.
- **Notifications** (`components/layout/NotificationBell.jsx`): bell + count badge + panel via `GET /api/notifications` (follow-ups due + no-shows), polls 60s; click item → lead. Sidebar (desktop) + mobile top bar.
- **Bulk Lead Actions** (`components/leads/BulkBar.jsx` + checkbox column in `LeadsParts.js`): per-row + select-all checkboxes (don't trigger row nav); bulk bar with Assign (admin) / Set status / Delete (admin) / Clear → `POST /api/leads/bulk`. Leads.js fetches `/team` for the assign picker.
- **Saved Views** (`components/leads/SavedViews.jsx`): per-user named filter presets via `GET/POST/DELETE /api/views`; save current filters, apply, delete. Header dropdown on /leads.
- **Settings go-live expansion** (`pages/Settings.js`): exposes ALL 17 backend `ORG_INTEGRATION_FIELDS` grouped into 7 providers (Stripe, Razorpay, Calendly, Circleback, SendGrid, Google Meet/Calendar, Emergent Users API) with help text + per-provider **Test** button (`POST /settings/integrations/test/{name}`) + a **Go-live checklist** card showing Configured/Not set per integration.
- Minor: `Primitives.TD` now forwards rest props (checkbox cell stopPropagation); saved-view delete icon visible on touch/focus (was hover-only).

### 2026-06-23 — Code-quality fixes (post-sync)
Applied genuine structural/perf/security fixes from the review; skipped verified false positives. Backend 73/73 pytest pass; frontend compiles; Deals/DealDrawer render verified.
- **Backend**: refactored `import_historical()` (cyclomatic ~62) into pure builders (`_import_build_lead/payment/meeting`) + per-type async handlers + a `_IMPORT_HANDLERS` dispatch — thin endpoint, same behavior (verified: 1 created / 1 skipped-with-error on a 2-row CSV).
- **Frontend perf**: `useMemo` for DealDrawer timeline (`buildTimeline`) + move-status filter, and LeadDetail OverviewPanel status filter.
- **Frontend robustness**: replaced empty `catch{}` with `console.warn` in ThemeContext, Tour, Layout (×2), Login, InstallApp (×2). Stable React keys in Settings import preview/errors + Login peek-chart.
- **Skipped (verified FALSE POSITIVES — would break app or are non-issues):** 71 "missing hook deps" (intentional eslint-disables preventing refetch loops), 41 "is vs ==" (all correct `is None`), "weak random" `server.py` (deterministic `Random(42)` demo seed — `secrets` would break determinism), localStorage "insecure storage" (theme/install/tour flags are non-sensitive), inline motion-config objects (over-engineering), component-split re-flags (Deals/Layout/DealDrawer/NewLeadModal/Tour already modular). Payment-fn refactor deferred (financial code, avoid churn pre-redeploy).
- Reset preview demo data to pristine enriched dataset (802 leads / 587 payments / 12,357 meetings, no TEST).

### 2026-06-23 — GitHub sync (Claude Code) + redeploy prep
- Fast-forwarded preview `/app` to `origin/main` (commit `d21a2e9`) — clean FF, no work lost. Pulled in user's Claude Code work: marketing landing page, demo data enrichment (~252 leads, $394k closed, all 4 product lines populated), mobile PWA app-shell + install button, broadened test-lead purge. `.env` gitignored (untouched).
- Deployment readiness: added `memory/test_credentials.md` to `.gitignore`. CORS flagged by deploy agent but **intentionally kept as explicit allowlist** (app uses httpOnly-cookie auth; `allow_origins="*"` would force `allow_credentials=False` and break login). Production domain already allowlisted.
- Verified merged app compiles + renders on desktop (dashboard, sidebar, View-as, theme toggle all intact). User to click Deploy to push to production (agent cannot deploy).

### 2026-06-20 — Major feature batch (revenue fix, demo views, theme, settings, import)
Backend pytest passing; frontend iteration_12 = 100% (9/9 review flows). All verified end-to-end.
- **Revenue-by-Product bug FIXED**: `_compute_product_revenue` now derives product line from lead/package when a payment's is blank and buckets unknowns into "Other" so cards reconcile with Revenue Closed (protects real data, not just demo).
- **Believable demo reseed**: `_seed_demo_leads` generator — realistic companies/contacts, varied created dates (new + older in-pipeline + won across weeks), conversation notes, meetings, payments w/ product_line. Diyea (manager) also sells. Agents: Brian/Aryan/Vinay/Dipan/Abhishek. `POST /demo/reset` (admin) + one-time clean-reseed migration.
- **My Work page** (`/workspace`, `GET /api/workspace`): agent command center — follow-ups due, today's meetings, payment pending, needs-attention (stale), recent conversations + 6 stat tiles.
- **Demo Manager/Agent view toggle**: secure JWT impersonation (`POST /demo/impersonate` + `/demo/stop-impersonate`, `imp_by` claim). Admin sidebar "View as agent" dropdown + amber banner + Back to Manager. RBAC scopes via effective role.
- **Light mode**: clean light tokens, dark stays default, toggle in sidebar (localStorage `crm_theme`), dark-safety pass scoped to dark-only + light accent remap.
- **Role-specific deep tours**: separate Manager (11-step) and Agent (10-step) tracks in `tourSteps.js`.
- **Settings page** (`/settings`): org API keys (Stripe/Razorpay/Calendly/Circleback/SendGrid) + per-agent keys, Fernet-encrypted at rest (key from JWT_SECRET), masked on read; FX rate; Reset demo data.
- **Historical import** (`POST /import/historical`): leads + payments + meetings CSV, auto column-mapping, dedupe (leads by email), preview-then-commit UI in Settings.
- Demo password externalized to `.env` (`DEMO_PASSWORD`); `Layout.js` nav `useMemo`; backend complexity refactors (dashboard_drilldown dispatch table, list_team/list_leads/update_lead/razorpay_webhook helpers).

### 2026-06-19 — Code-quality batch #5 (P0/P1 + full P2 refactor)
Behavior-preserving. Backend 48/48 pytest pass + curl-verified endpoints; frontend regression (iter_11) 100% (8/8 flows), zero regressions.
- **P0 — demo password externalized**: `server.py:_seed_demo_account` now reads `DEMO_EMAIL`/`DEMO_PASSWORD` from backend `.env` (defaults preserved). No credential literal remains in source. (Note: this is the *advertised* demo login, not a true secret — externalized for cleanliness.)
- **P1 — Layout perf**: role-filtered sidebar nav is now `useMemo`'d (`visibleNavItems`); the JSX `filter().map()` no longer recomputes every render.
- **Frontend splits**: `Layout.js` → `components/layout/SidebarParts.js` (`SidebarNav`, `SidebarUserCard`); `Tour.js` → `components/tour/TourParts.js` (`Spotlight`, `TourCard`, `tourCardStyle`). All data-testids preserved exactly.
- **Backend complexity reductions** (all behavior-preserving): `list_team` → `_team_member_stats`; `list_leads` → `_build_lead_query` + `_apply_lead_status_filters`; `update_lead` → `_apply_lead_update_mappings`; `razorpay_webhook` → `_verify_razorpay_signature` (dedup w/ calendly pattern); `dashboard_drilldown` (cx ~13 if/elif chain) → `_DRILL_HANDLERS` dispatch table + `_drill_prefixed` (status:/group:/stage:).
- **NOT changed** (re-confirmed false positives): `_calendly_extract`, `NewLeadModal.js`, `DealDrawer.js` were already modularized in prior batches; the linter's "undefined vars", "is vs ==", and "52 missing hook deps" remain intentional/correct.
- **Non-blocking nits (deferred)**: ChangePasswordModal lacks Escape-to-close; pipeline-by-stage drilldown bar lacks a `data-testid`.
- **Leaderboard "Add-ons"/"Payment Links Sent" columns**: still PAUSED (user answer was contradictory — to confirm).

### 2026-06-19 — 7 feature requests (post-production-deploy)
All verified: frontend regression iter_10 = 100% (7/7), backend 48/48 pytest pass.
1. **Meetings "chopped top" fixed** — replaced the viewport-locked `height: calc(100vh-64px)` root with a normal-flow header + bounded internal-scroll calendar (`h-[calc(100vh-260px)]`). Header + drawer fully visible at 1920x800 and 1440x768.
2. **Meeting Show / No-Show / Reschedule** — MeetingDrawer now has Mark Show / No-Show (+ notes) and a datetime Reschedule. Backend: new `PUT /api/meetings/{id}/reschedule`; reuses existing `PUT /meetings/{id}/outcome`.
3. **Click lead from a meeting** — drawer "View {lead}" button navigates to `/leads/:id`.
4. **Password reset + self-service change** — all team accounts reset to `emergent@12345` via one-time guarded migration `reset_team_passwords_emergent12345_v1`; removed per-boot password self-heal on team accounts so self-service changes persist; new `POST /api/profile/password` + ChangePasswordModal (sidebar "Password" button).
5. **Guided tutorial tour** — dependency-free `Tour.js` spotlight tour; auto-starts on first login (localStorage `crm_tour_v1_done`), replay via sidebar "Take a tour".
6. **Single demo account** — `demo@emergent.sh` / `demo12345` (admin, self-healed each boot, sees all demo data); login page now advertises ONLY this credential (via `REACT_APP_DEMO_LOGINS`).
7. **Custom payment links from Payments page** — new "New Payment Link" button → lead picker → PaymentModal (custom amount/line). (Backend already supported it; the gap was a missing entry point.)
ADMIN_PASSWORD env updated to emergent@12345; agent seed default → emergent@12345; test fixtures updated.
⚠️ PRODUCTION: these are in PREVIEW only — user must REDEPLOY. On redeploy the migration resets prod team passwords to emergent@12345 (once) and creates the demo account.

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
