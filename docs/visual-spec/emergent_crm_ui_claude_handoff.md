# Emergent CRM UI Rebuild — Claude Handoff

## 0. What this handoff is for

Build a cleaner, more credible **Emergent Labs Inside Sales CRM** UI for the existing `/Users/brian/EmergentCRM` demo/reference app.

The app is meant for inside sales reps and managers converting existing Emergent users from low monthly spend into bigger packages: credit top-ups, annual pro subscription, dedicated support, and lifetime access.

This is not an Obsqura CRM redesign. Some uploaded Obsqura files are useful as UX patterns, but do not import Obsqura business rules, college funnel stages, or college-specific language into this Emergent demo unless Brian explicitly asks later.

---

## 1. Current known project state

Repo/context:

- Project: `emergent-crm`
- Local repo: `/Users/brian/EmergentCRM`
- Branch at last save: `main`
- Last known commit: `57b3be8 Finish Emergent CRM handoff polish`
- Frontend at save time: `http://localhost:3000`
- API at save time: `http://localhost:8001`
- No git remote configured.
- Working tree was clean after commit.

Completed functionality already in the app:

- Removed stale `Meeting Scheduled` stage across backend, frontend constants, dashboard funnel, pipeline, and tests.
- Dashboard drill-down modal/API exists for revenue, open pipeline, meetings today, no-shows, payment pending, and stage rows.
- Coverage drill-down API exists for usage tier and region cells.
- Calendar route/API exists with admin per-agent schedule view and agent-scoped view.
- Referral capture exists:
  - `/customers` endpoint for existing/won customers usable as referrers.
  - Lead create payload stores `referred_by_lead_id` and `referred_by_name`.
  - New lead modal has searchable referral picker.
  - Backend cross-logs referral activity when possible.
- Payment fallback is hardened:
  - Stripe link creation simulates a local payment-return URL without `STRIPE_API_KEY`.
  - Stripe status/webhook handlers do not crash in demo mode or failed live integration mode.
- Tests were previously passing: backend full suite `48 passed, 23 warnings`; frontend `yarn build` passed.

Known caution:

- Browser screenshot capture previously timed out twice, likely due to heavy animated/noisy background layer. Functional browser selector checks passed. Prefer reducing/removing heavy animation on the new CRM shell.
- Keep real integrations behind keys and mock/demo fallback working without keys.

---

## 2. Brian’s UI preference from the supplied screenshots

Brian attached two reference screenshots and gave explicit direction.

### Screenshot 1 — light pipeline/table CRM

What to extract:

- Brian prefers this **table-first pipeline** over kanban.
- Revenue by product cards at top are useful.
- Filters above the table are useful: status filter, product filter.
- Table columns are useful: Lead, Product, Amount, Provider, Agent/Owner, Status, Action.
- Row-level action like `Mark Won` is easy to understand.

What to avoid:

- The style is too generic and slightly toy/demo-like.
- It has a “Made with Replit” vibe. The new app must feel more polished and deliberately designed.
- The screenshot treats pipeline mostly as a payment/deal list, which is useful, but the app needs better inside-sales context: last activity, next action, and lead quality.

### Screenshot 2 — dark Emergent CRM view

What to extract:

- Use this as the stronger visual direction.
- Dark slate/black background, clean cards, thin borders, muted gray copy, emerald/green accent.
- Sidebar is clean and restrained.
- Product revenue cards are well spaced and not visually noisy.
- Table header treatment is clean.
- `Mine only` filter is useful.

What to improve:

- The empty state is bad for demo value. Seed realistic mock deals so the page immediately shows value.
- Add a richer stage/status system and a table that can explain the inside-sales journey.
- Make the page feel alive through drill-downs, filters, and row detail, not through heavy animation.

### Final visual direction

Use **Screenshot 2’s dark premium CRM style** + **Screenshot 1’s table-first pipeline density**.

Working name for the visual system:

> Emergent Dark Sales Console

---

## 3. Strong product opinion: separate pipeline stage, outcome, and payment status

Brian listed these as pipeline states:

- No-Show Stage
- Not Interested stage
- Interested stage
- Contact in Future stage
- Payment link sent
- Payment link paid
- Payment link failed
- Changed Their Mind

These are valid sales states, but they are not all the same type of thing.

Recommended model:

