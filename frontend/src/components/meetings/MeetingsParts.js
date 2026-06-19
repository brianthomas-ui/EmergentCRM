// Meetings calendar primitives, helpers and presentational components.
import { useEffect, useState, useCallback } from "react";
import { Drawer, btnGhost, btnEmerald, StatusBadge } from "@/components/dark/Primitives";
import {
  ExternalLink, Video, Calendar, Clock, User, Link2, FileText,
} from "lucide-react";

// 12:00 (noon) → 24:00 = slot 0..47 (each = 30 min). We show 12:00–24:00.
export const SLOT_START_H = 12;
export const SLOT_COUNT = 24;
export const SLOT_H = 44;
export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const AGENT_COLORS = [
  { bg: "bg-emerald-500/20", border: "border-emerald-500/50", text: "text-emerald-300", dot: "bg-emerald-400" },
  { bg: "bg-sky-500/20",     border: "border-sky-500/50",     text: "text-sky-300",     dot: "bg-sky-400"     },
  { bg: "bg-violet-500/20",  border: "border-violet-500/50",  text: "text-violet-300",  dot: "bg-violet-400"  },
  { bg: "bg-amber-500/20",   border: "border-amber-500/50",   text: "text-amber-300",   dot: "bg-amber-400"   },
  { bg: "bg-rose-500/20",    border: "border-rose-500/50",    text: "text-rose-300",    dot: "bg-rose-400"    },
  { bg: "bg-cyan-500/20",    border: "border-cyan-500/50",    text: "text-cyan-300",    dot: "bg-cyan-400"    },
  { bg: "bg-orange-500/20",  border: "border-orange-500/50",  text: "text-orange-300",  dot: "bg-orange-400"  },
  { bg: "bg-pink-500/20",    border: "border-pink-500/50",    text: "text-pink-300",    dot: "bg-pink-400"    },
];

// ---- Date helpers (local time) ----
export function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function startOfWeek(d) {
  const r = new Date(d);
  r.setDate(r.getDate() - r.getDay());
  return r;
}

export function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function localTime(isoStr) {
  if (!isoStr) return null;
  const d = new Date(isoStr);
  return { h: d.getHours(), m: d.getMinutes(), date: d };
}

function slotLayout(scheduledAt, durationMin = 30) {
  const t = localTime(scheduledAt);
  if (!t) return null;
  const totalMin = (t.h - SLOT_START_H) * 60 + t.m;
  if (totalMin < 0 || totalMin >= SLOT_COUNT * 30) return null;
  const top = (totalMin / 30) * SLOT_H;
  const height = Math.max((durationMin / 30) * SLOT_H, SLOT_H * 0.5);
  return { top, height };
}

