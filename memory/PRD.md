# Emergent Labs Upsell CRM — PRD

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

## Test Status
- iteration_1: 22/22 backend + UI verified.
- iteration_2: 28/28 backend + UI verified (booking drivers, FX/multi-currency, new team).
- iteration_3: 35/35 backend + UI verified (coverage analytics, sticky ownership, reopen, region). Fixed a missing fxRate useState in LeadDetail.
