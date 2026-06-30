import { Link } from "react-router-dom";
import { toast } from "sonner";
import { money, Badge, paymentStatusClass, fmtDateTime } from "@/components/helpers";
import { Copy, RefreshCw, CheckCircle2, Link2 } from "lucide-react";
import { MobileCard, CardList } from "@/components/dark/MobileCard";
import { useIsMobile } from "@/hooks/use-is-mobile";

export function FxRateCard({ isAdmin, fxRate, rateInput, setRateInput, onSave, saving }) {
  return (
    <div className="bg-[var(--surface-1)] border border-[var(--border)] rounded-lg px-4 py-3" data-testid="fx-card">
      <div className="text-[10px] uppercase tracking-widest text-[var(--text-faint)] font-semibold">FX Rate · INR per USD</div>
      {isAdmin ? (
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-sm text-[var(--text-muted)]">₹</span>
          <input
            type="number"
            value={rateInput}
            onChange={(e) => setRateInput(e.target.value)}
            data-testid="fx-input"
            className="w-20 bg-[var(--surface-3)] border border-[var(--border)] rounded-md px-2 py-1 text-sm font-mono text-[var(--text)] focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 outline-none"
          />
          <span className="text-sm text-[var(--text-muted)]">/ $1</span>
          <button
            onClick={onSave}
            disabled={saving}
            data-testid="fx-save"
            className="bg-emerald-500 text-emerald-950 rounded-md px-3.5 py-1.5 text-xs font-semibold hover:bg-emerald-400 active:scale-[0.98] transition-colors disabled:opacity-60"
          >
            {saving ? "…" : "Save"}
          </button>
        </div>
      ) : (
        <div className="text-lg font-bold text-[var(--text)] font-mono mt-1">
          ₹{fxRate} <span className="text-xs text-[var(--text-faint)] font-normal">/ $1</span>
        </div>
      )}
    </div>
  );
}

export function PaymentsSummary({ totalPaid, totalPending, count, onDrill }) {
  const cardCls =
    "text-left bg-[var(--surface-1)] border border-[var(--border)] rounded-lg p-3 sm:p-5 min-w-0 transition-all hover:border-[var(--border-strong)] active:scale-[0.99] cursor-pointer";
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-4">
      <button type="button" onClick={() => onDrill?.("collected")} data-testid="pay-summary-collected" className={cardCls}>
        <div className="text-[10px] uppercase tracking-widest text-[var(--text-faint)] font-semibold truncate">Collected</div>
        <div className="font-heading text-lg sm:text-3xl font-bold text-emerald-400 tabular-nums truncate">{money(totalPaid)}</div>
        <div className="text-[10px] text-[var(--text-faint)] mt-1 hidden sm:block">Tap for breakdown →</div>
      </button>
      <button type="button" onClick={() => onDrill?.("pending")} data-testid="pay-summary-pending" className={cardCls}>
        <div className="text-[10px] uppercase tracking-widest text-[var(--text-faint)] font-semibold truncate">Pending</div>
        <div className="font-heading text-lg sm:text-3xl font-bold text-amber-400 tabular-nums truncate">{money(totalPending)}</div>
        <div className="text-[10px] text-[var(--text-faint)] mt-1 hidden sm:block">Tap for breakdown →</div>
      </button>
      <button type="button" onClick={() => onDrill?.("links")} data-testid="pay-summary-links" className={cardCls}>
        <div className="text-[10px] uppercase tracking-widest text-[var(--text-faint)] font-semibold truncate">Links Sent</div>
        <div className="font-heading text-lg sm:text-3xl font-bold text-[var(--text)] tabular-nums">{count}</div>
        <div className="text-[10px] text-[var(--text-faint)] mt-1 hidden sm:block">Tap for breakdown →</div>
      </button>
    </div>
  );
}

// Action buttons shared by the table row and the mobile card (copy, refresh, simulate, link).
function PaymentRowActions({ p, onRefresh, onSimulate, onLinkLead }) {
  return (
    <>
      {p.payment_link && (
        <button onClick={() => { Promise.resolve(navigator.clipboard?.writeText(p.payment_link)).then(() => toast.success("Copied")).catch(() => toast.message("Copy link", { description: p.payment_link })); }} className="tap-target text-[var(--text-faint)] hover:text-[var(--text)]" title="Copy link"><Copy className="w-4 h-4" /></button>
      )}
      {p.payment_status !== "paid" && p.provider === "stripe" && (
        <button onClick={() => onRefresh(p)} className="tap-target text-[var(--text-faint)] hover:text-[var(--text)]" title="Refresh status" data-testid={`refresh-${p.id}`}><RefreshCw className="w-4 h-4" /></button>
      )}
      {p.payment_status !== "paid" && p.provider === "razorpay" && (
        <button onClick={() => onSimulate(p)} className="tap-target text-emerald-400 hover:text-emerald-300" title="Mark paid (Razorpay sim)" data-testid={`simulate-${p.id}`}><CheckCircle2 className="w-4 h-4" /></button>
      )}
      {!p.lead_id && onLinkLead && (
        <button onClick={() => onLinkLead(p)} className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 hover:text-emerald-300 px-2 py-2" title="Attach this payment to a lead" data-testid={`link-lead-${p.id}`}><Link2 className="w-4 h-4" /> Link to lead</button>
      )}
    </>
  );
}

