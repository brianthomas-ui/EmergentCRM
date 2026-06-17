import { money, BOOKING_DRIVERS } from "@/components/helpers";
import Modal, { Field, inputCls, btnPrimary, btnSecondary } from "@/components/Modal";
import { CheckCircle2 } from "lucide-react";

export function PaymentModal({ open, onClose, payForm, setPayForm, packages, fxRate, onSubmit }) {
  return (
    <Modal open={open} onClose={onClose} title="Send Payment Link" testid="payment-modal">
      <Field label="Provider">
        <select className={inputCls} value={payForm.provider} onChange={(e) => setPayForm({ ...payForm, provider: e.target.value })} data-testid="pay-provider">
          <option value="stripe">Stripe</option>
          <option value="razorpay">Razorpay</option>
        </select>
      </Field>
      <Field label="Preset Package">
        <select className={inputCls} value={payForm.package_id} onChange={(e) => setPayForm({ ...payForm, package_id: e.target.value })} data-testid="pay-package">
          <option value="">Custom amount</option>
          {Object.entries(packages).map(([key, p]) => (
            <option key={key} value={key}>{p.name} · {money(p.amount, p.currency)}</option>
          ))}
        </select>
      </Field>
      {!payForm.package_id && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Currency">
              <select className={inputCls} value={payForm.currency} onChange={(e) => setPayForm({ ...payForm, currency: e.target.value })} data-testid="pay-currency">
                <option value="usd">USD</option>
                <option value="inr">INR</option>
              </select>
            </Field>
            <div className="col-span-2">
              <Field label={`Amount (${payForm.currency.toUpperCase()})`}>
                <input type="number" className={inputCls} value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} data-testid="pay-amount" placeholder="2500" />
              </Field>
            </div>
          </div>
          {payForm.currency === "inr" && Number(payForm.amount) > 0 && (
            <div className="-mt-1 mb-3 text-xs text-zinc-500" data-testid="fx-preview">
              ≈ <span className="font-semibold text-zinc-800">{money(Number(payForm.amount) / fxRate)}</span> at ₹{fxRate}/$1 · reported in USD
            </div>
          )}
          <Field label="Description">
            <input className={inputCls} value={payForm.description} onChange={(e) => setPayForm({ ...payForm, description: e.target.value })} placeholder="Scale plan upgrade" />
          </Field>
        </>
      )}
      <div className="flex justify-end gap-2 mt-2">
        <button className={btnSecondary} onClick={onClose}>Cancel</button>
        <button className={btnPrimary} onClick={onSubmit} data-testid="generate-payment-btn">Generate & Copy Link</button>
      </div>
      <p className="text-[11px] text-zinc-400 mt-3 flex items-center gap-1">
        <CheckCircle2 className="w-3 h-3" /> Link copied to clipboard automatically. Stripe is live (test mode).
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
        <button className={btnSecondary} onClick={onClose}>Cancel</button>
        <button className={btnPrimary} onClick={onSubmit} data-testid="confirm-reopen-btn">Reopen</button>
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
        <button className={btnSecondary} onClick={onClose}>Cancel</button>
        <button className={btnPrimary} onClick={onSubmit} data-testid="confirm-meeting-btn">Book</button>
      </div>
    </Modal>
  );
}
