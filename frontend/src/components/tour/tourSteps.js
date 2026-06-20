// Role-specific guided tours, structured as a PAGE WALK: each step carries a
// `pagePath` so the tour navigates to that route, waits for the target to mount,
// then spotlights a page-level anchor (data-tour / data-testid). Steps without a
// selector render centered (intro / outro). Content is deep and action-oriented.

const AGENT_STEPS = [
  {
    pagePath: "/",
    title: "Welcome to your sales console 👋",
    body: "This 2-minute tour walks you through every page you'll use: your dashboard, My Work, leads, meetings, deals and payments. The tour moves between pages for you — just hit Next. You can replay it any time from the sidebar.",
  },
  {
    pagePath: "/",
    selector: '[data-tour="dashboard-kpis"]',
    title: "Dashboard — your day in six numbers",
    body: "Revenue closed, open pipeline, meetings today, payments pending, no-shows and conversion. Every card is clickable — drill in to see the exact leads, deals or payments behind the number.",
  },
  {
    pagePath: "/",
    selector: '[data-tour="dashboard-period"]',
    title: "Scope everything by time period",
    body: "Switch between Today, This Week, This Month or a custom range. The whole dashboard re-scopes — and when you drill into a card, the drill-down respects the same period, so 'Open Pipeline' for This Week shows only this week's deals.",
  },
  {
    pagePath: "/workspace",
    selector: '[data-testid="ws-followups"]',
    title: "My Work — start here every morning",
    body: "Your command center: follow-ups that are due, today's meetings, deals waiting on payment, and leads going stale. Clear this list daily and nothing slips through the cracks.",
  },
  {
    pagePath: "/leads",
    selector: '[data-tour="leads-table"]',
    title: "Leads — your book of business",
    body: "Every prospect you own. Search and filter to slice your pipeline, then open any lead for the full story — company context, usage and your entire conversation history. Log a note after each call; it feeds your My Work feed.",
  },
  {
    pagePath: "/meetings",
    selector: '[data-tour="meetings-title"]',
    title: "Meetings — run the call, log the outcome",
    body: "Your calendar of bookings in IST. After a call, mark it Show or No-Show, add outcome notes, or reschedule. No-shows flow straight back into My Work so you can re-book them.",
  },
  {
    pagePath: "/deals",
    selector: '[data-tour="deals-search"]',
    title: "Deals — search and work the pipeline",
    body: "A fast, searchable pipeline grouped by recency — Today, this week, this month, earlier — so the freshest deals are always on top. Sort by amount, owner or date with the column headers.",
  },
  {
    pagePath: "/deals",
    selector: '[data-tour="deals-period"]',
    title: "Scope deals to a period",
    body: "Narrow the pipeline to any time window, or keep 'All time' to see everything. Open a deal to advance its status and generate a Stripe or Razorpay payment link in two clicks.",
  },
  {
    pagePath: "/payments",
    selector: '[data-tour="new-payment-link"]',
    title: "Payments — get paid",
    body: "All your links and closed revenue in USD. 'New Payment Link' creates a link for a lead, or a standalone link with no lead attached — enter a customer email and it auto-attaches to a matching lead, or link it later.",
  },
  {
    pagePath: "/settings",
    selector: '[data-testid="settings-page"]',
    title: "Your settings & keys",
    body: "Add your own integration details — like your personal Calendly link — so booking and follow-ups feel like yours. You can also change your password and switch theme here.",
  },
  {
    pagePath: "/settings",
    title: "You're ready to sell 🎉",
    body: "Quick rhythm: clear My Work → log every conversation → book the meeting → send the payment link. Do that daily and your pipeline runs itself. Replay this tour any time from the sidebar. Good luck!",
  },
];

