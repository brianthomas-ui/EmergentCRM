import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Search, X } from "lucide-react";
import client, { apiError } from "@/api";
import { useAuth } from "@/context/AuthContext";
import { useOpen } from "@/hooks/useOpen";
import { FxRateCard, PaymentsSummary, PaymentsTable } from "@/components/payments/PaymentsWidgets";
import { PaymentModal } from "@/components/lead/LeadModals";

const EMPTY_PAY_FORM = {
  provider: "stripe",
  product_line: "Credit Top-Up",
  package_id: "",
  amount: "",
  currency: "usd",
  multiplier: 7.5,
  description: "",
  credits: "",
  boost_credits: "",
  customer_email: "",
  customer_name: "",
};

function LeadPicker({ open, onClose, onPick }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const t = setTimeout(() => {
      client
        .get("/leads", { params: { search: q, period: "all" } })
        .then((r) => setResults((r.data || []).slice(0, 25)))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q, open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-[var(--surface-1)] border border-[var(--border)] shadow-2xl flex flex-col max-h-[80vh]" data-testid="lead-picker-modal">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 className="font-semibold text-[var(--text)]">Select a lead for the payment link</h2>
          <button onClick={onClose} className="text-[var(--text-faint)] hover:text-[var(--text)] transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-faint)]" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search lead by name, company, email…"
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-[var(--surface-3)] border border-[var(--border)] text-sm text-[var(--text)] placeholder-[var(--text-faint)] outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50"
              data-testid="lead-picker-search"
            />
          </div>
        </div>
        <div className="overflow-y-auto px-2 pb-3">
          {loading && <p className="px-3 py-2 text-xs text-[var(--text-faint)]">Searching…</p>}
          {!loading && results.length === 0 && <p className="px-3 py-6 text-center text-xs text-[var(--text-faint)]">No leads found.</p>}
          {results.map((l) => (
            <button
              key={l.id}
              onClick={() => onPick(l)}
              data-testid={`lead-picker-option-${l.id}`}
              className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-[var(--surface-2)] transition-colors"
            >
              <div className="text-sm font-medium text-[var(--text)]">{l.name}</div>
              <div className="text-xs text-[var(--text-faint)]">{l.company || l.email}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Payments() {
  const { isAdmin } = useAuth();
  const open = useOpen();
  const [payments, setPayments] = useState([]);
  const [fxRate, setFxRate] = useState(85);
  const [rateInput, setRateInput] = useState("");
  const [savingRate, setSavingRate] = useState(false);

  // New-payment-link flow
  const [meta, setMeta] = useState(null);
  const [packages, setPackages] = useState({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [linkLead, setLinkLead] = useState(null);
  const [linkTarget, setLinkTarget] = useState(null); // a standalone payment to attach to a lead
  const [payForm, setPayForm] = useState(EMPTY_PAY_FORM);

  const load = () => client.get("/payments").then((r) => setPayments(r.data));
  const loadRate = () =>
    client.get("/settings").then((r) => {
      setFxRate(r.data.inr_per_usd);
      setRateInput(String(r.data.inr_per_usd));
    });
  useEffect(() => {
    load();
    loadRate();
    client.get("/meta").then((r) => setMeta(r.data)).catch(() => {});
    client.get("/payments/packages").then((r) => setPackages(r.data)).catch(() => {});
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

  // Open the create modal for a STANDALONE link (no lead pre-selected).
  const newStandaloneLink = () => {
    setLinkLead(null);
    setPayForm(EMPTY_PAY_FORM);
    setPayOpen(true);
  };

  // LeadPicker is now used to attach an existing standalone payment to a lead.
  const onPickLead = async (lead) => {
    if (!linkTarget) { setPickerOpen(false); return; }
    try {
      await client.post(`/payments/${linkTarget.id}/link-lead`, { lead_id: lead.id });
      toast.success(`Linked payment to ${lead.name}`);
      setPickerOpen(false);
      setLinkTarget(null);
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const createPayment = async () => {
    try {
      const isCredit = (payForm.product_line || "Credit Top-Up") === "Credit Top-Up";
      const body = {
        provider: payForm.provider,
        origin_url: window.location.origin,
        package_id: payForm.package_id || null,
        product_line: payForm.product_line || "Credit Top-Up",
        currency: payForm.currency,
        description: payForm.description || "",
      };
      if (linkLead) body.lead_id = linkLead.id;
      else if (payForm.customer_email) {
        body.customer_email = payForm.customer_email.trim();
        if (payForm.customer_name) body.customer_name = payForm.customer_name.trim();
      }
      if (payForm.amount !== "" && payForm.amount != null) body.amount = Number(payForm.amount);
      if (isCredit) {
        const mult = Number(payForm.multiplier) || (meta?.credit_multiplier?.default ?? 7.5);
        body.multiplier = mult;
        if (body.amount) {
          const usd = payForm.currency === "inr" && fxRate ? body.amount / fxRate : body.amount;
          body.credits = Math.round(usd * mult);
        }
      } else {
        if (payForm.credits !== "" && payForm.credits != null) body.credits = Number(payForm.credits);
        if (payForm.boost_credits !== "" && payForm.boost_credits != null) body.boost_credits = Number(payForm.boost_credits);
      }
      const { data: rec } = await client.post("/payments/link", body);
      toast.success(rec.lead_id ? `Payment link attached to ${rec.lead_name}` : "Standalone payment link created");
      setPayOpen(false);
      setLinkLead(null);
      load();
      if (rec.payment_link) navigator.clipboard?.writeText(rec.payment_link).catch(() => {});
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const startLinkToLead = (payment) => {
    setLinkTarget(payment);
    setPickerOpen(true);
  };

  const totalPaid = payments.filter((p) => p.payment_status === "paid").reduce((s, p) => s + (p.amount_usd ?? p.amount), 0);
  const totalPending = payments.filter((p) => p.payment_status !== "paid").reduce((s, p) => s + (p.amount_usd ?? p.amount), 0);

  const openBreakdown = (kind) => {
    const titles = {
      collected: "Collected · paid payments",
      pending: "Pending · awaiting payment",
      links: "Links sent · all payment links",
    };
    open.openDrill({ kind: "payments", metric: kind, title: titles[kind] || "Payments" });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-[var(--text)]">Payments</h1>
          <p className="text-sm text-[var(--text-faint)] mt-1">Stripe + Razorpay links · all revenue reported in USD</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={newStandaloneLink}
            data-tour="new-payment-link"
            data-testid="new-payment-link-btn"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-emerald-950 px-4 py-2 text-sm font-semibold transition-colors active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" /> New Payment Link
          </button>
          <FxRateCard
            isAdmin={isAdmin}
            fxRate={fxRate}
            rateInput={rateInput}
            setRateInput={setRateInput}
            onSave={saveRate}
            saving={savingRate}
          />
        </div>
      </div>

      <PaymentsSummary totalPaid={totalPaid} totalPending={totalPending} count={payments.length} onDrill={openBreakdown} />

      <PaymentsTable payments={payments} onRefresh={refresh} onSimulate={simulate} onLinkLead={startLinkToLead} onRowClick={(p) => open.openPayment(p)} />

      <p className="text-[11px] text-[var(--text-faint)]">Create a standalone link (no lead needed), or enter a customer email to auto-attach it to a matching lead. Unlinked links can be attached to a lead later.</p>

      <LeadPicker open={pickerOpen} onClose={() => { setPickerOpen(false); setLinkTarget(null); }} onPick={onPickLead} />
      <PaymentModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        payForm={payForm}
        setPayForm={setPayForm}
        packages={packages}
        fxRate={fxRate}
        meta={meta}
        standalone={!linkLead}
        onSubmit={createPayment}
      />
    </div>
  );
}
