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

export function money(n, currency = "usd") {
  const v = Number(n || 0);
  const sym = currency?.toLowerCase() === "inr" ? "₹" : "$";
  return `${sym}${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function stageClass(stage) {
  const map = {
    "New Booking": "bg-slate-100 text-slate-700 border-slate-200",
    Assigned: "bg-sky-50 text-sky-700 border-sky-200",
    "Meeting Scheduled": "bg-indigo-50 text-indigo-700 border-indigo-200",
    "Meeting Completed": "bg-violet-50 text-violet-700 border-violet-200",
    "Payment Link Sent": "bg-amber-50 text-amber-700 border-amber-200",
    Won: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Lost: "bg-red-50 text-red-700 border-red-200",
    "Follow-up Later": "bg-orange-50 text-orange-700 border-orange-200",
  };
  return map[stage] || "bg-slate-100 text-slate-700 border-slate-200";
}

export function priorityClass(p) {
  const map = {
    Hot: "bg-red-50 text-red-700 border-red-200",
    "Follow-up This Week": "bg-amber-50 text-amber-700 border-amber-200",
    "Payment Pending": "bg-blue-50 text-blue-700 border-blue-200",
    None: "bg-slate-50 text-slate-500 border-slate-200",
  };
  return map[p] || map.None;
}

export function paymentStatusClass(s) {
  const map = {
    paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    initiated: "bg-slate-50 text-slate-600 border-slate-200",
  };
  return map[s] || map.pending;
}

export function Badge({ children, className = "" }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-semibold border ${className}`}
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
