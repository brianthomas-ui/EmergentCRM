// Reusable dark primitives for the Emergent Dark Sales Console.
// Used by the Deals page first; later pages reuse these.
import { X } from "lucide-react";
import { money, moneyCompact, statusToneClass, statusAction } from "@/components/helpers";
import { useIsMobile } from "@/hooks/use-is-mobile";

// ---------------------------------------------------------------------------
// Card - dark surface, subtle slate border.
// ---------------------------------------------------------------------------
export function Card({ children, className = "", onClick, ...rest }) {
  return (
    <div
      onClick={onClick}
      className={`rounded-xl border bg-[var(--surface-1)] border-[var(--border)] ${
        onClick ? "cursor-pointer hover:border-[var(--border-strong)] transition-colors" : ""
      } ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatusBadge - driven by backend STATUS_META tone.
// ---------------------------------------------------------------------------
export function StatusBadge({ status, tone, className = "" }) {
  if (!status) return null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap ${statusToneClass(
        status,
        tone
      )} ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// ProviderTag
// ---------------------------------------------------------------------------
export function ProviderTag({ provider }) {
  const p = (provider || "").toLowerCase();
  const map = {
    razorpay: "text-sky-300",
    stripe: "text-violet-300",
    manual: "text-slate-300",
  };
  const label = { razorpay: "Razorpay", stripe: "Stripe", manual: "Manual" }[p] || "-";
  return <span className={`text-xs font-medium ${map[p] || "text-slate-400"}`}>{label}</span>;
}

// ---------------------------------------------------------------------------
// Dense Table primitives - uppercase letter-spaced muted headers, sticky head.
// ---------------------------------------------------------------------------
export function Table({ children, className = "" }) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  );
}

export function THead({ children }) {
  return (
    <thead className="sticky top-0 z-10 bg-[var(--surface-3)]/95 backdrop-blur">
      <tr>{children}</tr>
    </thead>
  );
}

export function TH({ children, align = "left", className = "" }) {
  return (
    <th
      className={`text-${align} text-[10px] font-mono font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)] px-3 py-2.5 border-b border-[var(--border)] ${className}`}
    >
      {children}
    </th>
  );
}

export function TR({ children, onClick, active = false, className = "" }) {
  return (
    <tr
      onClick={onClick}
      className={`border-b border-[var(--border)] transition-colors ${
        onClick ? "cursor-pointer" : ""
      } ${active ? "bg-emerald-500/[0.06]" : "hover:bg-[var(--surface-2)]"} ${className}`}
    >
      {children}
    </tr>
  );
}

export function TD({ children, align = "left", className = "" }) {
  return <td className={`px-3 py-3 text-${align} align-middle ${className}`}>{children}</td>;
}

// ---------------------------------------------------------------------------
// ProductCard - won revenue, won count, open pipeline value.
// ---------------------------------------------------------------------------
export function ProductCard({ name, currency = "usd", wonRevenue = 0, wonCount = 0, openValue = 0, onClick }) {
  return (
    <Card onClick={onClick} className="p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)] truncate">
          {name}
        </span>
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/70 shrink-0" />
      </div>
      <div className="text-2xl font-semibold tracking-tight text-[var(--text)] tabular-nums">
        {money(wonRevenue, currency)}
      </div>
      <div className="text-xs text-[var(--text-faint)]">
        <span className="text-emerald-300/90 font-medium">{wonCount} won</span>
        {" · "}
        <span className="text-[var(--text-muted)]">{moneyCompact(openValue, currency)} pipeline</span>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// StagePill - clickable summary pill (count + value).
// ---------------------------------------------------------------------------
export function StagePill({ label, tone, count, value, currency = "usd", active = false, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-lg border px-3 py-2 text-left transition-colors ${
        active
          ? "border-emerald-500/40 bg-emerald-500/10"
          : "border-[var(--border)] bg-[var(--surface-1)] hover:bg-[var(--surface-2)]"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`text-[11px] ${statusToneClass(label, tone).split(" ")[0]} font-medium whitespace-nowrap`}>
          {label}
        </span>
      </div>
      <div className="text-sm font-semibold text-[var(--text)] tabular-nums mt-0.5">
        {count}
        {value > 0 && (
          <span className="text-[var(--text-faint)] font-normal text-xs ml-1.5">{moneyCompact(value, currency)}</span>
        )}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Dark inputs / selects.
// ---------------------------------------------------------------------------
export const darkInput =
  "w-full bg-[var(--surface-3)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--text-faint)] focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 outline-none transition-colors";

export const darkSelect = darkInput + " appearance-none pr-8";

export function Select({ value, onChange, children, className = "", ...rest }) {
  return (
    <div className="relative">
      <select value={value} onChange={onChange} className={`${darkSelect} ${className}`} {...rest}>
        {children}
      </select>
      <svg
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-faint)]"
        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Buttons.
// ---------------------------------------------------------------------------
export const btnEmerald =
  "inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-emerald-950 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors active:scale-[0.98] disabled:opacity-60";
export const btnGhost =
  "inline-flex items-center gap-1.5 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border)] text-[var(--text)] rounded-lg px-3.5 py-2 text-sm font-medium transition-colors active:scale-[0.98] disabled:opacity-60";
export const btnDanger =
  "inline-flex items-center gap-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors active:scale-[0.98]";

// Tiny contextual CTA used in table rows (tone follows status).
export function RowActionButton({ status, onClick }) {
  const a = statusAction(status);
  const tones = {
    emerald: "text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/10",
    cyan: "text-sky-300 border-sky-500/30 hover:bg-sky-500/10",
    blue: "text-sky-300 border-sky-500/30 hover:bg-sky-500/10",
    amber: "text-amber-300 border-amber-500/30 hover:bg-amber-500/10",
    orange: "text-orange-300 border-orange-500/30 hover:bg-orange-500/10",
    purple: "text-violet-300 border-violet-500/30 hover:bg-violet-500/10",
    rose: "text-rose-300 border-rose-500/30 hover:bg-rose-500/10",
    green: "text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/10",
    slate: "text-slate-300 border-slate-600/40 hover:bg-slate-600/10",
  };
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(a);
      }}
      className={`whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
        tones[a.tone] || tones.slate
      }`}
    >
      {a.label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Drawer - right-side panel for row detail.
// ---------------------------------------------------------------------------
export function Drawer({ open, onClose, title, subtitle, children, footer, testid }) {
  const isMobile = useIsMobile();
  if (!open) return null;
  // Mobile: a bottom sheet (rounded top, drag handle, slides up). Desktop: the
  // original right-side panel. Same DOM, switched with responsive classes.
  return (
    <div className="fixed inset-0 z-50 flex justify-center items-end lg:items-stretch lg:justify-end" data-testid={testid}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={`relative w-full h-[88vh] lg:h-full lg:max-w-[480px] bg-[var(--surface-1)] border-t lg:border-t-0 lg:border-l border-[var(--border)] shadow-2xl flex flex-col rounded-t-2xl lg:rounded-none ${
          isMobile ? "animate-sheet-up" : "animate-drawer-in"
        }`}
      >
        {/* mobile drag handle */}
        <div className="lg:hidden flex justify-center pt-2.5 pb-1 shrink-0">
          <span className="h-1.5 w-10 rounded-full bg-[var(--border-strong)]" />
        </div>
        <div className="flex items-start justify-between px-5 py-4 border-b border-[var(--border)]">
          <div className="min-w-0">
            <h3 className="font-heading text-lg font-semibold text-[var(--text)] tracking-tight truncate">{title}</h3>
            {subtitle && <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            data-testid="drawer-close"
            className="tap-target text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-3)] rounded-md transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pt-4 pb-safe lg:py-4">{children}</div>
        {footer && <div className="border-t border-[var(--border)] px-5 pt-4 pb-safe lg:py-4">{footer}</div>}
      </div>
    </div>
  );
}