// Mobile: each payment as a card with the same actions in the footer.
function PaymentsCardList({ payments, onRefresh, onSimulate, onLinkLead, onRowClick }) {
  if (payments.length === 0) {
    return <div className="p-12 text-center text-[var(--text-faint)] text-sm">No payment links yet.</div>;
  }
  return (
    <CardList>
      {payments.map((p) => (
        <MobileCard
          key={p.id}
          testid={`pay-row-${p.id}`}
          onClick={() => onRowClick?.(p)}
          title={p.lead_name || p.customer_email || "Standalone"}
          subtitle={p.description || (p.lead_id ? "" : "Standalone link")}
          trailingTop={money(p.amount, p.currency)}
          trailingBottom={<Badge className={paymentStatusClass(p.payment_status)}>{p.payment_status}</Badge>}
          meta={[
            { label: "Provider", value: <span className="capitalize">{p.provider}</span> },
            { label: "Agent", value: p.agent_name || "-" },
            { label: "Created", value: fmtDateTime(p.created_at) },
            p.currency !== "usd" ? { label: "USD", value: `≈ ${money(p.amount_usd ?? p.amount)}` } : null,
          ].filter(Boolean)}
          footer={
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <PaymentRowActions p={p} onRefresh={onRefresh} onSimulate={onSimulate} onLinkLead={onLinkLead} />
            </div>
          }
        />
      ))}
    </CardList>
  );
}

export function PaymentsTable(props) {
  const isMobile = useIsMobile();
  if (isMobile) return <PaymentsCardList {...props} />;
  return <PaymentsTableDesktop {...props} />;
}

function PaymentsTableDesktop({ payments, onRefresh, onSimulate, onLinkLead, onRowClick }) {
  return (
    <div className="bg-[var(--surface-1)] border border-[var(--border)] rounded-lg overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-[var(--surface-2)]/50 border-b border-[var(--border)]">
            {["Lead", "Amount", "Provider", "Agent", "Status", "Created", ""].map((h) => (
              <th key={h} className="text-[10px] font-mono font-semibold text-[var(--text-faint)] uppercase tracking-wider text-left p-3">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id} data-testid={`pay-row-${p.id}`} onClick={() => onRowClick?.(p)}
                className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-2)] cursor-pointer transition-colors">
              <td className="p-3">
                {p.lead_id ? (
                  <Link to={`/leads/${p.lead_id}`} onClick={(e) => e.stopPropagation()} className="text-sm font-semibold text-[var(--text)] hover:text-emerald-300 transition-colors">{p.lead_name || "Lead"}</Link>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--text-muted)]">
                    <span className="text-[10px] font-medium uppercase tracking-wide bg-[var(--surface-3)] text-[var(--text-faint)] px-1.5 py-0.5 rounded">Standalone</span>
                    {p.customer_email || p.lead_name || "No lead"}
                  </span>
                )}
                <div className="text-xs text-[var(--text-faint)]">{p.description}</div>
              </td>
              <td className="p-3">
                <div className="text-sm font-mono font-semibold text-[var(--text)]">{money(p.amount, p.currency)}</div>
                {p.currency !== "usd" && (
                  <div className="text-[11px] text-[var(--text-faint)] font-mono">≈ {money(p.amount_usd ?? p.amount)}</div>
                )}
              </td>
              <td className="p-3 text-sm text-[var(--text-muted)] capitalize">{p.provider}</td>
              <td className="p-3 text-sm text-[var(--text-muted)]">{p.agent_name}</td>
              <td className="p-3"><Badge className={paymentStatusClass(p.payment_status)}>{p.payment_status}</Badge></td>
              <td className="p-3 text-xs text-[var(--text-faint)] font-mono">{fmtDateTime(p.created_at)}</td>
              <td className="p-3">
                <div className="flex items-center gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
                  {p.payment_link && (
                    <button onClick={() => { Promise.resolve(navigator.clipboard?.writeText(p.payment_link)).then(() => toast.success("Copied")).catch(() => toast.message("Copy link", { description: p.payment_link })); }} className="text-[var(--text-faint)] hover:text-[var(--text)]" title="Copy link"><Copy className="w-3.5 h-3.5" /></button>
                  )}
                  {p.payment_status !== "paid" && p.provider === "stripe" && (
                    <button onClick={() => onRefresh(p)} className="text-[var(--text-faint)] hover:text-[var(--text)]" title="Refresh status" data-testid={`refresh-${p.id}`}><RefreshCw className="w-3.5 h-3.5" /></button>
                  )}
                  {p.payment_status !== "paid" && p.provider === "razorpay" && (
                    <button onClick={() => onSimulate(p)} className="text-emerald-400 hover:text-emerald-300" title="Mark paid (Razorpay sim)" data-testid={`simulate-${p.id}`}><CheckCircle2 className="w-3.5 h-3.5" /></button>
                  )}
                  {!p.lead_id && onLinkLead && (
                    <button onClick={() => onLinkLead(p)} className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 hover:text-emerald-300" title="Attach this payment to a lead" data-testid={`link-lead-${p.id}`}><Link2 className="w-3.5 h-3.5" /> Link to lead</button>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {payments.length === 0 && (
            <tr><td colSpan={7} className="p-12 text-center text-[var(--text-faint)] text-sm">No payment links yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
