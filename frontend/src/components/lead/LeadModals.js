import { money, BOOKING_DRIVERS } from "@/components/helpers";
import Modal, { Field, inputCls, btnPrimary, btnSecondary } from "@/components/Modal";
import { CheckCircle2 } from "lucide-react";

const PRODUCT_LINES = [
  "Credit Top-Up",
  "Annual Pro Subscription",
  "Dedicated Support",
  "Lifetime Access",
];

// Fixed-price defaults for the 3 non-credit lines (USD). These mirror the backend
// PRESET_PACKAGES placeholders; the rep can still edit the amount to discount.
const FIXED_LINE = {
  "Annual Pro Subscription": { package_id: "annual_pro", amount: 1999 },
  "Dedicated Support": { package_id: "dedicated_support", amount: 3499 },
  "Lifetime Access": { package_id: "lifetime_access", amount: 5999 },
};

// Build the payForm patch for a newly selected product line.
function lineDefaults(newLine, payForm, mb) {
  if (newLine === "Credit Top-Up") {
    return {
      ...payForm,
      product_line: newLine,
      package_id: "",
      amount: "",
      currency: payForm.currency || "usd",
      multiplier: payForm.multiplier != null && payForm.multiplier !== "" ? payForm.multiplier : mb.default,
      credits: "",
      boost_credits: "",
      description: "",
    };
  }
  const fx = FIXED_LINE[newLine] || {};
  return {
    ...payForm,
    product_line: newLine,
    package_id: fx.package_id || "",
    amount: fx.amount != null ? String(fx.amount) : "",
    currency: payForm.currency || "usd",
    multiplier: "",
    credits: "",
    boost_credits: "",
    description: newLine,
  };
}

// Derive live credit values for the Credit Top-Up preview.
function creditPreview(payForm, mb, fxRate) {
  const mult = Number(payForm.multiplier) || mb.default;
  const amt = Number(payForm.amount) || 0;
  const usdForCredits = payForm.currency === "inr" && fxRate ? amt / fxRate : amt;
  return { mult, amt, usdForCredits, liveCredits: Math.round(usdForCredits * mult) };
}

function CreditFields({ payForm, setPayForm, mb, preview }) {
  const { mult, amt, usdForCredits, liveCredits } = preview;
  return (
    <>
      <Field label={`Multiplier - ${mult}× (max ${mb.max})`}>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={mb.min}
            max={mb.max}
            step={0.5}
            value={mult}
            onChange={(e) => setPayForm({ ...payForm, multiplier: Number(e.target.value) })}
            className="flex-1"
            data-testid="pay-multiplier"
          />
          <span className="text-sm font-semibold tabular-nums w-12 text-right">{mult}×</span>
        </div>
        <div className="text-[11px] text-zinc-400 mt-1">Range {mb.min}-{mb.max} · max 10</div>
      </Field>
      <div className="-mt-1 mb-3 text-sm" data-testid="credits-preview">
        Credits delivered: <span className="font-semibold text-zinc-800">{liveCredits.toLocaleString()}</span>
        <span className="text-zinc-400"> &nbsp;({amt ? (payForm.currency === "inr" ? `≈$${Math.round(usdForCredits).toLocaleString()}` : `$${amt.toLocaleString()}`) : "-"} × {mult})</span>
      </div>
    </>
  );
}

function FxNote({ payForm, fxRate }) {
  if (!(payForm.currency === "inr" && Number(payForm.amount) > 0)) return null;
  return (
    <div className="-mt-1 mb-3 text-xs text-zinc-500" data-testid="fx-preview">
      ≈ <span className="font-semibold text-zinc-800">{money(Number(payForm.amount) / fxRate)}</span> at ₹{fxRate}/$1 · reported in USD
    </div>
  );
}