function fmtTime(isoStr) {
  if (!isoStr) return "—";
  return new Date(isoStr).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function fmtDateFull(d) {
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export function buildDemoMeetings(weekStart) {
  const demos = [
    { id: "demo-1", lead_name: "Amir K.", scheduled_at: null, duration: 30, agent_id: 1, agent_name: "Sarah Chen", status: "scheduled", stage: "Interested", booking_driver: "Pricing / Upgrade", join_url: "#" },
    { id: "demo-2", lead_name: "Priya S.", scheduled_at: null, duration: 45, agent_id: 2, agent_name: "James R.", status: "scheduled", stage: "Payment Link Sent", booking_driver: "Lifetime Access", join_url: "#" },
    { id: "demo-3", lead_name: "Tom B.", scheduled_at: null, duration: 30, agent_id: 1, agent_name: "Sarah Chen", status: "completed", stage: "Won", booking_driver: "Onboarding Help" },
    { id: "demo-4", lead_name: "Lena M.", scheduled_at: null, duration: 30, agent_id: 3, agent_name: "Dev P.", status: "no_show", stage: "No-Show", booking_driver: "Top-Up Credits" },
    { id: "demo-5", lead_name: "Carlos V.", scheduled_at: null, duration: 60, agent_id: 2, agent_name: "James R.", status: "scheduled", stage: "Contacted", booking_driver: "Feature Request", join_url: "#" },
  ];
  const offsets = [1, 2, 3, 4, 5];
  const hours = [14, 15, 13, 16, 14];
  return demos.map((d, i) => {
    const day = addDays(weekStart, offsets[i]);
    const dt = new Date(day);
    dt.setHours(hours[i], 0, 0, 0);
    return { ...d, scheduled_at: dt.toISOString() };
  });
}

export const DEMO_AGENTS = [
  { id: 1, name: "Sarah Chen" },
  { id: 2, name: "James R." },
  { id: 3, name: "Dev P." },
];

function EventBlock({ meeting, color, onClick, overlaps = 0, overlapIdx = 0 }) {
  const layout = slotLayout(meeting.scheduled_at, meeting.duration || 30);
  if (!layout) return null;
  const widthPct = overlaps > 0 ? 100 / (overlaps + 1) : 100;
  const leftPct = overlapIdx * widthPct;
  const statusDot = {
    scheduled: "bg-sky-400", completed: "bg-emerald-400", no_show: "bg-rose-400", cancelled: "bg-slate-500",
  }[meeting.status] || "bg-slate-500";

  return (
    <div
      className={`absolute rounded-md border px-1.5 py-0.5 cursor-pointer group overflow-hidden transition-opacity hover:opacity-90 ${color.bg} ${color.border}`}
      style={{ top: layout.top + 1, height: layout.height - 2, left: `${leftPct}%`, width: `calc(${widthPct}% - 2px)`, zIndex: 10 + overlapIdx }}
      onClick={(e) => { e.stopPropagation(); onClick(meeting); }}
      title={`${meeting.lead_name} · ${fmtTime(meeting.scheduled_at)}`}
    >
      <div className={`absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full ${statusDot}`} />
      <p className={`text-[11px] font-semibold leading-tight truncate ${color.text}`}>{meeting.lead_name || "—"}</p>
      {layout.height >= SLOT_H && (
        <p className="text-[10px] text-[var(--text-faint)] font-mono leading-tight truncate mt-px">
          {fmtTime(meeting.scheduled_at)}
          {meeting.agent_name ? ` · ${meeting.agent_name.split(" ")[0]}` : ""}
        </p>
      )}
    </div>
  );
}

function DetailRow({ icon, label, children }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-[var(--text-faint)] mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-faint)] block">{label}</span>
        <span className="text-sm text-[var(--text)]">{children}</span>
      </div>
    </div>
  );
}

