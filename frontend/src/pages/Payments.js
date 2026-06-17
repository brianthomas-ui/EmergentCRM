import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import client, { apiError } from "@/api";
import { useAuth } from "@/context/AuthContext";
import { money, Badge, paymentStatusClass, fmtDateTime } from "@/components/helpers";
import { Copy, RefreshCw, CheckCircle2 } from "lucide-react";

export default function Payments() {
  const { isAdmin } = useAuth();
  const [payments, setPayments] = useState([]);
  const [fxRate, setFxRate] = useState(85);
  const [rateInput, setRateInput] = useState("");
  const [savingRate, setSavingRate] = useState(false);

  const load = () => client.get("/payments").then((r) => setPayments(r.data));
  const loadRate = () =>
    client.get("/settings").then((r) => {
      setFxRate(r.data.inr_per_usd);
      setRateInput(String(r.data.inr_per_usd));
    });
  useEffect(() => {
    load();
    loadRate();
  }, []);

  const saveRate = async () => {
    setSavingRate(true);
    try {
      const { data } = await client.put("/settings", { inr_per_usd: Number(rateInput) });
      setFxRate(data.inr_per_usd);
      toast.success("Conversion rate updated");
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSavingRate(false);
    }
  };

  const refresh = async (p) => {
    try {
      if (p.provider === "stripe") await client.get(`/payments/status/${p.session_id}`);
      load();
      toast.success("Status refreshed");
    } catch {
      toast.error("Could not refresh");
    }
  };

  const simulate = async (p) => {
    try {
      await client.post(`/payments/simulate/${p.session_id}`);
      toast.success("Marked as paid");
      load();
    } catch {
      toast.error("Failed");
    }
  };

  const totalPaid = payments.filter((p) => p.payment_status === "paid").reduce((s, p) => s + (p.amount_usd ?? p.amount), 0);
  const totalPending = payments.filter((p) => p.payment_status !== "paid").reduce((s, p) => s + (p.amount_usd ?? p.amount), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tighter text-slate-900">Payments</h1>
          <p className="text-sm text-slate-500 mt-1">Stripe + Razorpay links · all revenue reported in USD</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3" data-testid="fx-card">
          <div className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">FX Rate · INR per USD</div>
          {isAdmin ? (
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-sm text-slate-500">₹</span>
              <input
                type="number"
                value={rateInput}
                onChange={(e) => setRateInput(e.target.value)}
                data-testid="fx-input"
                className="w-20 border border-slate-200 rounded-lg px-2 py-1 text-sm font-mono focus:ring-2 focus:ring-indigo-500/25 outline-none"
              />
              <span className="text-sm text-slate-500">/ $1</span>
              <button
                onClick={saveRate}
                disabled={savingRate}
                data-testid="fx-save"
                className="bg-slate-900 text-white rounded-full px-3.5 py-1.5 text-xs font-semibold hover:bg-slate-800 disabled:opacity-60"
              >
                {savingRate ? "…" : "Save"}
              </button>
            </div>
          ) : (
            <div className="text-lg font-bold text-slate-900 font-mono mt-1">
              ₹{fxRate} <span className="text-xs text-slate-400 font-normal">/ $1</span>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Collected</div>
          <div className="font-heading text-3xl font-bold text-emerald-600">{money(totalPaid)}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Pending</div>
          <div className="font-heading text-3xl font-bold text-amber-600">{money(totalPending)}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Links Sent</div>
          <div className="font-heading text-3xl font-bold text-slate-900">{payments.length}</div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {["Lead", "Amount", "Provider", "Agent", "Status", "Created", ""].map((h) => (
                <th key={h} className="text-xs font-semibold text-slate-500 uppercase tracking-widest text-left p-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} data-testid={`pay-row-${p.id}`} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="p-3"><Link to={`/leads/${p.lead_id}`} className="text-sm font-semibold text-slate-900 hover:underline">{p.lead_name}</Link>
                  <div className="text-xs text-slate-400">{p.description}</div>
                </td>
                <td className="p-3">
                  <div className="text-sm font-mono font-semibold text-slate-900">{money(p.amount, p.currency)}</div>
                  {p.currency !== "usd" && (
                    <div className="text-[11px] text-slate-400 font-mono">≈ {money(p.amount_usd ?? p.amount)}</div>
                  )}
                </td>
                <td className="p-3 text-sm text-slate-700 capitalize">{p.provider}</td>
                <td className="p-3 text-sm text-slate-700">{p.agent_name}</td>
                <td className="p-3"><Badge className={paymentStatusClass(p.payment_status)}>{p.payment_status}</Badge></td>
                <td className="p-3 text-xs text-slate-500 font-mono">{fmtDateTime(p.created_at)}</td>
                <td className="p-3">
                  <div className="flex items-center gap-2 justify-end">
                    {p.payment_link && (
                      <button onClick={() => { navigator.clipboard?.writeText(p.payment_link); toast.success("Copied"); }} className="text-slate-400 hover:text-slate-900" title="Copy link"><Copy className="w-3.5 h-3.5" /></button>
                    )}
                    {p.payment_status !== "paid" && p.provider === "stripe" && (
                      <button onClick={() => refresh(p)} className="text-slate-400 hover:text-slate-900" title="Refresh status" data-testid={`refresh-${p.id}`}><RefreshCw className="w-3.5 h-3.5" /></button>
                    )}
                    {p.payment_status !== "paid" && p.provider === "razorpay" && (
                      <button onClick={() => simulate(p)} className="text-emerald-600 hover:text-emerald-800" title="Mark paid (Razorpay sim)" data-testid={`simulate-${p.id}`}><CheckCircle2 className="w-3.5 h-3.5" /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr><td colSpan={7} className="p-12 text-center text-slate-400 text-sm">No payment links yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-400">Razorpay is simulated for V1 — use the ✓ action to mark a Razorpay link as paid. Stripe is live in test mode.</p>
    </div>
  );
}
