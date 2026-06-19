// Meetings — Google-Calendar-style week + day grid (dark theme).
// Booking window: 12:00–24:00 IST (24 half-hour slots).
// Manager/admin: agent color-coded toggle. Agent role: own calendar only.
// API: GET /api/calendar?date=YYYY-MM-DD (one call per visible date range).
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import client, { apiError } from "@/api";
import { useAuth } from "@/context/AuthContext";
import { Drawer, btnGhost, btnEmerald, StatusBadge } from "@/components/dark/Primitives";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Video,
  Calendar,
  Clock,
  User,
  Link2,
  FileText,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
// 12:00 (noon) → 24:00 = slot 0..47 (each = 30 min). We show 12:00–24:00.
const SLOT_START_H = 12; // first visible hour (noon)
const SLOT_COUNT = 24; // 24 × 30 min = 12 hours
const SLOT_H = 44; // px per slot
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

// 8 distinct agent colors (hsl-based so they work on dark backgrounds).
const AGENT_COLORS = [
  { bg: "bg-emerald-500/20", border: "border-emerald-500/50", text: "text-emerald-300", dot: "bg-emerald-400" },
  { bg: "bg-sky-500/20",     border: "border-sky-500/50",     text: "text-sky-300",     dot: "bg-sky-400"     },
  { bg: "bg-violet-500/20",  border: "border-violet-500/50",  text: "text-violet-300",  dot: "bg-violet-400"  },
  { bg: "bg-amber-500/20",   border: "border-amber-500/50",   text: "text-amber-300",   dot: "bg-amber-400"   },
  { bg: "bg-rose-500/20",    border: "border-rose-500/50",    text: "text-rose-300",    dot: "bg-rose-400"    },
  { bg: "bg-cyan-500/20",    border: "border-cyan-500/50",    text: "text-cyan-300",    dot: "bg-cyan-400"    },
  { bg: "bg-orange-500/20",  border: "border-orange-500/50",  text: "text-orange-300",  dot: "bg-orange-400"  },
  { bg: "bg-pink-500/20",    border: "border-pink-500/50",    text: "text-pink-300",    dot: "bg-pink-400"    },
];

