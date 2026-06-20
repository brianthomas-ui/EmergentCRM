// Role-specific guided tours. Each step optionally targets a sidebar nav item
// (by data-testid) so the spotlight lands on a stable element. Content is deep
// and action-oriented, tailored to what each role actually does day-to-day.

const AGENT_STEPS = [
  {
    title: "Welcome to your sales console 👋",
    body: "This 90-second tour shows you exactly how to run your day: see what needs attention, work your leads, log conversations, book meetings and send payment links. You can replay it any time from the sidebar.",
  },
  {
    selector: '[data-testid="nav-workspace"]',
    title: "Start here every morning — My Work",
    body: "My Work is your command center. It surfaces today's meetings, follow-ups that are due, deals waiting on payment, and leads going stale — so you never lose track of an active conversation. Clear this list daily.",
  },
  {
    selector: '[data-testid="nav-leads"]',
    title: "Leads — your book of business",
    body: "Every prospect you own lives here. Use the search and status filters to slice your pipeline. Open any lead to see the full story: company context, usage, and your entire conversation history.",
  },
  {
    selector: '[data-testid="nav-leads"]',
    title: "Log every conversation",
    body: "Inside a lead, add a note after each call or email (what happened + the next step). These notes power your 'Recent conversations' feed in My Work and keep your manager in the loop without status meetings.",
  },
  {
    selector: '[data-testid="nav-meetings"]',
    title: "Meetings — run the call, log the outcome",
    body: "Your calendar of bookings. After a call, open the meeting to mark it Show or No-Show, add outcome notes, or reschedule. No-shows automatically flow back into My Work so you can re-book them.",
  },
  {
    selector: '[data-testid="nav-deals"]',
    title: "Deals — move the pipeline",
    body: "A fast, filterable table of your active deals. Open a deal to advance its status (Interested → Payment Link Sent → Paid) and to generate a Stripe or Razorpay payment link in two clicks.",
  },
  {
    selector: '[data-testid="nav-payments"]',
    title: "Payments — get paid",
    body: "All your payment links and closed revenue in USD. Hit 'New Payment Link' to create a custom link for any lead, choose the product line, and the deal updates automatically when it's paid.",
  },
  {
    selector: '[data-testid="nav-settings"]',
    title: "Your settings & keys",
    body: "Add your own integration details here — for example your personal Calendly link — so booking and follow-ups feel like yours. You can also change your password and theme.",
  },
  {
    selector: '[data-tour="user-card"]',
    title: "Profile, theme & replaying this tour",
    body: "Update your photo, switch between dark and light mode, change your password, or restart this tour any time — all from here.",
  },
  {
    title: "You're ready to sell 🎉",
    body: "Quick rhythm: clear My Work → log every conversation → book the meeting → send the payment link. Do that daily and your pipeline runs itself. Good luck!",
  },
];

const MANAGER_STEPS = [
  {
    title: "Welcome, Sales Head 👋",
    body: "This tour covers how to run the team: read performance at a glance, dig into any metric, manage agents and targets, configure integrations, import historical data, and even view the CRM exactly as one of your reps.",
  },
  {
    selector: '[data-testid="nav-dashboard"]',
    title: "Dashboard — the whole team at a glance",
    body: "Revenue, pipeline health, conversion and per-product performance, all filterable by time period. Every KPI and chart is clickable — drill in to see the exact leads, deals or payments behind the number.",
  },
  {
    selector: '[data-testid="nav-team"]',
    title: "Team — agents, targets & the leaderboard",
    body: "Manage your reps, set monthly targets, and watch the leaderboard. Compare leads worked, meetings, win rate and revenue per agent for any time window.",
  },
  {
    selector: '[data-tour="view-as"]',
    title: "View as an agent (powerful!)",
    body: "Pick any rep here to see the CRM exactly as they do — their My Work, their leads, their deals. Perfect for coaching and 1:1s. A banner reminds you you're viewing as them; click 'Back to Manager' to return.",
  },
  {
    selector: '[data-testid="nav-workspace"]',
    title: "You sell too — My Work",
    body: "You also carry a book of business, so My Work shows your own active leads, follow-ups and meetings — same command center your reps use.",
  },
  {
    selector: '[data-testid="nav-campaigns"]',
    title: "Campaigns — outbound at scale",
    body: "Build targeted segments, track performance, and run mail-merge outreach to fill the top of the funnel for the team.",
  },
  {
    selector: '[data-testid="nav-leads"]',
    title: "Leads & Deals — the full pipeline",
    body: "Leads and Deals show the entire team's pipeline (not just yours). Filter by owner, status, product or region to spot stuck deals and rebalance workload.",
  },
  {
    selector: '[data-testid="nav-settings"]',
    title: "Settings — API keys & integrations",
    body: "Add and rotate your Stripe, Razorpay, Calendly and other API keys here. Keys are stored securely and shown masked. This is also where you set the FX rate and can reset the demo dataset.",
  },
  {
    selector: '[data-testid="nav-settings"]',
    title: "Import historical data",
    body: "Backfill the CRM from your old tools: import historical leads, deals and meetings via a cleaned CSV with column mapping and de-duplication, so your reports are complete from day one.",
  },
  {
    selector: '[data-testid="nav-audit"]',
    title: "Audit Log — full accountability",
    body: "Every meaningful action — assignments, status changes, payments, key updates, impersonation — is logged here with who, what and when.",
  },
  {
    title: "That's the manager toolkit 🎯",
    body: "Read the Dashboard, coach with 'View as', keep targets sharp on Team, and keep integrations current in Settings. You're set — restart this tour any time from the sidebar.",
  },
];

export function getTourSteps(isAdmin) {
  return isAdmin ? MANAGER_STEPS : AGENT_STEPS;
}
