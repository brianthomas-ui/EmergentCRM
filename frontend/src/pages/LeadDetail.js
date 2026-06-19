import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft,
  CreditCard,
  CalendarPlus,
  CheckCircle2,
  RefreshCw,
  Lock,
  Mail,
  MessageCircle,
  Loader2,
  StickyNote,
} from "lucide-react";
import client, { apiError } from "@/api";
import {
  stageClass,
  STAGES,
  PRIORITIES,
  REGIONS,
  timeAgo,
  VISIBLE_STATUSES,
} from "@/components/helpers";
import {
  Card,
  StatusBadge,
  Select,
  darkInput,
  btnEmerald,
  btnGhost,
  btnDanger,
} from "@/components/dark/Primitives";
import Avatar from "@/components/dark/Avatar";
import {
  LeadContextPanel,
  LeadMeetingsList,
  LeadPaymentsList,
  LeadActivityTimeline,
} from "@/components/lead/LeadPanels";
import { PaymentModal, ReopenModal, MeetingModal } from "@/components/lead/LeadModals";

// ---------------------------------------------------------------------------
// Dark section-level card wrapper with a header
// ---------------------------------------------------------------------------
function Section({ title, icon: Icon, children, action, className = "" }) {
  return (
    <Card className={`overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-[var(--text-faint)]" />}
          <span className="text-[11px] font-mono font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]">
            {title}
          </span>
        </div>
        {action && <div>{action}</div>}
      </div>
      <div className="p-4">{children}</div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Small inline field label
// ---------------------------------------------------------------------------
function FLabel({ children }) {
  return (
    <label className="block text-[10px] font-mono font-medium uppercase tracking-wider text-[var(--text-faint)] mb-1.5">
      {children}
    </label>
  );
}

// ---------------------------------------------------------------------------
// StatusBadge-style pill for stage (uses stageClass)
// ---------------------------------------------------------------------------
function StagePill({ stage }) {
  if (!stage) return null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${stageClass(
        stage
      )}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {stage}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Notes composer + list
// ---------------------------------------------------------------------------
function NotesPanel({ lead, onRefresh }) {
  const [note, setNote] = useState("");
  const [noteType, setNoteType] = useState("Note");
  const [saving, setSaving] = useState(false);

  const addNote = async () => {
    if (!note.trim()) return;
    setSaving(true);
    try {
      await client.post(`/leads/${lead.id}/notes`, { text: note, type: noteType });
      setNote("");
      toast.success("Note added");
      onRefresh();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section title="Notes" icon={StickyNote}>
      <div className="flex gap-2 mb-4">
        <div className="w-36 shrink-0">
          <Select
            value={noteType}
            onChange={(e) => setNoteType(e.target.value)}
            data-testid="note-type"
          >
            <option>Note</option>
            <option>Call Outcome</option>
            <option>Follow-up</option>
          </Select>
        </div>
        <input
          data-testid="note-input"
          className={darkInput}
          placeholder="Add a note or call outcome…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !saving && addNote()}
        />
        <button
          className={btnEmerald}
          onClick={addNote}
          disabled={saving || !note.trim()}
          data-testid="add-note-btn"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add"}
        </button>
      </div>
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {(lead.notes || []).map((n) => (
          <div
            key={n.id}
            className="rounded-lg bg-[var(--surface-2)] border border-[var(--border)] p-3"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-medium bg-[var(--surface-3)] text-[var(--text-faint)] border border-[var(--border)]">
                {n.type}
              </span>
              <span className="text-[10px] text-[var(--text-faint)]">
                {n.author} · {timeAgo(n.created_at)}
              </span>
            </div>
            <div className="text-sm text-[var(--text)]">{n.text}</div>
          </div>
        ))}
        {(lead.notes || []).length === 0 && (
          <p className="text-xs text-[var(--text-faint)] py-1">No notes yet.</p>
        )}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Tasks mini-panel
// ---------------------------------------------------------------------------
function TasksPanel({ tasks = [] }) {
  return (
    <Card className="p-4">
      <span className="text-[11px] font-mono font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)] block mb-3">
        Tasks
      </span>
      {tasks.length === 0 ? (
        <p className="text-xs text-[var(--text-faint)]">No open tasks.</p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((t, i) => (
            <li key={t.id || i} className="flex items-start gap-2">
              <span
                className={`mt-0.5 w-3.5 h-3.5 rounded-full border shrink-0 ${
                  t.done
                    ? "bg-emerald-500 border-emerald-500"
                    : "bg-transparent border-[var(--border-strong)]"
                }`}
              />
              <span
                className={`text-sm ${
                  t.done ? "line-through text-[var(--text-faint)]" : "text-[var(--text)]"
                }`}
              >
                {t.text}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Overview panel — inline editable fields
// ---------------------------------------------------------------------------
function OverviewPanel({ lead, meta, onUpdate, onUpdateStage }) {
  const statuses = meta?.statuses || VISIBLE_STATUSES;
  return (
    <Card className="p-4">
      <span className="text-[11px] font-mono font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)] block mb-3">
        Overview
      </span>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <div>
          <FLabel>Pipeline Stage</FLabel>
          <Select
            data-testid="stage-select"
            value={lead.stage || ""}
            onChange={(e) => onUpdateStage(e.target.value)}
          >
            {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </div>
        <div>
          <FLabel>Sales Status</FLabel>
          <Select
            data-testid="status-select"
            value={lead.status || ""}
            onChange={(e) => onUpdate({ status: e.target.value }, "Status updated")}
          >
            <option value="">—</option>
            {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </div>
        <div>
          <FLabel>Outcome</FLabel>
          <Select
            data-testid="outcome-select"
            value={lead.outcome || ""}
            onChange={(e) => onUpdate({ outcome: e.target.value }, "Outcome updated")}
          >
            <option value="">—</option>
            <option>Interested</option>
            <option>Won</option>
            <option>Lost</option>
            <option>No Response</option>
            <option>Not Qualified</option>
          </Select>
        </div>
        <div>
          <FLabel>Payment Status</FLabel>
          <Select
            data-testid="payment-status-select"
            value={lead.payment_status || ""}
            onChange={(e) => onUpdate({ payment_status: e.target.value }, "Payment status updated")}
          >
            <option value="">—</option>
            <option>Not Started</option>
            <option>Link Sent</option>
            <option>Paid</option>
            <option>Failed</option>
            <option>Refunded</option>
          </Select>
        </div>
        <div>
          <FLabel>Priority</FLabel>
          <Select
            data-testid="priority-select"
            value={lead.priority || "None"}
            onChange={(e) => onUpdate({ priority: e.target.value }, "Priority updated")}
          >
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
        </div>
        <div>
          <FLabel>Region</FLabel>
          <Select
            data-testid="region-select"
            value={lead.region || "Other"}
            onChange={(e) => onUpdate({ region: e.target.value }, "Region updated")}
          >
            {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
        </div>
        {lead.referred_by_name && (
          <div className="col-span-2">
            <FLabel>Referred By</FLabel>
            <span className="text-sm text-emerald-300 font-medium">{lead.referred_by_name}</span>
          </div>
        )}
      </div>

      {lead.ownership_history?.length > 0 && (
        <div className="mt-4 pt-3 border-t border-[var(--border)]">
          <div className="text-[10px] uppercase tracking-widest text-[var(--text-faint)] font-semibold mb-2">
            Ownership History
          </div>
          <div className="space-y-1.5">
            {lead.ownership_history.map((h, i) => (
              <div key={`${h.at}-${i}`} className="text-xs text-[var(--text-muted)]">
                <span className="text-[var(--text-faint)]">{h.from || "Unassigned"}</span>
                <span className="mx-1.5 text-[var(--text-faint)]">→</span>
                <span className="font-semibold text-[var(--text)]">{h.to}</span>
                <span className="text-[var(--text-faint)] ml-2">· {h.by} · {timeAgo(h.at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function LeadDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [meta, setMeta] = useState(null);

  const [payModal, setPayModal] = useState(false);
  const [meetModal, setMeetModal] = useState(false);
  const [reopenModal, setReopenModal] = useState(false);
  const [reopenForm, setReopenForm] = useState({ type: "Upsell", reason: "" });
  const [packages, setPackages] = useState({});
  const [payForm, setPayForm] = useState({
    provider: "stripe",
    product_line: "Credit Top-Up",
    package_id: "",
    amount: "",
    currency: "usd",
    multiplier: 7.5,
    description: "",
    credits: "",
    boost_credits: "",
  });
  const [meetForm, setMeetForm] = useState({
    scheduled_at: "",
    duration: 30,
    source: "Calendly",
    booking_driver: "Support",
  });
  const [fxRate, setFxRate] = useState(85);

  const load = () =>
    client.get(`/leads/${id}`).then((r) => setData(r.data)).catch((e) => toast.error(apiError(e)));

  useEffect(() => {
    load();
    client.get("/meta").then((r) => setMeta(r.data)).catch(() => {});
    client.get("/payments/packages").then((r) => setPackages(r.data)).catch(() => {});
    client.get("/settings").then((r) => setFxRate(r.data.inr_per_usd)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!data) {
    return (
      <div className="flex items-center justify-center py-24 text-[var(--text-faint)] gap-2">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading…
      </div>
    );
  }

  const { lead, activities, meetings, payments } = data;

  const updateField = async (patch, msg) => {
    try {
      await client.put(`/leads/${id}`, patch);
      toast.success(msg || "Updated");
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };
  const updateStage = async (stage) => {
    try {
      await client.put(`/leads/${id}/stage`, { stage });
      toast.success(`Stage → ${stage}`);
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
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
      const isCredit = (payForm.product_line || "Credit Top-Up") === "Credit Top-Up";
      const body = {
        lead_id: id,
        provider: payForm.provider,
        origin_url: window.location.origin,
        package_id: payForm.package_id || null,
        product_line: payForm.product_line || "Credit Top-Up",
        currency: payForm.currency,
        description: payForm.description || "",
      };
      if (payForm.amount !== "" && payForm.amount != null) body.amount = Number(payForm.amount);
      if (isCredit) {
        const mb = meta?.credit_multiplier || { default: 7.5 };
        const mult = Number(payForm.multiplier) || mb.default;
        body.multiplier = mult;
        if (body.amount) {
          const usd = payForm.currency === "inr" && fxRate ? body.amount / fxRate : body.amount;
          body.credits = Math.round(usd * mult);
        }
      } else {
        if (payForm.credits !== "" && payForm.credits != null) body.credits = Number(payForm.credits);
        if (payForm.boost_credits !== "" && payForm.boost_credits != null)
          body.boost_credits = Number(payForm.boost_credits);
      }
      const { data: rec } = await client.post("/payments/link", body);
      toast.success("Payment link generated");
      setPayModal(false);
      setPayForm({
        provider: "stripe",
        product_line: "Credit Top-Up",
        package_id: "",
        amount: "",
        currency: "usd",
        multiplier: 7.5,
        description: "",
        credits: "",
        boost_credits: "",
      });
      load();
      if (rec.payment_link) navigator.clipboard?.writeText(rec.payment_link).catch(() => {});
    } catch (e) {
      toast.error(apiError(e));
    }
  };
  const refreshEmergent = async () => {
    try {
      await client.post(`/leads/${id}/enrich`);
      toast.success("Refreshed from Emergent Users DB");
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };
  const touch = (channel) =>
    client.post(`/leads/${id}/touch`, { channel }).then(load).catch(() => {});
  const emailLead = () => {
    touch("email");
    window.open(`mailto:${lead.email}`, "_blank");
  };
  const whatsappLead = () => {
    const digits = (lead.phone || "").replace(/[^\d]/g, "");
    if (!digits) return;
    touch("whatsapp");
    window.open(`https://wa.me/${digits}`, "_blank");
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
  const markWon = async () => {
    try {
      await client.put(`/leads/${id}/stage`, { stage: "Won" });
      toast.success("Marked as Won");
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const isClosedStage = lead.stage === "Won" || lead.stage === "Lost";
  const statusMeta = meta?.status_meta || {};

  return (
    <div className="flex flex-col gap-4 min-h-0">
      {/* Back link */}
      <Link
        to="/leads"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--text-faint)] hover:text-[var(--text)] transition-colors w-fit"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Leads
      </Link>

      {/* Profile header */}
      <Card className="p-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          {/* Left: avatar + identity */}
          <div className="flex items-start gap-4">
            <Avatar name={lead.name} src={lead.avatar_url} size="lg" />
            <div className="min-w-0">
              <h1
                className="font-heading text-2xl font-semibold tracking-tight text-[var(--text)]"
                data-testid="lead-detail-name"
              >
                {lead.name}
              </h1>
              {lead.company && (
                <p className="text-sm text-[var(--text-muted)] mt-0.5">{lead.company}</p>
              )}
              {/* contact row */}
              <div className="flex flex-wrap items-center gap-3 mt-2">
                {lead.email && (
                  <a
                    href={`mailto:${lead.email}`}
                    className="inline-flex items-center gap-1 text-xs text-[var(--text-faint)] hover:text-[var(--text)] transition-colors"
                  >
                    <Mail className="w-3.5 h-3.5" /> {lead.email}
                  </a>
                )}
                {lead.phone && (
                  <span className="inline-flex items-center gap-1 text-xs text-[var(--text-faint)]">
                    <MessageCircle className="w-3.5 h-3.5" /> {lead.phone}
                  </span>
                )}
                {lead.region && (
                  <span className="text-xs text-[var(--text-faint)]">{lead.region}</span>
                )}
              </div>
              {/* status badges row */}
              <div className="flex flex-wrap items-center gap-2 mt-2.5">
                {lead.stage && <StagePill stage={lead.stage} />}
                {lead.status && (
                  <StatusBadge status={lead.status} tone={statusMeta[lead.status]?.tone} />
                )}
                {lead.payment_status && lead.payment_status !== "Not Started" && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border bg-sky-500/10 text-sky-300 border-sky-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                    {lead.payment_status}
                  </span>
                )}
                {lead.referred_by_name && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border bg-emerald-500/10 text-emerald-300 border-emerald-500/30">
                    Ref: {lead.referred_by_name}
                  </span>
                )}
                {lead.owner_locked && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono font-medium border bg-[var(--surface-3)] text-[var(--text-faint)] border-[var(--border)]">
                    <Lock className="w-3 h-3" /> Locked
                  </span>
                )}
                <span className="text-xs text-[var(--text-faint)]">
                  Owner: {lead.owner_name || "Unassigned"}
                </span>
              </div>
            </div>
          </div>

          {/* Right: action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {isClosedStage && (
              <button
                className={btnGhost}
                onClick={() => setReopenModal(true)}
                data-testid="reopen-btn"
              >
                <RefreshCw className="w-4 h-4" /> Reopen for Upsell
              </button>
            )}
            <button
              className={btnGhost}
              onClick={emailLead}
              data-testid="email-lead-btn"
            >
              <Mail className="w-4 h-4" /> Email
            </button>
            <button
              className={btnGhost}
              onClick={whatsappLead}
              disabled={!lead.phone}
              data-testid="whatsapp-lead-btn"
              title={lead.phone ? "Open WhatsApp" : "No phone number on file"}
            >
              <MessageCircle className="w-4 h-4" /> WhatsApp
            </button>
            <button
              className={btnGhost}
              onClick={() => setMeetModal(true)}
              data-testid="book-meeting-btn"
            >
              <CalendarPlus className="w-4 h-4" /> Schedule Meeting
            </button>
            {!isClosedStage && (
              <button
                className={btnGhost}
                onClick={markWon}
                data-testid="mark-won-btn"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Mark Won
              </button>
            )}
            <button
              className={btnEmerald}
              onClick={() => setPayModal(true)}
              data-testid="send-payment-btn"
            >
              <CreditCard className="w-4 h-4" /> Send Payment Link
            </button>
          </div>
        </div>
      </Card>

      {/* Body: 3-column grid on large screens */}
      <div className="grid xl:grid-cols-3 gap-4">
        {/* Col 1: context + overview */}
        <div className="space-y-4">
          <LeadContextPanel lead={lead} onRefresh={refreshEmergent} />
          <OverviewPanel lead={lead} meta={meta} onUpdate={updateField} onUpdateStage={updateStage} />
        </div>

        {/* Col 2: notes + tasks + meetings */}
        <div className="space-y-4">
          <NotesPanel lead={lead} onRefresh={load} />
          <TasksPanel tasks={lead.tasks || []} />
          <LeadMeetingsList meetings={meetings} />
        </div>

        {/* Col 3: activity timeline + payment links */}
        <div className="space-y-4">
          {/* Activity timeline */}
          <LeadActivityTimeline activities={activities} />
          {/* Payment Links */}
          <LeadPaymentsList payments={payments} onNewLink={() => setPayModal(true)} />
        </div>
      </div>

      {/* Modals */}
      <PaymentModal
        open={payModal}
        onClose={() => setPayModal(false)}
        payForm={payForm}
        setPayForm={setPayForm}
        packages={packages}
        fxRate={fxRate}
        meta={meta}
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