| Concept | Meaning | Examples |
|---|---|---|
| `stage` | Where the lead is in the active sales journey | New, Contacted, Interested, Contact in Future, Payment Link Sent |
| `outcome` | Terminal or semi-terminal result | Won, No-Show, Not Interested, Changed Their Mind |
| `payment_status` | Payment infrastructure state | Not Sent, Link Sent, Paid, Failed |

UI can still show a single human-friendly badge such as `Payment Link Sent` or `No-Show`, but under the hood the app should not flatten everything into one messy enum if it can be avoided.

Why this matters:

- If `Payment Link Paid` and `Interested` are both just stages, reporting becomes inaccurate.
- `No-Show` should count toward no-show reporting, not open pipeline.
- `Payment Link Failed` is usually a recoverable state, not the same as lost.
- `Changed Their Mind` is a lost reason/outcome, and needs a recovery task or remark.

If changing the backend schema is too heavy, keep the existing simple field for now but implement a clean mapping layer in frontend constants and API serializers.

---

## 4. Recommended pipeline/stage structure for this CRM

### Primary visible statuses

Use these in filters, badges, and stage rows:

1. `New / Needs Review`
2. `Contacted`
3. `Interested`
4. `Contact in Future`
5. `Payment Link Sent`
6. `Payment Link Failed`
7. `Payment Link Paid`
8. `No-Show`
9. `Not Interested`
10. `Changed Their Mind`

### Grouping for reporting

| Group | Includes | Reporting purpose |
|---|---|---|
| Active Pipeline | New, Contacted, Interested, Contact in Future, Payment Link Sent, Payment Link Failed | Open revenue and rep work queue |
| Won | Payment Link Paid | Closed revenue |
| Recoverable | No-Show, Payment Link Failed, Changed Their Mind | Follow-up/recovery list |
| Lost | Not Interested, Changed Their Mind after cooling period | Loss reasons and objection tracking |

### Badge styling

Use dark theme badges:

| Status | Badge tone |
|---|---|
| Interested | Emerald/green |
| Payment Link Sent | Blue/cyan |
| Payment Link Paid | Green filled |
| Payment Link Failed | Red/orange |
| Contact in Future | Amber |
| No-Show | Purple/gray |
| Not Interested | Muted red |
| Changed Their Mind | Rose/red |
| New / Needs Review | Slate/gray |
| Contacted | Neutral blue-gray |

---

## 5. Product lines and payment providers

Use these product cards and table values:

| Product | Default INR value | Notes |
|---|---:|---|
| Credit Top-Up | ₹4,999 | Small upsell, fast close |
| Annual Pro Subscription | ₹29,999 | Core annual upgrade |
| Dedicated Support | ₹49,999 | Higher-ticket support package |
| Lifetime Access | ₹99,999 | High-ticket package |

Providers:

- Razorpay
- Stripe
- Manual

Important: The screenshot shows one Stripe row in USD (`$249.00`). Keep currency handling flexible rather than assuming everything is INR.

---

## 6. Main UI target: Deals / Pipeline page

Route could remain whatever currently exists (`/pipeline`, `/deals`, or both), but the navigation label should be consistent. Brian liked `Deals` in the dark screenshot, while the first screenshot uses `Pipeline`. Recommended compromise:

- Sidebar label: `Deals`
- Page title: `Pipeline`
- Subtitle: `Stripe & Razorpay payment links · 4 product lines`

### Layout

1. Left sidebar
2. Main content header
3. Product revenue cards
4. Stage summary strip
5. Filter/action row
6. Table-first pipeline
7. Row details drawer or expandable row

### Sidebar

Use the dark screenshot structure:

- Logo block: `Emergent CRM` / `INSIDE SALES`
- Dashboard
- Leads
- Campaigns
- Meetings
- Deals
- Team
- Optional later: Coverage, Calendar
- Bottom account block: signed-in email + role

Active item should use an emerald/green translucent background and a green icon/text.

### Product revenue cards

Cards should show:

- Product name
- Won revenue
- Won deal count
- Pipeline value
- Optional tiny trend/secondary line

Example:

```text
Annual Pro Subscription
₹89,997 won
3 won · ₹59,998 open
```

Do not leave all cards at `$0` in demo mode. Seed data must show meaningful counts.

### Stage summary strip

Below product cards, add compact stage pills/cards:

```text
Interested 8 · ₹2.4L
Contact in Future 5 · ₹1.1L
Payment Link Sent 4 · ₹1.8L
Payment Failed 2 · ₹35K
No-Show 3
Not Interested 6
```

