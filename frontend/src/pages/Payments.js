import { useEffect, useState } from "react";
import { toast } from "sonner";
import client, { apiError } from "@/api";
import { useAuth } from "@/context/AuthContext";
import { FxRateCard, PaymentsSummary, PaymentsTable } from "@/components/payments/PaymentsWidgets";

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
          <h1 className="font-heading text-3xl font-bold tracking-tighter text-zinc-900">Payments</h1>
          <p className="text-sm text-zinc-500 mt-1">Stripe + Razorpay links · all revenue reported in USD</p>
        </div>
        <FxRateCard
          isAdmin={isAdmin}
          fxRate={fxRate}
          rateInput={rateInput}
          setRateInput={setRateInput}
          onSave={saveRate}
          saving={savingRate}
        />
      </div>

      <PaymentsSummary totalPaid={totalPaid} totalPending={totalPending} count={payments.length} />

      <PaymentsTable payments={payments} onRefresh={refresh} onSimulate={simulate} />

      <p className="text-[11px] text-zinc-400">Razorpay is simulated for V1. Use the check action to mark a Razorpay link as paid. Stripe is live in test mode.</p>
    </div>
  );
}
