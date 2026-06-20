import { useEffect, useState, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import client from "@/api";
import { money } from "@/components/helpers";
import { CheckCircle2, Clock, XCircle, ArrowRight } from "lucide-react";

export default function PaymentReturn() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");
  const [state, setState] = useState("checking"); // checking, paid, pending, error
  const [record, setRecord] = useState(null);

  const poll = useCallback(
    async (attempt = 0) => {
      if (attempt >= 6) {
        setState("pending");
        return;
      }
      try {
        const { data } = await client.get(`/payments/status/${sessionId}`);
        setRecord(data);
        if (data.payment_status === "paid") {
          setState("paid");
          return;
        }
        if (data.status === "expired") {
          setState("error");
          return;
        }
        setTimeout(() => poll(attempt + 1), 2000);
      } catch {
        setState("error");
      }
    },
    [sessionId]
  );

  useEffect(() => {
    if (!sessionId) {
      setState("error");
      return;
    }
    poll();
  }, [sessionId, poll]);

  const cfg = {
    checking: { icon: Clock, color: "text-amber-500", title: "Checking payment status…", sub: "Hold tight, verifying with the provider." },
    paid: { icon: CheckCircle2, color: "text-emerald-500", title: "Payment completed", sub: "The deal has been marked as Won. 🎉" },
    pending: { icon: Clock, color: "text-amber-500", title: "Payment still pending", sub: "We'll update the lead once the payment clears." },
    error: { icon: XCircle, color: "text-red-500", title: "Could not verify payment", sub: "Please check the payment record in the CRM." },
  }[state];
  const Icon = cfg.icon;

  return (
    <div className="flex items-center justify-center min-h-[70vh]">
      <div className="bg-white border border-zinc-200 rounded-lg p-10 max-w-md w-full text-center" data-testid="payment-return">
        <Icon className={`w-14 h-14 mx-auto mb-4 ${cfg.color}`} />
        <h1 className="font-heading text-2xl font-bold tracking-tight text-zinc-900">{cfg.title}</h1>
        <p className="text-sm text-zinc-500 mt-2">{cfg.sub}</p>
        {record && (
          <div className="mt-5 border border-zinc-200 rounded-lg p-4 text-left">
            <div className="flex justify-between text-sm py-1"><span className="text-zinc-400">Lead</span><span className="font-semibold text-zinc-900">{record.lead_name}</span></div>
            <div className="flex justify-between text-sm py-1"><span className="text-zinc-400">Amount</span><span className="font-mono font-semibold text-zinc-900">{money(record.amount, record.currency)}</span></div>
            <div className="flex justify-between text-sm py-1"><span className="text-zinc-400">Status</span><span className="font-semibold capitalize">{record.payment_status}</span></div>
          </div>
        )}
        <Link to="/payments" className="inline-flex items-center gap-1.5 mt-6 text-sm font-semibold text-zinc-950 hover:text-zinc-600 underline underline-offset-2">
          Go to Payments <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
