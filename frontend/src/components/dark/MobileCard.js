// Shared card shape used to replace dense tables on phones. One identity row
// (optional leading visual + title + subtitle on the left, trailing status/amount
// on the right), an optional 2-column meta grid of secondary fields, and an
// optional footer (e.g. a row action). Root is a div so nested buttons stay valid.

export function MobileCard({
  onClick,
  active = false,
  leading,
  title,
  subtitle,
  trailingTop,
  trailingBottom,
  meta = [],
  footer,
  testid,
}) {
  const metaFilled = meta.filter((m) => m && m.value !== undefined && m.value !== null && m.value !== "");
  return (
    <div
      onClick={onClick}
      data-testid={testid}
      className={`rounded-xl border p-3.5 transition-colors ${
        onClick ? "cursor-pointer active:bg-[var(--surface-2)]" : ""
      } ${active ? "border-emerald-500/40 bg-emerald-500/[0.06]" : "border-[var(--border)] bg-[var(--surface-1)]"}`}
    >
      <div className="flex items-start gap-3">
        {leading}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-[var(--text)] leading-tight truncate">{title}</div>
          {subtitle && <div className="text-xs text-[var(--text-faint)] truncate mt-0.5">{subtitle}</div>}
        </div>
        {(trailingTop || trailingBottom) && (
          <div className="text-right shrink-0 flex flex-col items-end gap-1">
            {trailingTop && <div className="font-semibold tabular-nums text-[var(--text)] text-sm">{trailingTop}</div>}
            {trailingBottom}
          </div>
        )}
      </div>

      {metaFilled.length > 0 && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 mt-3 pt-3 border-t border-[var(--border)]">
          {metaFilled.map((m) => (
            <div key={m.label} className="min-w-0">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-faint)]">{m.label}</div>
              <div className="text-xs text-[var(--text-muted)] truncate mt-0.5">{m.value}</div>
            </div>
          ))}
        </div>
      )}

      {footer && <div className="mt-3 flex items-center justify-end gap-2">{footer}</div>}
    </div>
  );
}

// Vertical stack wrapper with consistent spacing for a list of MobileCards.
export function CardList({ children, className = "" }) {
  return <div className={`flex flex-col gap-2.5 ${className}`}>{children}</div>;
}

// Section header used when a card list is grouped (e.g. Deals recency buckets).
export function CardGroupHeader({ label, count, right }) {
  return (
    <div className="flex items-center justify-between px-1 pt-1">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
        {label}
        {count !== undefined && <span className="text-[var(--text-faint)] font-mono ml-1.5">({count})</span>}
      </span>
      {right && <span className="text-[11px] font-mono text-[var(--text-faint)]">{right}</span>}
    </div>
  );
}
