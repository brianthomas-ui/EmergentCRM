// Shared UI helpers for the CRM

export const STAGES = [
  "New Booking",
  "Assigned",
  "Meeting Scheduled",
  "Meeting Completed",
  "Payment Link Sent",
  "Won",
  "Lost",
  "Follow-up Later",
];

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
  const sym = currency?.toLowerCase() === "inr" ? "₹" : "$";
  return `${sym}${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

// Outline badges: white background, 1px border, colored text only — keeps the
// CRM clean and avoids "rainbow fill" overload.
export function stageClass(stage) {
  const map = {
    "New Booking": "text-zinc-500 border-zinc-200",
    Assigned: "text-zinc-700 border-zinc-300",
    "Meeting Scheduled": "text-blue-600 border-blue-200",
    "Meeting Completed": "text-indigo-600 border-indigo-200",
    "Payment Link Sent": "text-amber-600 border-amber-200",
    Won: "text-emerald-600 border-emerald-200",
    Lost: "text-rose-600 border-rose-200",
    "Follow-up Later": "text-orange-600 border-orange-200",
  };
  return map[stage] || "text-zinc-500 border-zinc-200";
}

export function priorityClass(p) {
  const map = {
    Hot: "text-rose-600 border-rose-200",
    "Follow-up This Week": "text-amber-600 border-amber-200",
    "Payment Pending": "text-zinc-700 border-zinc-300",
    None: "text-zinc-400 border-zinc-200",
  };
  return map[p] || map.None;
}

export function paymentStatusClass(s) {
  const map = {
    paid: "text-emerald-600 border-emerald-200",
    pending: "text-amber-600 border-amber-200",
    initiated: "text-zinc-500 border-zinc-200",
  };
  return map[s] || map.pending;
}

export function Badge({ children, className = "" }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-mono font-medium uppercase tracking-wider border bg-white ${className}`}
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
  return d.toLocaleDateString();
}

export function fmtDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