const MANAGER_STEPS = [
  {
    pagePath: "/",
    title: "Welcome, Sales Head 👋",
    body: "This tour walks every page you'll run the team from — dashboard, team & targets, campaigns, the full pipeline, payments, settings and the audit log. The tour navigates between pages for you; just hit Next.",
  },
  {
    pagePath: "/",
    selector: '[data-tour="dashboard-kpis"]',
    title: "Dashboard — the whole team at a glance",
    body: "Revenue, pipeline, meetings, conversion and more — all for the team. Every KPI and chart is clickable; drill in to see the exact leads, deals or payments behind it.",
  },
  {
    pagePath: "/",
    selector: '[data-tour="dashboard-period"]',
    title: "Scope by period — drill-downs follow",
    body: "Today / This Week / This Month / custom re-scopes the whole console. Drill-downs respect the selected window, so clicking a card after picking 'This Week' shows only this week's records.",
  },
  {
    pagePath: "/team",
    selector: '[data-tour="team-leaderboard"]',
    title: "Team — agents, targets & the leaderboard",
    body: "Manage reps, set monthly targets, and watch the leaderboard: leads worked, meetings, win rate and revenue per agent for any window. You're on it too — you carry a target as a selling manager.",
  },
  {
    pagePath: "/team",
    selector: '[data-tour="view-as"]',
    title: "View as an agent (powerful!)",
    body: "Pick any rep here to see the CRM exactly as they do — their My Work, leads and deals. Perfect for coaching and 1:1s. A banner reminds you you're viewing as them; click 'Back to Manager' to return.",
  },
  {
    pagePath: "/workspace",
    selector: '[data-testid="ws-followups"]',
    title: "You sell too — My Work",
    body: "Your own command center: your active follow-ups, today's meetings and pending payments — the same daily list your reps work.",
  },
  {
    pagePath: "/campaigns",
    selector: '[data-tour="campaigns-table"]',
    title: "Campaigns — outbound at scale",
    body: "Build targeted segments, track performance, and run mail-merge outreach to fill the top of the funnel for the whole team.",
  },
  {
    pagePath: "/leads",
    selector: '[data-tour="leads-table"]',
    title: "Leads — the whole team's pipeline",
    body: "Leads (and Deals) show everyone's pipeline, not just yours. Filter by owner, status, product or region to spot stuck deals and rebalance workload.",
  },
  {
    pagePath: "/deals",
    selector: '[data-tour="deals-search"]',
    title: "Deals — searchable, grouped by recency",
    body: "The team pipeline as a fast table, grouped Today / this week / this month / earlier and sortable by amount, owner or date. Scope it to any period with the control on the right.",
  },
  {
    pagePath: "/meetings",
    selector: '[data-tour="meetings-title"]',
    title: "Meetings — the team's calendar",
    body: "Every rep's bookings in one IST grid. Spot a quiet day or a wall of no-shows at a glance.",
  },
  {
    pagePath: "/payments",
    selector: '[data-tour="new-payment-link"]',
    title: "Payments — links & revenue",
    body: "All payment links and closed revenue in USD. Standalone links can be created with no lead and attached to one later — handy for ad-hoc or historical payments.",
  },
  {
    pagePath: "/settings",
    selector: '[data-testid="settings-page"]',
    title: "Settings — keys, FX & import",
    body: "Add and rotate Stripe, Razorpay, Calendly and other keys (stored securely, shown masked), set the FX rate, and reset the demo dataset.",
  },
  {
    pagePath: "/settings",
    selector: '[data-tour="import-template"]',
    title: "Import historical data",
    body: "Backfill from your old tools: download a CSV template for leads, payments or meetings, fill it in, and import with column-mapping and de-duplication so your reports are complete from day one.",
  },
  {
    pagePath: "/audit",
    selector: '[data-tour="audit-table"]',
    title: "Audit Log — full accountability",
    body: "Every meaningful action — assignments, status changes, payments, key updates, impersonation — logged with who, what and when.",
  },
  {
    pagePath: "/audit",
    title: "That's the manager toolkit 🎯",
    body: "Read the Dashboard, coach with 'View as', keep targets sharp on Team, and keep integrations current in Settings. Replay this tour any time from the sidebar.",
  },
];

export function getTourSteps(isAdmin) {
  return isAdmin ? MANAGER_STEPS : AGENT_STEPS;
}