Clicking a stage applies the stage filter or opens the existing reusable drill-down modal.

### Filter/action row

Controls:

- Search: lead/company/email/phone
- Product filter
- Status filter
- Provider filter
- Owner filter or `Mine only`
- Date range / created range
- Button: `New Lead`
- Optional: `Export` if already easy

### Table columns

Recommended table columns:

| Column | Purpose |
|---|---|
| Lead | Lead/customer name + company/email below |
| Product | Package being sold |
| Amount | Currency-aware amount |
| Provider | Razorpay/Stripe/Manual with icon/text |
| Status | Human-friendly sales/payment status badge |
| Owner | Rep/agent |
| Last activity | Last call/email/payment/link event |
| Next action | Follow-up due, call back date, or empty state |
| Created | Created date |
| Action | Contextual primary action |

The table should be dense but readable. Use sticky header if easy.

### Row actions

Action button should change based on status:

| Current status | Primary action |
|---|---|
| Interested | Send Payment Link |
| Payment Link Sent | Check Payment / Mark Paid |
| Payment Link Failed | Retry Link |
| Contact in Future | Set Follow-up |
| No-Show | Reschedule |
| Not Interested | Add Loss Reason / Reopen |
| Changed Their Mind | Recovery Task |
| Payment Link Paid | View Customer |

Secondary actions in a row menu:

- Call
- Email
- WhatsApp copy/open if supported
- View activity
- Change owner
- Add note
- Move status

### Row detail drawer / expandable row

Clicking a row opens a right-side drawer or inline expanded panel with:

- Lead profile: name, email, phone, company, region, usage tier
- Product/package selected
- Current status + payment status
- Referral source/referrer if present
- Activity timeline: calls, payment link created, payment failed/paid, notes
- Suggested next best action
- Buttons: Send payment link, Mark paid, Mark no-show, Contact in future, Mark not interested, Changed their mind

The uploaded Obsqura staging rebuild is a good UX pattern here: inline/editable details beat dead read-only text. But keep Emergent content and language.

---

## 7. Dashboard alignment

Since dashboard drill-down APIs already exist, make sure dashboard and Deals use the same source of truth for:

- Revenue
- Open pipeline
- Meetings today
- No-shows
- Payment pending
- Stage rows

KPI cards should click into the reusable drill-down modal and/or land on Deals with filters applied.

Avoid duplicate logic where dashboard says one number and Deals table says another.

---

## 8. Calendar and meetings alignment

Calendar already exists. The Deals page should integrate with it lightly:

- If a lead is `No-Show`, action should offer `Reschedule`.
- If a lead is `Contact in Future`, action should offer `Set Follow-up`.
- If a follow-up/meeting exists, show it in `Next action`.
- Manager/admin should be able to filter by agent/owner.

Do not reintroduce the stale `Meeting Scheduled` pipeline stage that was intentionally removed.

---

## 9. Referral alignment

Referral capture already exists. Use it visibly because it makes the demo feel more real.

On New Lead modal:

- Keep searchable referral picker.
- Display selected referrer cleanly.

In row detail drawer:

- Show `Referred by: <customer>` when present.
- Show cross-logged referral activity in timeline if available.

In table:

- Optional small `Referral` pill under lead name or in a secondary line.

---

## 10. Payment fallback alignment

Payment fallback is important for demo credibility.

Implement payment actions so that:

- Without `STRIPE_API_KEY`, the app still creates/simulates a local payment-return URL.
- Failed Stripe/Razorpay integration states do not crash the UI.
- Payment provider/status is shown clearly:
  - Razorpay · Link sent
  - Stripe · Failed
  - Manual · Paid

Add demo rows across Razorpay, Stripe, and Manual.

---

## 11. Mock/demo seed data

The current dark screenshot has an empty table. That kills the demo.

Seed realistic rows such as:

