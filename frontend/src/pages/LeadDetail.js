import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import client, { apiError } from "@/api";
import { useAuth } from "@/context/AuthContext";
import {
  money,
  Badge,
  stageClass,
  priorityClass,
  paymentStatusClass,
  STAGES,
  PRIORITIES,
  fmtDateTime,
  timeAgo,
  BOOKING_DRIVERS,
  REGIONS,
} from "@/components/helpers";
import Modal, { Field, inputCls, btnPrimary, btnSecondary } from "@/components/Modal";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Minus,
  CreditCard,
  CalendarPlus,
  Copy,
  Activity,
  StickyNote,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";

const trendIcon = { rising: TrendingUp, declining: TrendingDown, stable: Minus };

export default function LeadDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [note, setNote] = useState("");
  const [noteType, setNoteType] = useState("Note");
  const [payModal, setPayModal] = useState(false);
  const [meetModal, setMeetModal] = useState(false);
  const [reopenModal, setReopenModal] = useState(false);
  const [reopenForm, setReopenForm] = useState({ type: "Upsell", reason: "" });
  const [packages, setPackages] = useState({});

  const [payForm, setPayForm] = useState({ provider: "stripe", package_id: "", amount: "", currency: "usd", description: "" });
  const [meetForm, setMeetForm] = useState({ scheduled_at: "", duration: 30, source: "Calendly", booking_driver: "Support" });
  const [fxRate, setFxRate] = useState(85);

  const load = () => client.get(`/leads/${id}`).then((r) => setData(r.data));

  useEffect(() => {
    load();
    client.get("/payments/packages").then((r) => setPackages(r.data));
    client.get("/settings").then((r) => setFxRate(r.data.inr_per_usd));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!data) return <div className="text-slate-400 text-sm">Loading…</div>;
  const { lead, activities, meetings, payments } = data;
  const TrendIco = trendIcon[lead.usage_trend] || Minus;

  const updateStage = async (stage) => {
    await client.put(`/leads/${id}/stage`, { stage });
    toast.success(`Stage → ${stage}`);
    load();
  };
  const updatePriority = async (priority) => {
    await client.put(`/leads/${id}`, { priority });
    toast.success("Priority updated");
    load();
  };
  const updateRegion = async (region) => {
    await client.put(`/leads/${id}`, { region });
    toast.success("Region updated");
    load();
  };
  const doReopen = async () => {
    try {
      await client.post(`/leads/${id}/reopen`, reopenForm);
      toast.success(`New ${reopenForm.type} routed to ${lead.owner_name}`);
      setReopenModal(false);
      setReopenForm({ type: "Upsell", reason: "" });
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };
  const addNote = async () => {
    if (!note.trim()) return;
    await client.post(`/leads/${id}/notes`, { text: note, type: noteType });
    setNote("");
    toast.success("Note added");
    load();
  };

  const createPayment = async () => {
    try {
      const body = {
        lead_id: id,
        provider: payForm.provider,
        origin_url: window.location.origin,
      };
      if (payForm.package_id) body.package_id = payForm.package_id;
      else {
        body.amount = Number(payForm.amount);
        body.currency = payForm.currency;
        body.description = payForm.description;
      }
      const { data: rec } = await client.post("/payments/link", body);
      toast.success("Payment link generated");
      setPayModal(false);
      setPayForm({ provider: "stripe", package_id: "", amount: "", currency: "usd", description: "" });
      load();
      if (rec.payment_link) {
        navigator.clipboard?.writeText(rec.payment_link).catch(() => {});
      }
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const bookMeeting = async () => {
    try {
      await client.post("/meetings", {
        lead_id: id,
        scheduled_at: new Date(meetForm.scheduled_at).toISOString(),
        duration: Number(meetForm.duration),
        source: meetForm.source,
        booking_driver: meetForm.booking_driver,
      });
      toast.success("Meeting booked");
      setMeetModal(false);
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <div className="space-y-5">
      <Link to="/leads" className="text-sm text-slate-500 hover:text-slate-900 inline-flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Back to leads
      </Link>

      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tighter text-slate-900" data-testid="lead-detail-name">
            {lead.name}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {lead.company} · {lead.email} · {lead.phone}
          </p>
          <div className="flex items-center gap-2 mt-3">
            <Badge className={stageClass(lead.stage)}>{lead.stage}</Badge>
            <Badge className={priorityClass(lead.priority)}>{lead.priority}</Badge>
            <span className="text-xs text-slate-400">Owner: {lead.owner_name || "Unassigned"}</span>
            {lead.owner_locked && (
              <Badge className="bg-slate-900 text-white border-slate-900">🔒 Locked to owner</Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(lead.stage === "Won" || lead.stage === "Lost") && (
            <button className={btnSecondary} onClick={() => setReopenModal(true)} data-testid="reopen-btn">
              <RefreshCw className="w-4 h-4 inline mr-1.5 -mt-0.5" /> Reopen for Upsell
            </button>
          )}
          <button className={btnSecondary} onClick={() => setMeetModal(true)} data-testid="book-meeting-btn">
            <CalendarPlus className="w-4 h-4 inline mr-1.5 -mt-0.5" /> Book Meeting
          </button>
          <button className={btnPrimary} onClick={() => setPayModal(true)} data-testid="send-payment-btn">
            <CreditCard className="w-4 h-4 inline mr-1.5 -mt-0.5" /> Send Payment Link
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: context panel */}
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-xl p-5" data-testid="account-context-panel">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">
              Account Context
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Plan</div>
                <div className="text-sm font-semibold text-slate-900 mt-0.5">{lead.plan || "—"}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Monthly Spend</div>
                <div className="text-sm font-semibold text-slate-900 mt-0.5 font-mono">{money(lead.monthly_spend)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Lifetime Value</div>
                <div className="text-sm font-semibold text-slate-900 mt-0.5 font-mono">{money(lead.lifetime_value)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Usage Trend</div>
                <div className="text-sm font-semibold text-slate-900 mt-0.5 flex items-center gap-1 capitalize">
                  <TrendIco className="w-3.5 h-3.5" /> {lead.usage_trend}
                </div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-100">
              <div className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold mb-2">Product History</div>
              <div className="flex flex-wrap gap-1.5">
                {(lead.product_history || []).length ? (
                  lead.product_history.map((p) => (
                    <Badge key={p} className="bg-slate-50 text-slate-600 border-slate-200">{p}</Badge>
                  ))
                ) : (
                  <span className="text-xs text-slate-400">No history</span>
                )}
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-400">Region: <span className="text-slate-600 font-medium">{lead.region || "—"}</span></span>
              <span className="text-slate-400">Source: <span className="text-slate-600 font-medium">{lead.source}</span></span>
            </div>
            {(lead.total_revenue_usd > 0 || lead.deals_won > 0) && (
              <div className="mt-3 rounded-xl bg-emerald-50 border border-emerald-100 p-3 flex items-center justify-between" data-testid="lifetime-revenue">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-emerald-700 font-semibold">Lifetime Revenue</div>
                  <div className="text-lg font-bold text-emerald-700 font-mono">{money(lead.total_revenue_usd)}</div>
                </div>
                <div className="text-right text-[11px] text-emerald-700">
                  <div>{lead.deals_won || 0} deal{(lead.deals_won || 0) === 1 ? "" : "s"} won</div>
                  <div>{lead.upsell_cycles || 0} upsell cycle{(lead.upsell_cycles || 0) === 1 ? "" : "s"}</div>
                </div>
              </div>
            )}
          </div>

          {/* Stage & priority controls */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Update</h3>
            <Field label="Pipeline Stage">
              <select data-testid="stage-select" className={inputCls} value={lead.stage} onChange={(e) => updateStage(e.target.value)}>
                {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Priority Tag">
              <select data-testid="priority-select" className={inputCls} value={lead.priority} onChange={(e) => updatePriority(e.target.value)}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Region">
              <select data-testid="region-select" className={inputCls} value={lead.region || "Other"} onChange={(e) => updateRegion(e.target.value)}>
                {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
          </div>

          {/* Ownership history */}
          {lead.ownership_history?.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Ownership History</h3>
              <div className="space-y-2">
                {lead.ownership_history.map((h, i) => (
                  <div key={`${h.at}-${i}`} className="text-xs text-slate-600">
                    <span className="text-slate-400">{h.from || "Unassigned"}</span> → <span className="font-semibold">{h.to}</span>
                    <span className="text-slate-400"> · {h.by} · {timeAgo(h.at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Middle: notes + timeline */}
        <div className="lg:col-span-2 space-y-5">
          {/* Notes */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="font-heading text-base font-bold tracking-tight text-slate-900 mb-3 flex items-center gap-2">
              <StickyNote className="w-4 h-4 text-slate-400" /> Notes
            </h3>
            <div className="flex gap-2 mb-3">
              <select className={`${inputCls} w-auto`} value={noteType} onChange={(e) => setNoteType(e.target.value)} data-testid="note-type">
                <option>Note</option>
                <option>Call Outcome</option>
                <option>Follow-up</option>
              </select>
              <input
                data-testid="note-input"
                className={inputCls}
                placeholder="Add a note or call outcome…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addNote()}
              />
              <button className={btnPrimary} onClick={addNote} data-testid="add-note-btn">Add</button>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {(lead.notes || []).map((n) => (
                <div key={n.id} className="border border-slate-100 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1">
                    <Badge className="bg-slate-50 text-slate-600 border-slate-200">{n.type}</Badge>
                    <span className="text-[10px] text-slate-400">{n.author} · {timeAgo(n.created_at)}</span>
                  </div>
                  <div className="text-sm text-slate-700">{n.text}</div>
                </div>
              ))}
              {(lead.notes || []).length === 0 && <div className="text-xs text-slate-400 py-2">No notes yet.</div>}
            </div>
          </div>

          {/* Meetings */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="font-heading text-base font-bold tracking-tight text-slate-900 mb-3">Meetings</h3>
            {meetings.length === 0 ? (
              <div className="text-xs text-slate-400">No meetings yet.</div>
            ) : (
              <div className="space-y-2">
                {meetings.map((m) => (
                  <div key={m.id} className="flex items-center justify-between border border-slate-100 rounded-xl p-3">
                    <div>
                      <div className="text-sm text-slate-900 font-medium">{fmtDateTime(m.scheduled_at)}</div>
                      <div className="text-xs text-slate-400">{m.source} · {m.agent_name}{m.booking_driver ? ` · hook: ${m.booking_driver}` : ""}</div>
                    </div>
                    <Badge className={
                      m.status === "completed" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                      m.status === "no_show" ? "bg-red-50 text-red-700 border-red-200" :
                      "bg-indigo-50 text-indigo-700 border-indigo-200"
                    }>{m.status.replace("_", "-")}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Payments */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="font-heading text-base font-bold tracking-tight text-slate-900 mb-3">Payment Links</h3>
            {payments.length === 0 ? (
              <div className="text-xs text-slate-400">No payment links sent.</div>
            ) : (
              <div className="space-y-2">
                {payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between border border-slate-100 rounded-xl p-3" data-testid={`payment-row-${p.id}`}>
                    <div>
                      <div className="text-sm font-semibold text-slate-900 font-mono">{money(p.amount, p.currency)} · {p.provider}</div>
                      <div className="text-xs text-slate-400">{p.description}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={paymentStatusClass(p.payment_status)}>{p.payment_status}</Badge>
                      {p.payment_link && (
                        <button
                          onClick={() => { navigator.clipboard?.writeText(p.payment_link); toast.success("Link copied"); }}
                          className="text-slate-400 hover:text-slate-900"
                          title="Copy link"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Activity timeline */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="font-heading text-base font-bold tracking-tight text-slate-900 mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4 text-slate-400" /> Activity Timeline
            </h3>
            <div className="space-y-3 max-h-72 overflow-y-auto">
              {activities.map((a) => (
                <div key={a.id} className="flex gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-900 mt-1.5 shrink-0" />
                  <div className="flex-1">
                    <div className="text-sm text-slate-700">{a.description}</div>
                    <div className="text-[10px] text-slate-400 uppercase tracking-wider">{a.actor} · {timeAgo(a.created_at)}</div>
                  </div>
                </div>
              ))}
              {activities.length === 0 && <div className="text-xs text-slate-400">No activity yet.</div>}
            </div>
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      <Modal open={payModal} onClose={() => setPayModal(false)} title="Send Payment Link" testid="payment-modal">
        <Field label="Provider">
          <select className={inputCls} value={payForm.provider} onChange={(e) => setPayForm({ ...payForm, provider: e.target.value })} data-testid="pay-provider">
            <option value="stripe">Stripe</option>
            <option value="razorpay">Razorpay</option>
          </select>
        </Field>
        <Field label="Preset Package">
          <select className={inputCls} value={payForm.package_id} onChange={(e) => setPayForm({ ...payForm, package_id: e.target.value })} data-testid="pay-package">
            <option value="">— Custom amount —</option>
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
              <div className="-mt-1 mb-3 text-xs text-slate-500" data-testid="fx-preview">
                ≈ <span className="font-semibold text-slate-800">{money(Number(payForm.amount) / fxRate)}</span> at ₹{fxRate}/$1 · reported in USD
              </div>
            )}
            <Field label="Description">
              <input className={inputCls} value={payForm.description} onChange={(e) => setPayForm({ ...payForm, description: e.target.value })} placeholder="Scale plan upgrade" />
            </Field>
          </>
        )}
        <div className="flex justify-end gap-2 mt-2">
          <button className={btnSecondary} onClick={() => setPayModal(false)}>Cancel</button>
          <button className={btnPrimary} onClick={createPayment} data-testid="generate-payment-btn">Generate & Copy Link</button>
        </div>
        <p className="text-[11px] text-slate-400 mt-3 flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" /> Link copied to clipboard automatically. Stripe is live (test mode).
        </p>
      </Modal>

      {/* Reopen for Upsell Modal */}
      <Modal open={reopenModal} onClose={() => setReopenModal(false)} title="Reopen for Upsell / Cross-sell" testid="reopen-modal">
        <p className="text-xs text-slate-500 mb-3">
          Starts a new opportunity and keeps ownership with{" "}
          <span className="font-semibold text-slate-700">{lead.owner_name}</span>.
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
          <button className={btnSecondary} onClick={() => setReopenModal(false)}>Cancel</button>
          <button className={btnPrimary} onClick={doReopen} data-testid="confirm-reopen-btn">Reopen</button>
        </div>
      </Modal>

      {/* Meeting Modal */}
      <Modal open={meetModal} onClose={() => setMeetModal(false)} title="Book Meeting" testid="meeting-modal">
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
          <button className={btnSecondary} onClick={() => setMeetModal(false)}>Cancel</button>
          <button className={btnPrimary} onClick={bookMeeting} data-testid="confirm-meeting-btn">Book</button>
        </div>
      </Modal>
    </div>
  );
}
