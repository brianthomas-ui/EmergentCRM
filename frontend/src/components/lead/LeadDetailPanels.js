import { useState } from "react";
import { toast } from "sonner";
import {
  CreditCard, CalendarPlus, CheckCircle2, RefreshCw, Lock, Mail, MessageCircle, Loader2, StickyNote,
} from "lucide-react";
import client, { apiError } from "@/api";
import { stageClass, PRIORITIES, REGIONS, timeAgo, fmtDateTime, VISIBLE_STATUSES } from "@/components/helpers";
import { Card, StatusBadge, Select, darkInput, btnEmerald, btnGhost } from "@/components/dark/Primitives";
import Avatar from "@/components/dark/Avatar";

// Follow-up date helpers (shared by the OverviewPanel scheduler).
const toLocalInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const presetISO = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(10, 0, 0, 0);
  return d.toISOString();
};
const isOverdue = (iso) => !!iso && new Date(iso) < new Date();

function Section({ title, icon: Icon, children, action, className = "" }) {
  return (
    <Card className={`overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-[var(--text-faint)]" />}
          <span className="text-[11px] font-mono font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]">{title}</span>
        </div>
        {action && <div>{action}</div>}
      </div>
      <div className="p-4">{children}</div>
    </Card>
  );
}

function FLabel({ children }) {
  return (
    <label className="block text-[10px] font-mono font-medium uppercase tracking-wider text-[var(--text-faint)] mb-1.5">
      {children}
    </label>
  );
}

function StagePill({ stage }) {
  if (!stage) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${stageClass(stage)}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {stage}
    </span>
  );
}

export function NotesPanel({ lead, onRefresh }) {
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
          <Select value={noteType} onChange={(e) => setNoteType(e.target.value)} data-testid="note-type">
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
        <button className={btnEmerald} onClick={addNote} disabled={saving || !note.trim()} data-testid="add-note-btn">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add"}
        </button>
      </div>
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {(lead.notes || []).map((n) => (
          <div key={n.id} className="rounded-lg bg-[var(--surface-2)] border border-[var(--border)] p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-medium bg-[var(--surface-3)] text-[var(--text-faint)] border border-[var(--border)]">
                {n.type}
              </span>
              <span className="text-[10px] text-[var(--text-faint)]">{n.author} · {timeAgo(n.created_at)}</span>
            </div>
            <div className="text-sm text-[var(--text)]">{n.text}</div>
          </div>
        ))}
        {(lead.notes || []).length === 0 && <p className="text-xs text-[var(--text-faint)] py-1">No notes yet.</p>}
      </div>
    </Section>
  );
}

export function TasksPanel({ tasks = [] }) {
  return (
    <Card className="p-4">
      <span className="text-[11px] font-mono font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)] block mb-3">Tasks</span>
      {tasks.length === 0 ? (
        <p className="text-xs text-[var(--text-faint)]">No open tasks.</p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((t, i) => (
            <li key={t.id || i} className="flex items-start gap-2">
              <span className={`mt-0.5 w-3.5 h-3.5 rounded-full border shrink-0 ${t.done ? "bg-emerald-500 border-emerald-500" : "bg-transparent border-[var(--border-strong)]"}`} />
              <span className={`text-sm ${t.done ? "line-through text-[var(--text-faint)]" : "text-[var(--text)]"}`}>{t.text}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function OverviewPanel({ lead, meta, onUpdate, onUpdateStage }) {
  const statuses = meta?.statuses || VISIBLE_STATUSES;
  return (
    <Card className="p-4">
      <span className="text-[11px] font-mono font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)] block mb-3">Overview</span>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <div>
          <FLabel>Status</FLabel>
          {/* Single editable status control -> /stage (single-writer model). "Payment
              Link Paid" (Won) is set by recording a paid payment, not here (G5). */}
          <Select data-testid="status-select" value={lead.status || ""} onChange={(e) => onUpdateStage(e.target.value)}>
            {statuses.filter((s) => s !== "Payment Link Paid").map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </div>
        <div>
          <FLabel>Outcome</FLabel>
          <div data-testid="outcome-chip" className="text-sm text-[var(--text)] py-1.5">{lead.outcome || "-"}</div>
        </div>
        <div>
          <FLabel>Payment</FLabel>
          <div data-testid="payment-state-chip" className="text-sm text-[var(--text)] py-1.5">{lead.payment_state || "Not Sent"}</div>
        </div>
        <div>
          <FLabel>Priority</FLabel>
          <Select data-testid="priority-select" value={lead.priority || "None"} onChange={(e) => onUpdate({ priority: e.target.value }, "Priority updated")}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
        </div>
        <div>
          <FLabel>Region</FLabel>
          <Select data-testid="region-select" value={lead.region || "Other"} onChange={(e) => onUpdate({ region: e.target.value }, "Region updated")}>
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

      {/* Next follow-up - so the rep always knows whom/when to chase next. */}
      <div className="mt-4 pt-3 border-t border-[var(--border)]" data-tour="lead-followup">
        <FLabel>Next follow-up</FLabel>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="datetime-local"
            data-testid="followup-input"
            className={`${darkInput} w-auto [color-scheme:dark]`}
            value={toLocalInput(lead.next_followup_at)}
            onChange={(e) => e.target.value && onUpdate({ next_followup_at: new Date(e.target.value).toISOString() }, "Follow-up set")}
          />
          {[["Tomorrow", 1], ["In 3 days", 3], ["Next week", 7]].map(([lbl, days]) => (
            <button key={lbl} type="button" data-testid={`followup-${days}`}
              onClick={() => onUpdate({ next_followup_at: presetISO(days) }, `Follow-up set · ${lbl.toLowerCase()}`)}
              className={`${btnGhost} text-xs`}>{lbl}</button>
          ))}
          {lead.next_followup_at && (
            <button type="button" onClick={() => onUpdate({ next_followup_at: "" }, "Follow-up cleared")}
              className="text-xs text-[var(--text-faint)] hover:text-[var(--text)]">Clear</button>
          )}
        </div>
        {lead.next_followup_at && (
          <div className="mt-2 text-xs">
            <span className={isOverdue(lead.next_followup_at) ? "text-amber-400 font-medium" : "text-[var(--text-muted)]"}>
              {isOverdue(lead.next_followup_at) ? "Overdue · " : "Scheduled · "}
              {fmtDateTime(lead.next_followup_at)} ({timeAgo(lead.next_followup_at)})
            </span>
          </div>
        )}
      </div>

      {lead.ownership_history?.length > 0 && (
        <div className="mt-4 pt-3 border-t border-[var(--border)]">
          <div className="text-[10px] uppercase tracking-widest text-[var(--text-faint)] font-semibold mb-2">Ownership History</div>
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

export function LeadProfileHeader({ lead, statusMeta, isClosedStage, onReopen, onEmail, onWhatsapp, onSchedule, onMarkWon, onSendLink }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between flex-wrap gap-4">
        {/* Left: avatar + identity */}
        <div className="flex items-start gap-4">
          <Avatar name={lead.name} src={lead.avatar_url} size="lg" />
          <div className="min-w-0">
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-[var(--text)]" data-testid="lead-detail-name">
              {lead.name}
            </h1>
            {lead.company && <p className="text-sm text-[var(--text-muted)] mt-0.5">{lead.company}</p>}
            <div className="flex flex-wrap items-center gap-3 mt-2">
              {lead.email && (
                <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-1 text-xs text-[var(--text-faint)] hover:text-[var(--text)] transition-colors">
                  <Mail className="w-3.5 h-3.5" /> {lead.email}
                </a>
              )}
              {lead.phone && (
                <span className="inline-flex items-center gap-1 text-xs text-[var(--text-faint)]">
                  <MessageCircle className="w-3.5 h-3.5" /> {lead.phone}
                </span>
              )}
              {lead.region && <span className="text-xs text-[var(--text-faint)]">{lead.region}</span>}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-2.5">
              {lead.stage && <StagePill stage={lead.stage} />}
              {lead.status && <StatusBadge status={lead.status} tone={statusMeta[lead.status]?.tone} />}
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
              <span className="text-xs text-[var(--text-faint)]">Owner: {lead.owner_name || "Unassigned"}</span>
            </div>
          </div>
        </div>

        {/* Right: action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {isClosedStage && (
            <button className={btnGhost} onClick={onReopen} data-testid="reopen-btn">
              <RefreshCw className="w-4 h-4" /> Reopen for Upsell
            </button>
          )}
          <button className={btnGhost} onClick={onEmail} data-testid="email-lead-btn">
            <Mail className="w-4 h-4" /> Email
          </button>
          <button className={btnGhost} onClick={onWhatsapp} disabled={!lead.phone} data-testid="whatsapp-lead-btn" title={lead.phone ? "Open WhatsApp" : "No phone number on file"}>
            <MessageCircle className="w-4 h-4" /> WhatsApp
          </button>
          <button className={btnGhost} onClick={onSchedule} data-testid="book-meeting-btn">
            <CalendarPlus className="w-4 h-4" /> Schedule Meeting
          </button>
          {!isClosedStage && (
            <button className={btnGhost} onClick={onMarkWon} data-testid="mark-won-btn">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Mark Won
            </button>
          )}
          <button className={btnEmerald} onClick={onSendLink} data-testid="send-payment-btn">
            <CreditCard className="w-4 h-4" /> Send Payment Link
          </button>
        </div>
      </div>
    </Card>
  );
}