export function PaymentModal({ open, onClose, payForm, setPayForm, packages, fxRate, meta, standalone, onSubmit }) {
  const mb = meta?.credit_multiplier || { min: 6, default: 7.5, max: 10 };
  const line = payForm.product_line || "Credit Top-Up";
  const isCredit = line === "Credit Top-Up";
  const preview = creditPreview(payForm, mb, fxRate);

  return (
    <Modal open={open} onClose={onClose} title={standalone ? "New Payment Link" : "Send Payment Link"} testid="payment-modal">
      {standalone && (
        <div className="mb-3 grid grid-cols-2 gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
          <div className="col-span-2 text-[11px] font-medium text-zinc-500">
            Standalone link - leave the email blank, or enter a customer email to auto-attach it to a matching lead.
          </div>
          <Field label="Customer email (optional)">
            <input className={inputCls} value={payForm.customer_email || ""} onChange={(e) => setPayForm({ ...payForm, customer_email: e.target.value })} placeholder="customer@company.com" data-testid="pay-customer-email" />
          </Field>
          <Field label="Customer name (optional)">
            <input className={inputCls} value={payForm.customer_name || ""} onChange={(e) => setPayForm({ ...payForm, customer_name: e.target.value })} placeholder="Acme Inc." data-testid="pay-customer-name" />
          </Field>
        </div>
      )}
      <Field label="Provider">
        <select className={inputCls} value={payForm.provider} onChange={(e) => setPayForm({ ...payForm, provider: e.target.value })} data-testid="pay-provider">
          <option value="stripe">Stripe</option>
          <option value="razorpay">Razorpay</option>
        </select>
      </Field>
      <Field label="Product line">
        <select className={inputCls} value={line} onChange={(e) => setPayForm(lineDefaults(e.target.value, payForm, mb))} data-testid="pay-product-line">
          {(meta?.product_lines || PRODUCT_LINES).map((pl) => (
            <option key={pl} value={pl}>{pl}</option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Currency">
          <select className={inputCls} value={payForm.currency} onChange={(e) => setPayForm({ ...payForm, currency: e.target.value })} data-testid="pay-currency">
            <option value="usd">USD</option>
            <option value="inr">INR</option>
          </select>
        </Field>
        <div className="col-span-2">
          <Field label={isCredit
            ? `Amount (${payForm.currency.toUpperCase()})`
            : `Amount (${payForm.currency.toUpperCase()}) - edit to discount`}>
            <input type="number" className={inputCls} value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} data-testid="pay-amount" placeholder={isCredit ? "200" : "1999"} />
          </Field>
        </div>
      </div>

      {isCredit && <CreditFields payForm={payForm} setPayForm={setPayForm} mb={mb} preview={preview} />}
      <FxNote payForm={payForm} fxRate={fxRate} />

      <Field label="Description (optional)">
        <input className={inputCls} value={payForm.description} onChange={(e) => setPayForm({ ...payForm, description: e.target.value })} placeholder={isCredit ? "Credit Top-Up - $200 -> 1,500 credits (7.5x)" : line} />
      </Field>
      <div className="flex justify-end gap-2 mt-2">
        <button type="button" className={btnSecondary} onClick={onClose}>Cancel</button>
        <button type="button" className={btnPrimary} onClick={onSubmit} data-testid="generate-payment-btn">Generate & Copy Link</button>
      </div>
      <p className="text-[11px] text-zinc-400 mt-3 flex items-center gap-1">
        <CheckCircle2 className="w-3 h-3" />
        {isCredit
          ? "Credits = amount × multiplier. Link copied automatically."
          : "Fixed-price line - edit the amount to discount. Link copied automatically."}
      </p>
    </Modal>
  );
}

export function ReopenModal({ open, onClose, ownerName, reopenForm, setReopenForm, onSubmit }) {
  return (
    <Modal open={open} onClose={onClose} title="Reopen for Upsell / Cross-sell" testid="reopen-modal">
      <p className="text-xs text-zinc-500 mb-3">
        Starts a new opportunity and keeps ownership with{" "}
        <span className="font-semibold text-zinc-700">{ownerName}</span>.
      </p>
      <Field label="Opportunity Type">
        <select className={inputCls} value={reopenForm.type} onChange={(e) => setReopenForm({ ...reopenForm, type: e.target.value })} data-testid="reopen-type">
          <option>Upsell</option>
          <option>Cross-sell</option>
          <option>Renewal</option>
        </select>
      </Field>
      <Field label="Reason / Context">
        <textarea className={`${inputCls} min-h-[80px]`} value={reopenForm.reason} onChange={(e) => setReopenForm({ ...reopenForm, reason: e.target.value })} placeholder="e.g. wants analytics add-on, renewal coming up…" />
      </Field>
      <div className="flex justify-end gap-2 mt-2">
        <button type="button" className={btnSecondary} onClick={onClose}>Cancel</button>
        <button type="button" className={btnPrimary} onClick={onSubmit} data-testid="confirm-reopen-btn">Reopen</button>
      </div>
    </Modal>
  );
}

export function MeetingModal({ open, onClose, meetForm, setMeetForm, onSubmit }) {
  return (
    <Modal open={open} onClose={onClose} title="Book Meeting" testid="meeting-modal">
      <Field label="Date & Time">
        <input type="datetime-local" className={inputCls} value={meetForm.scheduled_at} onChange={(e) => setMeetForm({ ...meetForm, scheduled_at: e.target.value })} data-testid="meet-datetime" />
      </Field>
      <Field label="Duration (min)">
        <input type="number" className={inputCls} value={meetForm.duration} onChange={(e) => setMeetForm({ ...meetForm, duration: e.target.value })} />
      </Field>
      <Field label="Source">
        <select className={inputCls} value={meetForm.source} onChange={(e) => setMeetForm({ ...meetForm, source: e.target.value })}>
          <option>Calendly</option>
          <option>Manual</option>
        </select>
      </Field>
      <Field label="What got them to book? (hook)">
        <select className={inputCls} value={meetForm.booking_driver} onChange={(e) => setMeetForm({ ...meetForm, booking_driver: e.target.value })} data-testid="meet-driver">
          {BOOKING_DRIVERS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </Field>
      <div className="flex justify-end gap-2 mt-2">
        <button type="button" className={btnSecondary} onClick={onClose}>Cancel</button>
        <button type="button" className={btnPrimary} onClick={onSubmit} data-testid="confirm-meeting-btn">Book</button>
      </div>
    </Modal>
  );
}