// ---------------------------------------------------------------------------
// Date helpers (local time)
// ---------------------------------------------------------------------------
function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfWeek(d) {
  const r = new Date(d);
  r.setDate(r.getDate() - r.getDay()); // Sunday
  return r;
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Parse ISO datetime → { hour, minute } in local time.
function localTime(isoStr) {
  if (!isoStr) return null;
  const d = new Date(isoStr);
  return { h: d.getHours(), m: d.getMinutes(), date: d };
}

// Compute top offset + height (px) for an event in the grid.
function slotLayout(scheduledAt, durationMin = 30) {
  const t = localTime(scheduledAt);
  if (!t) return null;
  const totalMin = (t.h - SLOT_START_H) * 60 + t.m;
  if (totalMin < 0 || totalMin >= SLOT_COUNT * 30) return null; // outside window
  const top = (totalMin / 30) * SLOT_H;
  const height = Math.max((durationMin / 30) * SLOT_H, SLOT_H * 0.5);
  return { top, height };
}

function fmtTime(isoStr) {
  if (!isoStr) return "—";
  const d = new Date(isoStr);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function fmtDateFull(d) {
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

// ---------------------------------------------------------------------------
// Demo/fallback meetings for non-empty display when API has no data yet.
// ---------------------------------------------------------------------------
function buildDemoMeetings(weekStart) {
  const now = new Date();
  // Place demo meetings on Mon-Fri of the current week, 14:00–16:00
  const demos = [
    { id: "demo-1", lead_name: "Amir K.", scheduled_at: null, duration: 30, agent_id: 1, agent_name: "Sarah Chen", status: "scheduled", stage: "Interested", booking_driver: "Pricing / Upgrade", join_url: "#" },
    { id: "demo-2", lead_name: "Priya S.", scheduled_at: null, duration: 45, agent_id: 2, agent_name: "James R.", status: "scheduled", stage: "Payment Link Sent", booking_driver: "Lifetime Access", join_url: "#" },
    { id: "demo-3", lead_name: "Tom B.",   scheduled_at: null, duration: 30, agent_id: 1, agent_name: "Sarah Chen", status: "completed", stage: "Won", booking_driver: "Onboarding Help" },
    { id: "demo-4", lead_name: "Lena M.", scheduled_at: null, duration: 30, agent_id: 3, agent_name: "Dev P.",   status: "no_show",  stage: "No-Show", booking_driver: "Top-Up Credits" },
    { id: "demo-5", lead_name: "Carlos V.", scheduled_at: null, duration: 60, agent_id: 2, agent_name: "James R.", status: "scheduled", stage: "Contacted", booking_driver: "Feature Request", join_url: "#" },
  ];
  const offsets = [1, 2, 3, 4, 5]; // Mon-Fri
  const hours =   [14, 15, 13, 16, 14];
  return demos.map((d, i) => {
    const day = addDays(weekStart, offsets[i]);
    const dt = new Date(day);
    dt.setHours(hours[i], 0, 0, 0);
    return { ...d, scheduled_at: dt.toISOString() };
  });
}

// ---------------------------------------------------------------------------
// EventBlock — colored block inside the grid cell.
// ---------------------------------------------------------------------------
function EventBlock({ meeting, color, onClick, overlaps = 0, overlapIdx = 0 }) {
  const layout = slotLayout(meeting.scheduled_at, meeting.duration || 30);
  if (!layout) return null;

  const widthPct = overlaps > 0 ? 100 / (overlaps + 1) : 100;
  const leftPct = overlapIdx * widthPct;

  const statusDot = {
    scheduled: "bg-sky-400",
    completed: "bg-emerald-400",
    no_show: "bg-rose-400",
    cancelled: "bg-slate-500",
  }[meeting.status] || "bg-slate-500";

  return (
    <div
      className={`absolute rounded-md border px-1.5 py-0.5 cursor-pointer group overflow-hidden transition-opacity hover:opacity-90 ${color.bg} ${color.border}`}
      style={{
        top: layout.top + 1,
        height: layout.height - 2,
        left: `${leftPct}%`,
        width: `calc(${widthPct}% - 2px)`,
        zIndex: 10 + overlapIdx,
      }}
      onClick={(e) => { e.stopPropagation(); onClick(meeting); }}
      title={`${meeting.lead_name} · ${fmtTime(meeting.scheduled_at)}`}
    >
      <div className={`absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full ${statusDot}`} />
      <p className={`text-[11px] font-semibold leading-tight truncate ${color.text}`}>
        {meeting.lead_name || "—"}
      </p>
      {layout.height >= SLOT_H && (
        <p className="text-[10px] text-[var(--text-faint)] font-mono leading-tight truncate mt-px">
          {fmtTime(meeting.scheduled_at)}
          {meeting.agent_name ? ` · ${meeting.agent_name.split(" ")[0]}` : ""}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MeetingDrawer — detail panel on click.
// ---------------------------------------------------------------------------
function MeetingDrawer({ meeting, onClose, agentColorMap }) {
  if (!meeting) return null;
  const color = agentColorMap[meeting.agent_id] || AGENT_COLORS[0];
  const hasRecording = meeting.recording_url || meeting.circleback_url;

  return (
    <Drawer
      open={!!meeting}
      onClose={onClose}
      title={meeting.lead_name || "Meeting Detail"}
      subtitle={fmtTime(meeting.scheduled_at) + (meeting.duration ? ` · ${meeting.duration} min` : "")}
      testid="meeting-detail-drawer"
    >
      <div className="space-y-5">
        {/* Status + stage */}
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap ${
              { scheduled: "text-sky-300 border-sky-500/30 bg-sky-500/10",
                completed: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10",
                no_show:   "text-rose-300 border-rose-500/30 bg-rose-500/10",
                cancelled: "text-slate-300 border-slate-600/40 bg-slate-600/10",
              }[meeting.status] || "text-slate-300 border-slate-600/40 bg-slate-600/10"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
            {meeting.status?.replace("_", "-")}
          </span>
          {meeting.stage && <StatusBadge status={meeting.stage} tone={meeting.stage_tone} />}
        </div>

        {/* Key fields */}
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
            <DetailRow icon={<FileText className="w-3.5 h-3.5" />} label="Driver">
              {meeting.booking_driver}
            </DetailRow>
          )}
          {meeting.source && (
            <DetailRow icon={<Link2 className="w-3.5 h-3.5" />} label="Source">
              {meeting.source}
            </DetailRow>
          )}
        </div>

        {/* Notes */}
        {(meeting.notes || meeting.outcome_notes) && (
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-faint)] mb-1.5">Notes</p>
            <p className="text-sm text-[var(--text-muted)] leading-relaxed">
              {meeting.outcome_notes || meeting.notes}
            </p>
          </div>
        )}

        {/* No-show info */}
        {meeting.status === "no_show" && meeting.no_show_reason && (
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/[0.06] p-3">
            <p className="text-[10px] font-mono uppercase tracking-widest text-rose-400/70 mb-1">No-Show Reason</p>
            <p className="text-sm text-rose-300/90">{meeting.no_show_reason}</p>
            {meeting.reschedule_status && (
              <p className="text-xs text-[var(--text-faint)] mt-1">Reschedule: {meeting.reschedule_status.replace("_", " ")}</p>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-col gap-2 pt-1">
          {meeting.join_url && meeting.join_url !== "#" && (
            <a
              href={meeting.join_url}
              target="_blank"
              rel="noopener noreferrer"
              className={`${btnEmerald} justify-center`}
            >
              <Video className="w-4 h-4" />
              Join Meeting
              <ExternalLink className="w-3.5 h-3.5 opacity-70" />
            </a>
          )}
          {hasRecording && (
            <a
              href={meeting.recording_url || meeting.circleback_url}
              target="_blank"
              rel="noopener noreferrer"
              className={`${btnGhost} justify-center`}
            >
              <Video className="w-4 h-4 text-[var(--text-muted)]" />
              {meeting.circleback_url ? "Circleback Recording" : "Recording"}
              <ExternalLink className="w-3.5 h-3.5 opacity-70" />
            </a>
          )}
          {meeting.summary_url && (
            <a
              href={meeting.summary_url}
              target="_blank"
              rel="noopener noreferrer"
              className={`${btnGhost} justify-center`}
            >
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

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------
export default function Meetings() {
  const { user, isAdmin } = useAuth();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // View state
  const [view, setView] = useState("week"); // "week" | "day"
  const [anchorDate, setAnchorDate] = useState(today); // the "current" date/week anchor
  const [selectedMeeting, setSelectedMeeting] = useState(null);

  // Data state
  const [meetings, setMeetings] = useState([]);
  const [agents, setAgents] = useState([]); // admin only: agent list
  const [agentFilter, setAgentFilter] = useState("all"); // "all" | agent_id string
  const [loading, setLoading] = useState(false);
  const [usedDemo, setUsedDemo] = useState(false);

  // Derived: the dates to display
  const weekStart = startOfWeek(anchorDate);
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const displayDates = view === "day" ? [anchorDate] : weekDates;

  // Heading
  const weekEnd = weekDates[6];
  const headingWeek =
    weekStart.getMonth() === weekEnd.getMonth()
      ? `${MONTH_NAMES[weekStart.getMonth()]} ${weekStart.getFullYear()}`
      : weekStart.getFullYear() === weekEnd.getFullYear()
      ? `${MONTH_NAMES[weekStart.getMonth()]} – ${MONTH_NAMES[weekEnd.getMonth()]} ${weekStart.getFullYear()}`
      : `${MONTH_NAMES[weekStart.getMonth()]} ${weekStart.getFullYear()} – ${MONTH_NAMES[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`;
  const headingDay = fmtDateFull(anchorDate);

  // Build agent → color map (stable index).
  const agentColorMap = {};
  agents.forEach((a, i) => {
    agentColorMap[a.id] = AGENT_COLORS[i % AGENT_COLORS.length];
  });

  // Fetch meetings for the visible range.
  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch each day in range. /api/calendar accepts a single date; fire in parallel.
      const datesToFetch = view === "day"
        ? [toDateStr(anchorDate)]
        : weekDates.map(toDateStr);

      const results = await Promise.all(
        datesToFetch.map((d) =>
          client.get("/calendar", { params: { date: d } }).then((r) => r.data)
        )
      );

      // Merge: each result may be { agents: [...], meetings: [...] } or just { meetings: [...] }.
      const allMeetings = [];
      const agentMap = {};
      results.forEach((r) => {
        const ms = r.meetings || [];
        ms.forEach((m) => allMeetings.push(m));
        // Collect agent roster from admin view
        (r.agents || []).forEach((a) => { agentMap[a.id] = a; });
      });

      const uniqueMeetings = Array.from(
        new Map(allMeetings.map((m) => [m.id, m])).values()
      );

      if (uniqueMeetings.length === 0 && !usedDemo) {
        // Show demo data so the grid isn't empty on first load
        const demos = buildDemoMeetings(weekStart);
        setMeetings(demos);
        setUsedDemo(true);
        if (Object.keys(agentMap).length === 0) {
          // Synthesise demo agent list
          setAgents([
            { id: 1, name: "Sarah Chen" },
            { id: 2, name: "James R." },
            { id: 3, name: "Dev P." },
          ]);
        }
      } else {
        setMeetings(uniqueMeetings);
        const agentArr = Object.values(agentMap);
        if (agentArr.length > 0) setAgents(agentArr);
        if (uniqueMeetings.length > 0) setUsedDemo(false);
      }
    } catch (e) {
      toast.error(apiError(e));
      // Still show demo data on error
      if (meetings.length === 0) {
        setMeetings(buildDemoMeetings(weekStart));
        setUsedDemo(true);
        setAgents([
          { id: 1, name: "Sarah Chen" },
          { id: 2, name: "James R." },
          { id: 3, name: "Dev P." },
        ]);
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, anchorDate]);

  useEffect(() => {
    load();
  }, [load]);

  // Navigation
  const shiftPeriod = (delta) => {
    setAnchorDate((prev) => addDays(prev, view === "day" ? delta : delta * 7));
  };
  const goToday = () => setAnchorDate(new Date());

  // Filter meetings
  const visibleMeetings = meetings.filter((m) => {
    if (!isAdmin && agentFilter !== "all") return String(m.agent_id) === agentFilter;
    if (isAdmin && agentFilter !== "all") return String(m.agent_id) === agentFilter;
    return true;
  });

  // Group by date string
  const meetingsByDate = {};
  visibleMeetings.forEach((m) => {
    if (!m.scheduled_at) return;
    const key = toDateStr(new Date(m.scheduled_at));
    if (!meetingsByDate[key]) meetingsByDate[key] = [];
    meetingsByDate[key].push(m);
  });

  // Count total for heading
  const totalShown = visibleMeetings.filter((m) => {
    const dt = m.scheduled_at ? new Date(m.scheduled_at) : null;
    if (!dt) return false;
    return displayDates.some((d) => isSameDay(d, dt));
  }).length;

  return (
    <div className="flex flex-col h-full min-h-0" style={{ height: "calc(100vh - 64px)" }}>
      {/* ── Header ── */}
      <div className="flex-none px-5 pt-5 pb-3 border-b border-[var(--border)] space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-heading text-2xl font-bold tracking-tight text-[var(--text)]">Meetings</h1>
            <p className="text-xs text-[var(--text-faint)] mt-0.5">
              {loading ? "Loading…" : `${totalShown} meeting${totalShown !== 1 ? "s" : ""}`}
              {usedDemo && " · demo data"}
            </p>
          </div>

          {/* Controls row */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Agent toggle — manager/admin only */}
            {isAdmin && agents.length > 1 && (
              <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-0.5">
                <AgentPill
                  label="All"
                  active={agentFilter === "all"}
                  onClick={() => setAgentFilter("all")}
                />
                {agents.map((a) => {
                  const c = agentColorMap[a.id] || AGENT_COLORS[0];
                  return (
                    <AgentPill
                      key={a.id}
                      label={a.name.split(" ")[0]}
                      active={agentFilter === String(a.id)}
                      color={c}
                      onClick={() => setAgentFilter(String(a.id))}
                    />
                  );
                })}
              </div>
            )}

            {/* Week / Day toggle */}
            <div className="flex items-center rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-0.5">
              {["week", "day"].map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-[7px] capitalize transition-colors ${
                    view === v
                      ? "bg-emerald-500 text-emerald-950 shadow-sm"
                      : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-3)]"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>

            {/* Nav */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => shiftPeriod(-1)}
                className="p-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-muted)] transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={goToday}
                className="px-3 py-1.5 text-xs font-medium rounded-md border border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-muted)] transition-colors"
              >
                Today
              </button>
              <button
                onClick={() => shiftPeriod(1)}
                className="p-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-muted)] transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Period heading */}
            <span className="text-sm font-semibold text-[var(--text)] min-w-[180px] text-center hidden sm:block">
              {view === "day" ? headingDay : headingWeek}
            </span>
          </div>
        </div>

        {/* Agent legend (when showing all) */}
        {isAdmin && agentFilter === "all" && agents.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap">
            {agents.map((a) => {
              const c = agentColorMap[a.id] || AGENT_COLORS[0];
              return (
                <div key={a.id} className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                  <span className="text-xs text-[var(--text-muted)]">{a.name}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Calendar grid ── */}
      <div className="flex-1 overflow-auto min-h-0">
        <div className="flex h-full min-w-[640px]">
          {/* Time gutter */}
          <div className="flex-none w-14 border-r border-[var(--border)] bg-[var(--surface-1)]">
            {/* Header spacer */}
            <div className="h-10 border-b border-[var(--border)]" />
            {/* Slots */}
            <div className="relative" style={{ height: SLOT_COUNT * SLOT_H }}>
              {Array.from({ length: SLOT_COUNT }).map((_, i) => {
                const h = SLOT_START_H + Math.floor(i / 2);
                const isHour = i % 2 === 0;
                const label = isHour
                  ? `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "am" : "pm"}`
                  : "";
                return (
                  <div
                    key={`slot-label-${i}`}
                    className="absolute w-full flex items-start justify-end pr-2"
                    style={{ top: i * SLOT_H, height: SLOT_H }}
                  >
                    {label && (
                      <span className="text-[10px] font-mono text-[var(--text-faint)] -mt-1.5">{label}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Day columns */}
          <div className="flex-1 flex min-w-0">
            {displayDates.map((date) => {
              const dateStr = toDateStr(date);
              const isToday = isSameDay(date, new Date());
              const dayMeetings = meetingsByDate[dateStr] || [];

              // Detect overlapping events: sort by time, assign overlap indices.
              const sorted = [...dayMeetings].sort((a, b) =>
                new Date(a.scheduled_at) - new Date(b.scheduled_at)
              );
              // Simple overlap detection: group events that share the same slot range.
              const overlapGroups = [];
              sorted.forEach((m) => {
                const t = localTime(m.scheduled_at);
                if (!t) return;
                const startMin = (t.h - SLOT_START_H) * 60 + t.m;
                const endMin = startMin + (m.duration || 30);
                let placed = false;
                for (const group of overlapGroups) {
                  const lastEnd = group.reduce((mx, g) => {
                    const gt = localTime(g.scheduled_at);
                    return Math.max(mx, (gt.h - SLOT_START_H) * 60 + gt.m + (g.duration || 30));
                  }, 0);
                  if (startMin < lastEnd) {
                    group.push(m);
                    placed = true;
                    break;
                  }
                }
                if (!placed) overlapGroups.push([m]);
              });
              const overlapMap = {}; // id → { total, idx }
              overlapGroups.forEach((group) => {
                group.forEach((m, idx) => {
                  overlapMap[m.id] = { total: group.length, idx };
                });
              });

              return (
                <div
                  key={dateStr}
                  className={`flex-1 border-r border-[var(--border)] min-w-0 ${
                    isToday ? "bg-emerald-500/[0.02]" : ""
                  }`}
                  style={{ minWidth: view === "week" ? 80 : 120 }}
                >
                  {/* Day header */}
                  <div
                    className={`h-10 flex items-center justify-center border-b border-[var(--border)] sticky top-0 z-20 ${
                      isToday ? "bg-[var(--surface-2)]" : "bg-[var(--surface-1)]"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-faint)]">
                        {DAY_LABELS[date.getDay()]}
                      </span>
                      <span
                        className={`text-sm font-bold tabular-nums ${
                          isToday
                            ? "w-6 h-6 rounded-full bg-emerald-500 text-emerald-950 flex items-center justify-center text-xs"
                            : "text-[var(--text)]"
                        }`}
                      >
                        {date.getDate()}
                      </span>
                    </div>
                  </div>

                  {/* Slot rows + event blocks */}
                  <div className="relative" style={{ height: SLOT_COUNT * SLOT_H }}>
                    {/* Hour/half-hour grid lines */}
                    {Array.from({ length: SLOT_COUNT }).map((_, i) => (
                      <div
                        key={`slot-line-${i}`}
                        className={`absolute w-full ${
                          i % 2 === 0
                            ? "border-t border-[var(--border)]"
                            : "border-t border-[var(--border)]/40"
                        }`}
                        style={{ top: i * SLOT_H, height: SLOT_H }}
                      />
                    ))}

                    {/* Current time indicator */}
                    {isToday && <NowLine />}

                    {/* Event blocks */}
                    {sorted.map((m) => {
                      const { total, idx } = overlapMap[m.id] || { total: 1, idx: 0 };
                      const color =
                        agentColorMap[m.agent_id] ||
                        AGENT_COLORS[agents.findIndex((a) => a.id === m.agent_id) % AGENT_COLORS.length] ||
                        AGENT_COLORS[0];
                      return (
                        <EventBlock
                          key={m.id}
                          meeting={m}
                          color={color}
                          onClick={setSelectedMeeting}
                          overlaps={total - 1}
                          overlapIdx={idx}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Meeting detail drawer */}
      <MeetingDrawer
        meeting={selectedMeeting}
        onClose={() => setSelectedMeeting(null)}
        agentColorMap={agentColorMap}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// NowLine — thin emerald line at current time if within 12:00-24:00 window.
// ---------------------------------------------------------------------------
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
    <div
      className="absolute left-0 right-0 flex items-center z-20 pointer-events-none"
      style={{ top }}
    >
      <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 -ml-1" />
      <div className="flex-1 h-px bg-emerald-400/70" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// AgentPill — small tab inside the agent toggle bar.
// ---------------------------------------------------------------------------
function AgentPill({ label, active, color, onClick }) {
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