| Lead | Product | Amount | Provider | Status | Owner | Next action |
|---|---|---:|---|---|---|---|
| Aditya Bansal | Annual Pro Subscription | ₹29,999 | Razorpay | Payment Link Paid | Rahul Singh | View customer |
| Nikhil Sharma | Lifetime Access | ₹99,999 | Razorpay | Payment Link Paid | Vikram Patel | Ask for referral |
| Ritika Agarwal | Dedicated Support | ₹49,999 | Stripe | Interested | Ananya Krishnan | Send payment link |
| Rohan Kapoor | Credit Top-Up | ₹4,999 | Razorpay | Payment Link Sent | Arjun Mehta | Check payment |
| Meera Pillai | Annual Pro Subscription | ₹29,999 | Razorpay | Contact in Future | Kavya Reddy | Call tomorrow |
| Deepika Menon | Lifetime Access | $249 | Stripe | Payment Link Failed | Arjun Mehta | Retry link |
| Varun Shah | Credit Top-Up | ₹4,999 | Manual | Payment Link Paid | Siddharth Joshi | View customer |
| Sandeep Rao | Dedicated Support | ₹49,999 | Razorpay | Not Interested | Vikram Patel | Add loss reason |
| Anjali Nair | Annual Pro Subscription | ₹29,999 | Razorpay | No-Show | Kavya Reddy | Reschedule |
| Pranav Menon | Dedicated Support | ₹49,999 | Stripe | Changed Their Mind | Rahul Singh | Recovery task |

This makes every part of the UI testable.

---

## 12. Design system details

### Theme

Use a dark SaaS CRM look:

- Background: near-black/slate
- Surface: slightly lighter dark cards
- Borders: subtle slate borders
- Text primary: near-white
- Text secondary: muted gray
- Accent: emerald/green
- Destructive: muted red/rose
- Warning: amber
- Info: blue/cyan

Avoid heavy animated backgrounds, flashy gradients, or decorative effects that slow screenshots/builds.

### Spacing

- Sidebar width around 260-280px.
- Main content max width full but with comfortable 32-48px padding.
- Cards should be 4 across on desktop and responsive down to 2/1.
- Table should use compact rows but not cramped text.

### Typography

- Use the existing app font stack unless there is already a chosen font.
- Strong hierarchy:
  - Page title: large and bold
  - Subtitle: muted
  - Table headers: uppercase, letter-spaced, muted
  - Amounts: tabular/monospace or numeric aligned

### Interaction

- Hover states must be visible but subtle.
- Buttons should not jump layout.
- Filters should feel like dark inputs, not browser defaults.
- Empty states should only appear when filters truly result in no rows.

---

## 13. Claude implementation instructions

Use this as the actual task prompt.

```text
You are working in /Users/brian/EmergentCRM.

Goal: rebuild/polish the Emergent CRM Deals/Pipeline UI into a premium dark, table-first inside-sales CRM view. Brian prefers the table pipeline style from a light CRM screenshot, but the visual style/colors from a darker Emergent CRM screenshot. This app is an Emergent Labs upsell CRM demo/reference app for inside sales teams converting existing power users into larger annual/support/credit packages.

Important context:
- Do not import Obsqura college CRM business rules into this app.
- Keep the demo/mock fallback working without integration keys.
- Keep existing working features intact: dashboard drill-downs, calendar, referrals, payment fallback, package IDs, tests.
- Do not reintroduce the stale `Meeting Scheduled` stage that was previously removed.
- There is no git remote configured; work locally and commit cleanly.

Required UI direction:
- Use a dark slate/black SaaS CRM theme with emerald accent.
- Sidebar: Emergent CRM / INSIDE SALES, Dashboard, Leads, Campaigns, Meetings, Deals, Team, account block at bottom.
- Deals page title can be `Pipeline`; sidebar label should be `Deals`.
- Prefer a table-first pipeline over kanban.
- Product cards at top for Credit Top-Up, Annual Pro Subscription, Dedicated Support, Lifetime Access.
- Do not show an empty demo. Seed realistic data if no backend data exists.

Pipeline/statuses to support visibly:
- New / Needs Review
- Contacted
- Interested
- Contact in Future
- Payment Link Sent
- Payment Link Failed
- Payment Link Paid
- No-Show
- Not Interested
- Changed Their Mind

Strong modeling preference:
- If schema changes are light/safe, separate `stage`, `outcome`, and `payment_status`.
- If schema changes are risky, keep current storage but create a clean frontend/API mapping layer so reporting remains understandable.
- `Payment Link Paid` should count as won revenue.
- `Payment Link Failed` should be recoverable.
- `No-Show` should feed no-show reporting.
- `Changed Their Mind` should be treated as a recoverable/lost outcome with a recovery task.

Deals table columns:
- Lead: name + company/email/phone secondary line
- Product
- Amount: currency-aware INR/USD
- Provider: Razorpay/Stripe/Manual
- Status: badge
- Owner
- Last activity
- Next action
- Created
- Action: contextual CTA

Contextual row actions:
- Interested -> Send Payment Link
- Payment Link Sent -> Check Payment / Mark Paid
- Payment Link Failed -> Retry Link
- Contact in Future -> Set Follow-up
- No-Show -> Reschedule
- Not Interested -> Add Loss Reason / Reopen
- Changed Their Mind -> Recovery Task
- Payment Link Paid -> View Customer

Row detail:
- Add a drawer or expandable row showing lead profile, product, current status, payment provider/status, referral if any, activity timeline, next best action, and status/action buttons.
- Keep it fast and practical. No modal-only dead-end UX.

Filters:
- Search by lead/company/email/phone.
- Product filter.
- Status filter.
- Provider filter.
- Owner filter or Mine Only checkbox.
- Date range if easy.

Dashboard alignment:
- Dashboard KPI cards and Deals table should use the same status/revenue mapping.
- Existing drill-down modal/API should keep working.

Calendar alignment:
- Contact in Future and No-Show should connect to follow-up/reschedule flows where currently possible.
- Do not add a `Meeting Scheduled` stage.

Payment alignment:
- Stripe/Razorpay/Manual provider display.
- Payment link fallback should not crash without keys.
- Add demo rows for Razorpay, Stripe, and Manual.

Design acceptance:
- Premium dark CRM feel, not toy/demo UI.
- No heavy animated/noisy background on CRM table pages.
- Product cards show won revenue, won deal count, and open pipeline value.
- Stage summary row shows counts/value and can filter or drill down.
- Table has real demo data and never looks empty on first load.
- Responsive enough for laptop widths; desktop first is fine.

Testing/verification:
- Inspect current repo first before changing.
- Run backend tests relevant to changed status/payment logic.
- Run frontend build.
- Run type checks/lint if present.
- Run `git diff --check`.
- Browser-smoke the Deals/Pipeline page, dashboard drill-down, calendar, lead create/referral picker, and payment-link fallback.
- Commit changes with a clear message.

Deliverable:
- A polished, working dark Deals/Pipeline UI with table-first pipeline stages and demo-safe data.
- A short final note listing files changed, commands run, and anything not completed.
```

