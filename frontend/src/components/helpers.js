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
// Status tones. Each status resolves to a tone NAME; the actual colors live in
// the theme-aware `.tone-*` classes (index.css), so every badge reads correctly
// in BOTH dark and light. `tone-chip` = filled pill, `tone-text` = colored text
// only (bars / inline labels).
// ---------------------------------------------------------------------------
const VALID_TONES = new Set([
  "emerald", "green", "cyan", "blue", "blue-gray", "amber", "orange", "purple", "rose", "rose-muted", "slate",
]);

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

// Resolve a status (+ optional API tone) to a tone name.
export function statusTone(status, toneFromApi) {
  const t = toneFromApi || STATUS_TONE[status] || "slate";
  return VALID_TONES.has(t) ? t : "slate";
}

// Filled chip classes for a tone name.
export function toneClass(tone) {
  return `tone-chip tone-${VALID_TONES.has(tone) ? tone : "slate"}`;
}

// Colored-text-only classes (bars, inline labels).
export function textTone(tone) {
  return `tone-text tone-${VALID_TONES.has(tone) ? tone : "slate"}`;
}

// Filled chip classes for a status.
export function statusToneClass(status, toneFromApi) {
  return toneClass(statusTone(status, toneFromApi));
}

// Stage tones - used by old Pipeline/Leads pages.
export function stageClass(stage) {
  const map = {
    "New Booking": "slate",
    Assigned: "blue-gray",
    "Meeting Completed": "blue",
    "Payment Link Sent": "amber",
    Won: "emerald",
    Lost: "rose",
    "Follow-up Later": "orange",
  };
  return toneClass(map[stage] || "slate");
}

export function priorityClass(p) {
  const map = {
    Hot: "rose",
    "Follow-up This Week": "amber",
    "Payment Pending": "blue-gray",
    None: "slate",
  };
  return toneClass(map[p] || "slate");
}

export function paymentStatusClass(s) {
  const map = {
    paid: "emerald",
    Paid: "emerald",
    pending: "amber",
    "Link Sent": "cyan",
    failed: "orange",
    Failed: "orange",
    initiated: "slate",
  };
  return toneClass(map[s] || "amber");
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

// Small mono "tag" badge. Background/border come from the tone-* class passed in
// className (theme-aware); structure is uniform so a column of them reads tidy.
export function Badge({ children, className = "" }) {
  return (
    <span
      className={`inline-flex items-center justify-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold uppercase tracking-wider leading-none border whitespace-nowrap ${className}`}
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
