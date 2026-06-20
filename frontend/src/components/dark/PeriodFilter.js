// PeriodFilter — reusable dark segmented control for date-range scoping.
// Segments: Today / This Week / This Month / This Quarter / Custom.
// "Custom" reveals two date inputs (from / to).
//
// Value shape: { period, from, to }
//   period: "today" | "this_week" | "this_month" | "this_quarter" | "custom"
//   from/to: "YYYY-MM-DD" strings, only meaningful when period === "custom"
//
// toParams(value) -> { period, from, to } for passing straight to API calls.
import { darkInput } from "@/components/dark/Primitives";

const SEGMENTS = [
  { key: "today", label: "Today" },
  { key: "this_week", label: "This Week" },
  { key: "this_month", label: "This Month" },
  { key: "this_quarter", label: "This Quarter" },
  { key: "custom", label: "Custom" },
];

// "All time" segment, prepended when the caller passes includeAll (e.g. Deals,
// where the default view is every deal grouped by recency).
const ALL_SEGMENT = { key: "all", label: "All time" };

export const DEFAULT_PERIOD = {
  period: "this_month",
  from: "",
  to: "",
};

// Normalize partial / missing values into a full {period, from, to}.
function normalize(value) {
  const v = value || {};
  return {
    period: v.period || DEFAULT_PERIOD.period,
    from: v.from || "",
    to: v.to || "",
  };
}

// Build the query params an API call needs. For non-custom periods the
// from/to are omitted so the backend can resolve the named window itself.
export function toParams(value) {
  const v = normalize(value);
  if (v.period === "custom") {
    return { period: "custom", from: v.from || undefined, to: v.to || undefined };
  }
  return { period: v.period };
}

export default function PeriodFilter({ value, onChange, className = "", includeAll = false }) {
  const v = normalize(value);
  const segments = includeAll ? [ALL_SEGMENT, ...SEGMENTS] : SEGMENTS;

  const setPeriod = (period) => onChange?.({ ...v, period });
  const setFrom = (from) => onChange?.({ ...v, period: "custom", from });
  const setTo = (to) => onChange?.({ ...v, period: "custom", to });

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`} data-testid="period-filter">
      <div className="inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-0.5">
        {segments.map((seg) => {
          const active = v.period === seg.key;
          return (
            <button
              key={seg.key}
              type="button"
              data-testid={`period-${seg.key}`}
              aria-pressed={active}
              onClick={() => setPeriod(seg.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-[7px] whitespace-nowrap transition-colors ${
                active
                  ? "bg-emerald-500 text-emerald-950 shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-3)]"
              }`}
            >
              {seg.label}
            </button>
          );
        })}
      </div>

      {v.period === "custom" && (
        <div className="inline-flex items-center gap-2" data-testid="period-custom-range">
          <input
            type="date"
            value={v.from}
            max={v.to || undefined}
            onChange={(e) => setFrom(e.target.value)}
            data-testid="period-from"
            className={`${darkInput} w-auto [color-scheme:dark]`}
            aria-label="From date"
          />
          <span className="text-xs text-[var(--text-faint)]">to</span>
          <input
            type="date"
            value={v.to}
            min={v.from || undefined}
            onChange={(e) => setTo(e.target.value)}
            data-testid="period-to"
            className={`${darkInput} w-auto [color-scheme:dark]`}
            aria-label="To date"
          />
        </div>
      )}
    </div>
  );
}
