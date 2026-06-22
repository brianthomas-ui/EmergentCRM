import { Link } from "react-router-dom";
import { toast } from "sonner";
import { money, Badge, paymentStatusClass, fmtDateTime } from "@/components/helpers";
import { Copy, RefreshCw, CheckCircle2, Link2, ExternalLink } from "lucide-react";
import Modal from "@/components/Modal";
import { MobileCard, CardList } from "@/components/dark/MobileCard";
import { useIsMobile } from "@/hooks/use-is-mobile";

export function FxRateCard({ isAdmin, fxRate, rateInput, setRateInput, onSave, saving }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-lg px-4 py-3" data-testid="fx-card">
      <div className="text-[10px] uppercase tracking-widest text-zinc-400 font-semibold">FX Rate · INR per USD</div>
      {isAdmin ? (
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-sm text-zinc-500">₹</span>
          <input
            type="number"
            value={rateInput}
            onChange={(e) => setRateInput(e.target.value)}
            data-testid="fx-input"
            className="w-20 border border-zinc-200 rounded-md px-2 py-1 text-sm font-mono focus:ring-1 focus:ring-zinc-950 focus:border-zinc-950 outline-none"
          />
          <span className="text-sm text-zinc-500">/ $1</span>
          <button
            onClick={onSave}
            disabled={saving}
            data-testid="fx-save"
            className="bg-zinc-950 text-white rounded-md px-3.5 py-1.5 text-xs font-medium hover:bg-zinc-800 active:scale-[0.98] transition-colors disabled:opacity-60"
          >
            {saving ? "…" : "Save"}
          </button>
        </div>
      ) : (
        <div className="text-lg font-bold text-zinc-900 font-mono mt-1">
          ₹{fxRate} <span className="text-xs text-zinc-400 font-normal">/ $1</span>
        </div>
      )}
    </div>
  );
}

export function PaymentsSummary({ totalPaid, totalPending, count }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-4">
      <div className="bg-white border border-zinc-200 rounded-lg p-3 sm:p-5 min-w-0">
        <div className="text-[10px] uppercase tracking-widest text-zinc-400 font-semibold truncate">Collected</div>
        <div className="font-heading text-lg sm:text-3xl font-bold text-emerald-600 tabular-nums truncate">{money(totalPaid)}</div>
      </div>
      <div className="bg-white border border-zinc-200 rounded-lg p-3 sm:p-5 min-w-0">
        <div className="text-[10px] uppercase tracking-widest text-zinc-400 font-semibold truncate">Pending</div>
        <div className="font-heading text-lg sm:text-3xl font-bold text-amber-600 tabular-nums truncate">{money(totalPending)}</div>
      </div>
      <div className="bg-white border border-zinc-200 rounded-lg p-3 sm:p-5 min-w-0">
        <div className="text-[10px] uppercase tracking-widest text-zinc-400 font-semibold truncate">Links Sent</div>
        <div className="font-heading text-lg sm:text-3xl font-bold text-zinc-900 tabular-nums">{count}</div>
      </div>
    </div>
  );
}

// Action buttons shared by the table row and the mobile card (copy, refresh, simulate, link).
function PaymentRowActions({ p, onRefresh, onSimulate, onLinkLead }) {
  return (
    <>
      {p.payment_link && (
        <button onClick={() => { navigator.clipboard?.writeText(p.payment_link); toast.success("Copied"); }} className="tap-target text-zinc-400 hover:text-zinc-900" title="Copy link"><Copy className="w-4 h-4" /></button>
      )}
      {p.payment_status !== "paid" && p.provider === "stripe" && (
        <button onClick={() => onRefresh(p)} className="tap-target text-zinc-400 hover:text-zinc-900" title="Refresh status" data-testid={`refresh-${p.id}`}><RefreshCw className="w-4 h-4" /></button>
      )}
      {p.payment_status !== "paid" && p.provider === "razorpay" && (
        <button onClick={() => onSimulate(p)} className="tap-target text-emerald-600 hover:text-emerald-800" title="Mark paid (Razorpay sim)" data-testid={`simulate-${p.id}`}><CheckCircle2 className="w-4 h-4" /></button>
      )}
      {!p.lead_id && onLinkLead && (
        <button onClick={() => onLinkLead(p)} className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-900 px-2 py-2" title="Attach this payment to a lead" data-testid={`link-lead-${p.id}`}><Link2 className="w-4 h-4" /> Link to lead</button>
      )}
    </>
  );
}

