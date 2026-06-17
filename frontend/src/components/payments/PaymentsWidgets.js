import { Link } from "react-router-dom";
import { toast } from "sonner";
import { money, Badge, paymentStatusClass, fmtDateTime } from "@/components/helpers";
import { Copy, RefreshCw, CheckCircle2 } from "lucide-react";

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
    <div className="grid grid-cols-3 gap-4">
      <div className="bg-white border border-zinc-200 rounded-lg p-5">
        <div className="text-[10px] uppercase tracking-widest text-zinc-400 font-semibold">Collected</div>
        <div className="font-heading text-3xl font-bold text-emerald-600">{money(totalPaid)}</div>
      </div>
      <div className="bg-white border border-zinc-200 rounded-lg p-5">
        <div className="text-[10px] uppercase tracking-widest text-zinc-400 font-semibold">Pending</div>
        <div className="font-heading text-3xl font-bold text-amber-600">{money(totalPending)}</div>
      </div>
      <div className="bg-white border border-zinc-200 rounded-lg p-5">
        <div className="text-[10px] uppercase tracking-widest text-zinc-400 font-semibold">Links Sent</div>
        <div className="font-heading text-3xl font-bold text-zinc-900">{count}</div>
      </div>
    </div>
  );
}

export function PaymentsTable({ payments, onRefresh, onSimulate }) {
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
            <tr key={p.id} data-testid={`pay-row-${p.id}`} className="border-b border-zinc-100 hover:bg-zinc-50">
              <td className="p-3"><Link to={`/leads/${p.lead_id}`} className="text-sm font-semibold text-zinc-900 hover:underline">{p.lead_name}</Link>
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
                <div className="flex items-center gap-2 justify-end">
                  {p.payment_link && (
                    <button onClick={() => { navigator.clipboard?.writeText(p.payment_link); toast.success("Copied"); }} className="text-zinc-400 hover:text-zinc-900" title="Copy link"><Copy className="w-3.5 h-3.5" /></button>
                  )}
                  {p.payment_status !== "paid" && p.provider === "stripe" && (
                    <button onClick={() => onRefresh(p)} className="text-zinc-400 hover:text-zinc-900" title="Refresh status" data-testid={`refresh-${p.id}`}><RefreshCw className="w-3.5 h-3.5" /></button>
                  )}
                  {p.payment_status !== "paid" && p.provider === "razorpay" && (
                    <button onClick={() => onSimulate(p)} className="text-emerald-600 hover:text-emerald-800" title="Mark paid (Razorpay sim)" data-testid={`simulate-${p.id}`}><CheckCircle2 className="w-3.5 h-3.5" /></button>
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
