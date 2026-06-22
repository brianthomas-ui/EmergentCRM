// Shared UI helpers for the Emergent Dark Sales Console.

export const STAGES = [
  "New Booking",
  "Assigned",
  "Meeting Completed",
  "Payment Link Sent",
  "Won",
  "Lost",
  "Follow-up Later",
];

// New sales-status model (mirrors backend VISIBLE_STATUSES). Frontend fallback
// when /meta is unavailable.
export const VISIBLE_STATUSES = [
  "New / Needs Review",
  "Contacted",
  "Interested",
  "Contact in Future",
  "Payment Link Sent",
  "Payment Link Failed",
  "Payment Link Paid",
  "No-Show",
  "Not Interested",
  "Changed Their Mind",
];

export const PRODUCT_LINES = [
  "Credit Top-Up",
  "Annual Pro Subscription",
  "Dedicated Support",
  "Lifetime Access",
];

export const PROVIDERS = ["razorpay", "stripe", "manual"];

export const PRIORITIES = ["Hot", "Follow-up This Week", "Payment Pending", "None"];

export const BOOKING_DRIVERS = [
  "Support",
  "Lifetime Access",
  "Top-Up Credits",
  "Discount",
  "Pricing / Upgrade",
  "Feature Request",
  "Renewal",
  "Onboarding Help",
  "Other",
];

export const REGIONS = ["North America", "Europe", "APAC", "LATAM", "MEA", "Other"];