---

## 14. File areas Claude should inspect first

Exact filenames may differ, but inspect these likely areas:

- Frontend routes/pages for Dashboard, Deals/Pipeline, Leads, Calendar.
- Frontend constants for stages/products/package IDs.
- Components for sidebar/layout, product cards, table, badges, modals/drawers.
- API routes/endpoints for deals/pipeline/dashboard drill-down/payment/referrals.
- Mock/demo data seed or fallback data.
- Tests around stages, payment, package IDs, and dashboard.

Search terms:

```bash
rg "Meeting Scheduled|Payment Link|No-Show|No Show|Interested|Not Interested|Changed Their Mind|Contact in Future|package|Razorpay|Stripe|pipeline|deals|stage" .
```

---

## 15. Acceptance checklist

- [ ] Deals/Pipeline page uses premium dark theme.
- [ ] Sidebar active state and account block look like a real CRM.
- [ ] Product revenue cards are populated and meaningful.
- [ ] Stage/status summary strip exists.
- [ ] Table-first pipeline is the main view.
- [ ] Filters work: search, product, status, provider, owner/mine only.
- [ ] Visible statuses include Brian’s requested states.
- [ ] `Meeting Scheduled` is not reintroduced.
- [ ] Row actions are contextual by status.
- [ ] Row detail drawer/expanded view exists or current detail view is made genuinely useful.
- [ ] Demo mode has realistic rows, not an empty table.
- [ ] Payment fallback still works without live keys.
- [ ] Dashboard numbers and Deals numbers align.
- [ ] Referral picker/metadata still works.
- [ ] Calendar/admin view still works.
- [ ] Backend tests pass or relevant tests are updated intentionally.
- [ ] Frontend build passes.
- [ ] `git diff --check` passes.
- [ ] Clean final commit.

---

## 16. What not to do

- Do not build a kanban-first pipeline.
- Do not make the page visually similar to Obsqura unless Brian asks.
- Do not import college funnel concepts into Emergent.
- Do not leave product cards and table empty in demo mode.
- Do not create noisy animations that make screenshots/browser tests flaky.
- Do not flatten every status into reporting in a way that makes revenue/no-show/payment numbers wrong.
- Do not reintroduce `Meeting Scheduled`.
- Do not break demo mode when API keys are absent.