export function MeetingDrawer({ meeting, onClose, agentColorMap }) {
  if (!meeting) return null;
  const color = agentColorMap[meeting.agent_id] || AGENT_COLORS[0];
  const hasRecording = meeting.recording_url || meeting.circleback_url;
  const statusCls = {
    scheduled: "text-sky-300 border-sky-500/30 bg-sky-500/10",
    completed: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10",
    no_show: "text-rose-300 border-rose-500/30 bg-rose-500/10",
    cancelled: "text-slate-300 border-slate-600/40 bg-slate-600/10",
  }[meeting.status] || "text-slate-300 border-slate-600/40 bg-slate-600/10";

  return (
    <Drawer
      open={!!meeting}
      onClose={onClose}
      title={meeting.lead_name || "Meeting Detail"}
      subtitle={fmtTime(meeting.scheduled_at) + (meeting.duration ? ` · ${meeting.duration} min` : "")}
      testid="meeting-detail-drawer"
    >
      <div className="space-y-5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap ${statusCls}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
            {meeting.status?.replace("_", "-")}
          </span>
          {meeting.stage && <StatusBadge status={meeting.stage} tone={meeting.stage_tone} />}
        </div>

        <div className="space-y-3">
          <DetailRow icon={<Calendar className="w-3.5 h-3.5" />} label="When">
            {fmtDateFull(new Date(meeting.scheduled_at))} at {fmtTime(meeting.scheduled_at)}
          </DetailRow>
          <DetailRow icon={<Clock className="w-3.5 h-3.5" />} label="Duration">
            {meeting.duration ? `${meeting.duration} min` : "—"}
          </DetailRow>
          <DetailRow icon={<User className="w-3.5 h-3.5" />} label="Agent">
            <span className={`font-medium ${color.text}`}>{meeting.agent_name || "—"}</span>
          </DetailRow>
          {meeting.booking_driver && (
            <DetailRow icon={<FileText className="w-3.5 h-3.5" />} label="Driver">{meeting.booking_driver}</DetailRow>
          )}
          {meeting.source && (
            <DetailRow icon={<Link2 className="w-3.5 h-3.5" />} label="Source">{meeting.source}</DetailRow>
          )}
        </div>

        {(meeting.notes || meeting.outcome_notes) && (
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-faint)] mb-1.5">Notes</p>
            <p className="text-sm text-[var(--text-muted)] leading-relaxed">{meeting.outcome_notes || meeting.notes}</p>
          </div>
        )}

        {meeting.status === "no_show" && meeting.no_show_reason && (
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/[0.06] p-3">
            <p className="text-[10px] font-mono uppercase tracking-widest text-rose-400/70 mb-1">No-Show Reason</p>
            <p className="text-sm text-rose-300/90">{meeting.no_show_reason}</p>
            {meeting.reschedule_status && (
              <p className="text-xs text-[var(--text-faint)] mt-1">Reschedule: {meeting.reschedule_status.replace("_", " ")}</p>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2 pt-1">
          {meeting.join_url && meeting.join_url !== "#" && (
            <a href={meeting.join_url} target="_blank" rel="noopener noreferrer" className={`${btnEmerald} justify-center`}>
              <Video className="w-4 h-4" />
              Join Meeting
              <ExternalLink className="w-3.5 h-3.5 opacity-70" />
            </a>
          )}
          {hasRecording && (
            <a href={meeting.recording_url || meeting.circleback_url} target="_blank" rel="noopener noreferrer" className={`${btnGhost} justify-center`}>
              <Video className="w-4 h-4 text-[var(--text-muted)]" />
              {meeting.circleback_url ? "Circleback Recording" : "Recording"}
              <ExternalLink className="w-3.5 h-3.5 opacity-70" />
            </a>
          )}
          {meeting.summary_url && (
            <a href={meeting.summary_url} target="_blank" rel="noopener noreferrer" className={`${btnGhost} justify-center`}>
              <FileText className="w-4 h-4 text-[var(--text-muted)]" />
              Meeting Summary
              <ExternalLink className="w-3.5 h-3.5 opacity-70" />
            </a>
          )}
        </div>
      </div>
    </Drawer>
  );
}

function NowLine() {
  const [top, setTop] = useState(null);
  const calc = useCallback(() => {
    const now = new Date();
    const mins = (now.getHours() - SLOT_START_H) * 60 + now.getMinutes();
    if (mins < 0 || mins > SLOT_COUNT * 30) { setTop(null); return; }
    setTop((mins / 30) * SLOT_H);
  }, []);
  useEffect(() => {
    calc();
    const id = setInterval(calc, 60_000);
    return () => clearInterval(id);
  }, [calc]);
  if (top === null) return null;
  return (
    <div className="absolute left-0 right-0 flex items-center z-20 pointer-events-none" style={{ top }}>
      <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 -ml-1" />
      <div className="flex-1 h-px bg-emerald-400/70" />
    </div>
  );
}

export function AgentPill({ label, active, color, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 text-[11px] font-medium rounded-[7px] whitespace-nowrap transition-colors flex items-center gap-1.5 ${
        active
          ? color
            ? `${color.bg} ${color.text} border border-transparent`
            : "bg-emerald-500 text-emerald-950"
          : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-3)]"
      }`}
    >
      {color && active && <span className={`w-1.5 h-1.5 rounded-full ${color.dot}`} />}
      {label}
    </button>
  );
}

export function TimeGutter() {
  return (
    <div className="flex-none w-14 border-r border-[var(--border)] bg-[var(--surface-1)]">
      <div className="h-10 border-b border-[var(--border)]" />
      <div className="relative" style={{ height: SLOT_COUNT * SLOT_H }}>
        {Array.from({ length: SLOT_COUNT }).map((_, i) => {
          const h = SLOT_START_H + Math.floor(i / 2);
          const isHour = i % 2 === 0;
          const label = isHour ? `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "am" : "pm"}` : "";
          return (
            <div key={`slot-label-${i}`} className="absolute w-full flex items-start justify-end pr-2" style={{ top: i * SLOT_H, height: SLOT_H }}>
              {label && <span className="text-[10px] font-mono text-[var(--text-faint)] -mt-1.5">{label}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Group day events into overlap lanes for side-by-side layout.
function computeOverlaps(sorted) {
  const overlapGroups = [];
  sorted.forEach((m) => {
    const t = localTime(m.scheduled_at);
    if (!t) return;
    const startMin = (t.h - SLOT_START_H) * 60 + t.m;
    let placed = false;
    for (const group of overlapGroups) {
      const lastEnd = group.reduce((mx, g) => {
        const gt = localTime(g.scheduled_at);
        return Math.max(mx, (gt.h - SLOT_START_H) * 60 + gt.m + (g.duration || 30));
      }, 0);
      if (startMin < lastEnd) { group.push(m); placed = true; break; }
    }
    if (!placed) overlapGroups.push([m]);
  });
  const overlapMap = {};
  overlapGroups.forEach((group) => {
    group.forEach((m, idx) => { overlapMap[m.id] = { total: group.length, idx }; });
  });
  return overlapMap;
}

export function DayColumn({ date, dayMeetings, agentColorMap, agents, view, onSelect }) {
  const isToday = isSameDay(date, new Date());
  const sorted = [...dayMeetings].sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
  const overlapMap = computeOverlaps(sorted);

  return (
    <div
      className={`flex-1 border-r border-[var(--border)] min-w-0 ${isToday ? "bg-emerald-500/[0.02]" : ""}`}
      style={{ minWidth: view === "week" ? 80 : 120 }}
    >
      <div className={`h-10 flex items-center justify-center border-b border-[var(--border)] sticky top-0 z-20 ${isToday ? "bg-[var(--surface-2)]" : "bg-[var(--surface-1)]"}`}>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-faint)]">{DAY_LABELS[date.getDay()]}</span>
          <span className={`text-sm font-bold tabular-nums ${isToday ? "w-6 h-6 rounded-full bg-emerald-500 text-emerald-950 flex items-center justify-center text-xs" : "text-[var(--text)]"}`}>
            {date.getDate()}
          </span>
        </div>
      </div>

      <div className="relative" style={{ height: SLOT_COUNT * SLOT_H }}>
        {Array.from({ length: SLOT_COUNT }).map((_, i) => (
          <div
            key={`slot-line-${i}`}
            className={`absolute w-full ${i % 2 === 0 ? "border-t border-[var(--border)]" : "border-t border-[var(--border)]/40"}`}
            style={{ top: i * SLOT_H, height: SLOT_H }}
          />
        ))}

        {isToday && <NowLine />}

        {sorted.map((m) => {
          const { total, idx } = overlapMap[m.id] || { total: 1, idx: 0 };
          const color =
            agentColorMap[m.agent_id] ||
            AGENT_COLORS[agents.findIndex((a) => a.id === m.agent_id) % AGENT_COLORS.length] ||
            AGENT_COLORS[0];
          return (
            <EventBlock key={m.id} meeting={m} color={color} onClick={onSelect} overlaps={total - 1} overlapIdx={idx} />
          );
        })}
      </div>
    </div>
  );
}