export function money(n, currency = "usd") {
  const v = Number(n || 0);
  const sym = (currency || "usd").toLowerCase() === "inr" ? "₹" : "$";
  return `${sym}${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

// Compact money for cards/strips: $1.2k / $12k / $1.2M
export function moneyCompact(n, currency = "usd") {
  const v = Number(n || 0);
  const sym = (currency || "usd").toLowerCase() === "inr" ? "₹" : "$";
  if (Math.abs(v) >= 1_000_000) return `${sym}${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (Math.abs(v) >= 1_000) return `${sym}${(v / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${sym}${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

// ---------------------------------------------------------------------------
// Status badge tones (dark theme). Maps the backend STATUS_META tone name to
// a set of dark-friendly Tailwind classes. `filled` = solid emerald (won).
// ---------------------------------------------------------------------------
const TONE_CLASSES = {
  emerald:    "text-emerald-300 border-emerald-500/30 bg-emerald-500/10",
  green:      "text-emerald-50 border-emerald-400/40 bg-emerald-500/80", // filled / won
  cyan:       "text-sky-300 border-sky-500/30 bg-sky-500/10",
  blue:       "text-sky-300 border-sky-500/30 bg-sky-500/10",
  "blue-gray":"text-slate-300 border-slate-500/30 bg-slate-500/10",
  amber:      "text-amber-300 border-amber-500/30 bg-amber-500/10",
  orange:     "text-orange-300 border-orange-500/30 bg-orange-500/10",
  purple:     "text-violet-300 border-violet-500/30 bg-violet-500/10",
  rose:       "text-rose-300 border-rose-500/30 bg-rose-500/10",
  "rose-muted":"text-rose-300/80 border-rose-500/20 bg-rose-500/[0.07]",
  slate:      "text-slate-300 border-slate-600/40 bg-slate-600/10",
};

// Fallback tone per status when STATUS_META is not available from /meta.
const STATUS_TONE = {
  Interested: "emerald",
  "Payment Link Sent": "cyan",
  "Payment Link Paid": "green",
  "Payment Link Failed": "orange",
  "Contact in Future": "amber",
  "No-Show": "purple",
  "Not Interested": "rose-muted",
  "Changed Their Mind": "rose",
  "New / Needs Review": "slate",
  Contacted: "blue-gray",
};

export function toneClass(tone) {
  return TONE_CLASSES[tone] || TONE_CLASSES.slate;
}

export function statusToneClass(status, toneFromApi) {
  const tone = toneFromApi || STATUS_TONE[status] || "slate";
  return TONE_CLASSES[tone] || TONE_CLASSES.slate;
}

// Legacy stage tones (dark) - used by old Pipeline/Leads pages.
export function stageClass(stage) {
  const map = {
    "New Booking": "text-slate-300 border-slate-600/40 bg-slate-600/10",
    Assigned: "text-slate-200 border-slate-500/40 bg-slate-500/10",
    "Meeting Completed": "text-indigo-300 border-indigo-500/30 bg-indigo-500/10",
    "Payment Link Sent": "text-amber-300 border-amber-500/30 bg-amber-500/10",
    Won: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10",
    Lost: "text-rose-300 border-rose-500/30 bg-rose-500/10",
    "Follow-up Later": "text-orange-300 border-orange-500/30 bg-orange-500/10",
  };
  return map[stage] || "text-slate-300 border-slate-600/40 bg-slate-600/10";
}

export function priorityClass(p) {
  const map = {
    Hot: "text-rose-300 border-rose-500/30 bg-rose-500/10",
    "Follow-up This Week": "text-amber-300 border-amber-500/30 bg-amber-500/10",
    "Payment Pending": "text-slate-200 border-slate-500/40 bg-slate-500/10",
    None: "text-slate-400 border-slate-600/30 bg-transparent",
  };
  return map[p] || map.None;
}

export function paymentStatusClass(s) {
  const map = {
    paid: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10",
    Paid: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10",
    pending: "text-amber-300 border-amber-500/30 bg-amber-500/10",
    "Link Sent": "text-sky-300 border-sky-500/30 bg-sky-500/10",
    failed: "text-orange-300 border-orange-500/30 bg-orange-500/10",
    Failed: "text-orange-300 border-orange-500/30 bg-orange-500/10",
    initiated: "text-slate-300 border-slate-600/40 bg-slate-600/10",
  };
  return map[s] || map.pending;
}

// Provider display label + chip tone.
export function providerLabel(p) {
  const map = { razorpay: "Razorpay", stripe: "Stripe", manual: "Manual" };
  return map[(p || "").toLowerCase()] || (p ? p[0].toUpperCase() + p.slice(1) : "-");
}

// ---------------------------------------------------------------------------
// Contextual primary action per status (handoff spec §6).
// Returns { label, kind } - kind drives which flow the Deals page runs.
// ---------------------------------------------------------------------------
export function statusAction(status) {
  const map = {
    Interested:            { label: "Send Payment Link", kind: "send_link", tone: "emerald" },
    "Payment Link Sent":   { label: "Mark Paid",          kind: "mark_paid", tone: "cyan" },
    "Payment Link Failed": { label: "Retry Link",         kind: "send_link", tone: "orange" },
    "Contact in Future":   { label: "Set Follow-up",      kind: "follow_up", tone: "amber" },
    "No-Show":             { label: "Reschedule",         kind: "reschedule", tone: "purple" },
    "Not Interested":      { label: "Add Loss Reason",    kind: "loss_reason", tone: "rose" },
    "Changed Their Mind":  { label: "Recovery Task",      kind: "recovery", tone: "rose" },
    "Payment Link Paid":   { label: "View Customer",      kind: "view_customer", tone: "green" },
    "New / Needs Review":  { label: "Review & Qualify",   kind: "qualify", tone: "slate" },
    Contacted:             { label: "Mark Interested",    kind: "mark_interested", tone: "blue" },
  };
  return map[status] || { label: "Open", kind: "open", tone: "slate" };
}

// Outline badge with optional filled (won) treatment.
export function Badge({ children, className = "", filled = false }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-mono font-medium uppercase tracking-wider border ${
        filled ? "" : "bg-transparent"
      } ${className}`}
    >
      {children}
    </span>
  );
}

export function timeAgo(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function fmtDate(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function fmtDateTime(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