// Mobile: each payment as a card with the same actions in the footer.
function PaymentsCardList({ payments, onRefresh, onSimulate, onLinkLead, onRowClick }) {
  if (payments.length === 0) {
    return <div className="p-12 text-center text-zinc-400 text-sm">No payment links yet.</div>;
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
    <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-zinc-50 border-b border-zinc-200">
            {["Lead", "Amount", "Provider", "Agent", "Status", "Created", ""].map((h) => (
              <th key={h} className="text-xs font-semibold text-zinc-500 uppercase tracking-widest text-left p-3">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id} data-testid={`pay-row-${p.id}`} onClick={() => onRowClick?.(p)}
                className="border-b border-zinc-100 hover:bg-zinc-50 cursor-pointer">
              <td className="p-3">
                {p.lead_id ? (
                  <Link to={`/leads/${p.lead_id}`} onClick={(e) => e.stopPropagation()} className="text-sm font-semibold text-zinc-900 hover:underline">{p.lead_name || "Lead"}</Link>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-500">
                    <span className="text-[10px] font-medium uppercase tracking-wide bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded">Standalone</span>
                    {p.customer_email || p.lead_name || "No lead"}
                  </span>
                )}
                <div className="text-xs text-zinc-400">{p.description}</div>
              </td>
              <td className="p-3">
                <div className="text-sm font-mono font-semibold text-zinc-900">{money(p.amount, p.currency)}</div>
                {p.currency !== "usd" && (
                  <div className="text-[11px] text-zinc-400 font-mono">≈ {money(p.amount_usd ?? p.amount)}</div>
                )}
              </td>
              <td className="p-3 text-sm text-zinc-700 capitalize">{p.provider}</td>
              <td className="p-3 text-sm text-zinc-700">{p.agent_name}</td>
              <td className="p-3"><Badge className={paymentStatusClass(p.payment_status)}>{p.payment_status}</Badge></td>
              <td className="p-3 text-xs text-zinc-500 font-mono">{fmtDateTime(p.created_at)}</td>
              <td className="p-3">
                <div className="flex items-center gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
                  {p.payment_link && (
                    <button onClick={() => { navigator.clipboard?.writeText(p.payment_link); toast.success("Copied"); }} className="text-zinc-400 hover:text-zinc-900" title="Copy link"><Copy className="w-3.5 h-3.5" /></button>
                  )}
                  {p.payment_status !== "paid" && p.provider === "stripe" && (
                    <button onClick={() => onRefresh(p)} className="text-zinc-400 hover:text-zinc-900" title="Refresh status" data-testid={`refresh-${p.id}`}><RefreshCw className="w-3.5 h-3.5" /></button>
                  )}
                  {p.payment_status !== "paid" && p.provider === "razorpay" && (
                    <button onClick={() => onSimulate(p)} className="text-emerald-600 hover:text-emerald-800" title="Mark paid (Razorpay sim)" data-testid={`simulate-${p.id}`}><CheckCircle2 className="w-3.5 h-3.5" /></button>
                  )}
                  {!p.lead_id && onLinkLead && (
                    <button onClick={() => onLinkLead(p)} className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-900" title="Attach this payment to a lead" data-testid={`link-lead-${p.id}`}><Link2 className="w-3.5 h-3.5" /> Link to lead</button>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {payments.length === 0 && (
            <tr><td colSpan={7} className="p-12 text-center text-zinc-400 text-sm">No payment links yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function DetailRow({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-zinc-100 last:border-0">
      <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 pt-0.5 shrink-0">{label}</span>
      <span className="text-sm text-zinc-800 text-right break-words">{children}</span>
    </div>
  );
}

// Full detail of a single payment - opened by clicking a row in PaymentsTable.
export function PaymentDetailModal({ payment, onClose }) {
  const p = payment;
  if (!p) return null;
  const paid = p.payment_status === "paid";
  const paidAt = p.paid_at || (paid ? p.updated_at : null);
  return (
    <Modal open={!!p} onClose={onClose} title="Payment details" testid="payment-detail-modal" wide>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-2xl font-semibold tracking-tight text-zinc-900 font-mono">{money(p.amount, p.currency)}</div>
          {p.currency !== "usd" && <div className="text-xs text-zinc-400 font-mono">≈ {money(p.amount_usd ?? p.amount)}</div>}
        </div>
        <Badge className={paymentStatusClass(p.payment_status)}>{p.payment_status}</Badge>
      </div>

      {p.payment_link && (
        <div className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
          <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 mb-1.5">Payment link</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs text-zinc-700 truncate">{p.payment_link}</code>
            <button onClick={() => { navigator.clipboard?.writeText(p.payment_link); toast.success("Copied"); }}
                    className="text-zinc-400 hover:text-zinc-900 shrink-0" title="Copy link"><Copy className="w-4 h-4" /></button>
            <a href={p.payment_link} target="_blank" rel="noreferrer" className="text-zinc-400 hover:text-zinc-900 shrink-0" title="Open link"><ExternalLink className="w-4 h-4" /></a>
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-x-8">
        <div>
          <DetailRow label="Provider"><span className="capitalize">{p.provider}</span></DetailRow>
          <DetailRow label="Product">{p.product_line || "-"}</DetailRow>
          <DetailRow label="Description">{p.description || "-"}</DetailRow>
          <DetailRow label="Customer">
            {p.lead_id
              ? <Link to={`/leads/${p.lead_id}`} className="text-emerald-700 hover:underline">{p.lead_name || "View lead"}</Link>
              : (p.customer_email || p.lead_name || "Standalone")}
          </DetailRow>
        </div>
        <div>
          <DetailRow label="Sent">{fmtDateTime(p.created_at)}</DetailRow>
          <DetailRow label="Paid">{paid ? fmtDateTime(paidAt) : <span className="text-zinc-400">Not yet</span>}</DetailRow>
          <DetailRow label="Agent">{p.agent_name || "-"}</DetailRow>
          <DetailRow label="Session"><code className="text-xs text-zinc-500">{p.session_id || "-"}</code></DetailRow>
        </div>
      </div>
    </Modal>
  );
}
