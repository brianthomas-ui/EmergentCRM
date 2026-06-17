import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import client, { apiError } from "@/api";
import {
  Badge,
  stageClass,
  priorityClass,
  STAGES,
  PRIORITIES,
  timeAgo,
  REGIONS,
} from "@/components/helpers";
import { Field, inputCls, btnPrimary, btnSecondary } from "@/components/Modal";
import {
  LeadContextPanel,
  LeadMeetingsList,
  LeadPaymentsList,
  LeadActivityTimeline,
} from "@/components/lead/LeadPanels";
import { PaymentModal, ReopenModal, MeetingModal } from "@/components/lead/LeadModals";
import {
  ArrowLeft,
  CreditCard,
  CalendarPlus,
  StickyNote,
  RefreshCw,
  Lock,
} from "lucide-react";

export default function LeadDetail() {
  const { id } = useParams();
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

  if (!data) return <div className="text-zinc-400 text-sm">Loading…</div>;
  const { lead, activities, meetings, payments } = data;

  const updateField = async (patch, msg) => {
    await client.put(`/leads/${id}`, patch);
    toast.success(msg);
    load();
  };
  const updateStage = async (stage) => {
    await client.put(`/leads/${id}/stage`, { stage });
    toast.success(`Stage → ${stage}`);
    load();
  };
  const addNote = async () => {
    if (!note.trim()) return;
    await client.post(`/leads/${id}/notes`, { text: note, type: noteType });
    setNote("");
    toast.success("Note added");
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
  const createPayment = async () => {
    try {
      const body = { lead_id: id, provider: payForm.provider, origin_url: window.location.origin };
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
      if (rec.payment_link) navigator.clipboard?.writeText(rec.payment_link).catch(() => {});
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
      <Link to="/leads" className="text-sm text-zinc-500 hover:text-zinc-900 inline-flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Back to leads
      </Link>

      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tighter text-zinc-900" data-testid="lead-detail-name">
            {lead.name}
          </h1>
          <p className="text-sm text-zinc-500 mt-1">{lead.company} · {lead.email} · {lead.phone}</p>
          <div className="flex items-center gap-2 mt-3">
            <Badge className={stageClass(lead.stage)}>{lead.stage}</Badge>
            <Badge className={priorityClass(lead.priority)}>{lead.priority}</Badge>
            <span className="text-xs text-zinc-400">Owner: {lead.owner_name || "Unassigned"}</span>
            {lead.owner_locked && (
              <Badge className="bg-zinc-950 text-white border-zinc-950"><Lock className="w-3 h-3" /> Locked to owner</Badge>
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
        {/* Left: context + controls */}
        <div className="space-y-5">
          <LeadContextPanel lead={lead} />

          <div className="bg-white border border-zinc-200 rounded-lg p-5">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-3">Update</h3>
            <Field label="Pipeline Stage">
              <select data-testid="stage-select" className={inputCls} value={lead.stage} onChange={(e) => updateStage(e.target.value)}>
                {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Priority Tag">
              <select data-testid="priority-select" className={inputCls} value={lead.priority} onChange={(e) => updateField({ priority: e.target.value }, "Priority updated")}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Region">
              <select data-testid="region-select" className={inputCls} value={lead.region || "Other"} onChange={(e) => updateField({ region: e.target.value }, "Region updated")}>
                {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
          </div>

          {lead.ownership_history?.length > 0 && (
            <div className="bg-white border border-zinc-200 rounded-lg p-5">
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-3">Ownership History</h3>
              <div className="space-y-2">
                {lead.ownership_history.map((h, i) => (
                  <div key={`${h.at}-${i}`} className="text-xs text-zinc-600">
                    <span className="text-zinc-400">{h.from || "Unassigned"}</span> → <span className="font-semibold">{h.to}</span>
                    <span className="text-zinc-400"> · {h.by} · {timeAgo(h.at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Middle: notes + lists + timeline */}
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white border border-zinc-200 rounded-lg p-5">
            <h3 className="font-heading text-base font-bold tracking-tight text-zinc-900 mb-3 flex items-center gap-2">
              <StickyNote className="w-4 h-4 text-zinc-400" /> Notes
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
                <div key={n.id} className="border border-zinc-100 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <Badge className="bg-zinc-50 text-zinc-600 border-zinc-200">{n.type}</Badge>
                    <span className="text-[10px] text-zinc-400">{n.author} · {timeAgo(n.created_at)}</span>
                  </div>
                  <div className="text-sm text-zinc-700">{n.text}</div>
                </div>
              ))}
              {(lead.notes || []).length === 0 && <div className="text-xs text-zinc-400 py-2">No notes yet.</div>}
            </div>
          </div>

          <LeadMeetingsList meetings={meetings} />
          <LeadPaymentsList payments={payments} />
          <LeadActivityTimeline activities={activities} />
        </div>
      </div>

      <PaymentModal
        open={payModal}
        onClose={() => setPayModal(false)}
        payForm={payForm}
        setPayForm={setPayForm}
        packages={packages}
        fxRate={fxRate}
        onSubmit={createPayment}
      />
      <ReopenModal
        open={reopenModal}
        onClose={() => setReopenModal(false)}
        ownerName={lead.owner_name}
        reopenForm={reopenForm}
        setReopenForm={setReopenForm}
        onSubmit={doReopen}
      />
      <MeetingModal
        open={meetModal}
        onClose={() => setMeetModal(false)}
        meetForm={meetForm}
        setMeetForm={setMeetForm}
        onSubmit={bookMeeting}
      />
    </div>
  );
}
