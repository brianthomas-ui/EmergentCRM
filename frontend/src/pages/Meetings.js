// Meetings - Google-Calendar-style week + day grid (dark theme).
// Booking window: 12:00-24:00 IST (24 half-hour slots).
// Manager/admin: agent color-coded toggle. Agent role: own calendar only.
// API: GET /api/calendar?date=YYYY-MM-DD (one call per visible date range).
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import client, { apiError } from "@/api";
import { useAuth } from "@/context/AuthContext";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  MONTH_NAMES,
  AGENT_COLORS,
  DEMO_AGENTS,
  toDateStr,
  startOfWeek,
  addDays,
  isSameDay,
  fmtDateFull,
  buildDemoMeetings,
  MeetingDrawer,
  AgentPill,
  TimeGutter,
  DayColumn,
} from "@/components/meetings/MeetingsParts";

export default function Meetings() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Phones default to the single-day column (the 7-day grid is unreadable at 375px).
  const [view, setView] = useState(isMobile ? "day" : "week"); // "week" | "day"
  const [anchorDate, setAnchorDate] = useState(today);
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);

  const [meetings, setMeetings] = useState([]);
  const [agents, setAgents] = useState([]);
  const [agentFilter, setAgentFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [usedDemo, setUsedDemo] = useState(false);

  const weekStart = startOfWeek(anchorDate);
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const displayDates = view === "day" ? [anchorDate] : weekDates;

  const weekEnd = weekDates[6];
  const headingWeek =
    weekStart.getMonth() === weekEnd.getMonth()
      ? `${MONTH_NAMES[weekStart.getMonth()]} ${weekStart.getFullYear()}`
      : weekStart.getFullYear() === weekEnd.getFullYear()
      ? `${MONTH_NAMES[weekStart.getMonth()]} - ${MONTH_NAMES[weekEnd.getMonth()]} ${weekStart.getFullYear()}`
      : `${MONTH_NAMES[weekStart.getMonth()]} ${weekStart.getFullYear()} - ${MONTH_NAMES[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`;
  const headingDay = fmtDateFull(anchorDate);

  // Build agent → color map (stable index).
  const agentColorMap = {};
  agents.forEach((a, i) => { agentColorMap[a.id] = AGENT_COLORS[i % AGENT_COLORS.length]; });

  // Fetch meetings for the visible range.
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const datesToFetch = view === "day" ? [toDateStr(anchorDate)] : weekDates.map(toDateStr);
      const results = await Promise.all(
        datesToFetch.map((d) => client.get("/calendar", { params: { date: d } }).then((r) => r.data))
      );

      const allMeetings = [];
      const agentMap = {};
      results.forEach((r) => {
        (r.meetings || []).forEach((m) => allMeetings.push(m));
        (r.agents || []).forEach((a) => { agentMap[a.id] = a; });
      });

      const uniqueMeetings = Array.from(new Map(allMeetings.map((m) => [m.id, m])).values());

      if (uniqueMeetings.length === 0 && !usedDemo) {
        setMeetings(buildDemoMeetings(weekStart));
        setUsedDemo(true);
        if (Object.keys(agentMap).length === 0) setAgents(DEMO_AGENTS);
      } else {
        setMeetings(uniqueMeetings);
        const agentArr = Object.values(agentMap);
        if (agentArr.length > 0) setAgents(agentArr);
        if (uniqueMeetings.length > 0) setUsedDemo(false);
      }
    } catch (e) {
      toast.error(apiError(e));
      if (meetings.length === 0) {
        setMeetings(buildDemoMeetings(weekStart));
        setUsedDemo(true);
        setAgents(DEMO_AGENTS);
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, anchorDate]);

  useEffect(() => { load(); }, [load]);

  const shiftPeriod = (delta) => setAnchorDate((prev) => addDays(prev, view === "day" ? delta : delta * 7));
  const goToday = () => setAnchorDate(new Date());

  // Meeting outcome + reschedule + open-lead handlers (drawer actions).
  const updateOutcome = async (status, notes) => {
    if (!selectedMeeting) return;
    setActionBusy(true);
    try {
      await client.put(`/meetings/${selectedMeeting.id}/outcome`, {
        status,
        no_show_reason: status === "no_show" ? (notes || "") : "",
        outcome_notes: notes || "",
        reschedule_status: "",
      });
      toast.success(status === "no_show" ? "Marked as no-show" : "Marked as completed");
      setSelectedMeeting(null);
      load();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setActionBusy(false);
    }
  };

  const reschedule = async (localValue) => {
    if (!selectedMeeting || !localValue) return;
    setActionBusy(true);
    try {
      await client.put(`/meetings/${selectedMeeting.id}/reschedule`, {
        scheduled_at: new Date(localValue).toISOString(),
      });
      toast.success("Meeting rescheduled");
      setSelectedMeeting(null);
      load();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setActionBusy(false);
    }
  };

  const viewLead = (leadId) => navigate(`/leads/${leadId}`);

  const visibleMeetings = meetings.filter((m) =>
    agentFilter === "all" ? true : String(m.agent_id) === agentFilter
  );

  const meetingsByDate = {};
  visibleMeetings.forEach((m) => {
    if (!m.scheduled_at) return;
    const key = toDateStr(new Date(m.scheduled_at));
    (meetingsByDate[key] = meetingsByDate[key] || []).push(m);
  });

  const totalShown = visibleMeetings.filter((m) => {
    const dt = m.scheduled_at ? new Date(m.scheduled_at) : null;
    return dt ? displayDates.some((d) => isSameDay(d, dt)) : false;
  }).length;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-heading text-2xl font-bold tracking-tight text-[var(--text)]" data-tour="meetings-title">Meetings</h1>
            <p className="text-xs text-[var(--text-faint)] mt-0.5">
              {loading ? "Loading…" : `${totalShown} meeting${totalShown !== 1 ? "s" : ""}`}
              {usedDemo && " · demo data"}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Agent toggle - manager/admin only */}
            {isAdmin && agents.length > 1 && (
              <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-0.5">
                <AgentPill label="All" active={agentFilter === "all"} onClick={() => setAgentFilter("all")} />
                {agents.map((a) => (
                  <AgentPill
                    key={a.id}
                    label={a.name.split(" ")[0]}
                    active={agentFilter === String(a.id)}
                    color={agentColorMap[a.id] || AGENT_COLORS[0]}
                    onClick={() => setAgentFilter(String(a.id))}
                  />
                ))}
              </div>
            )}

            {/* Week / Day toggle */}
            <div className="flex items-center rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-0.5">
              {["week", "day"].map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-[7px] capitalize transition-colors ${
                    view === v ? "bg-emerald-500 text-emerald-950 shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-3)]"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>

            {/* Nav */}
            <div className="flex items-center gap-1">
              <button onClick={() => shiftPeriod(-1)} className="p-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-muted)] transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={goToday} className="px-3 py-1.5 text-xs font-medium rounded-md border border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-muted)] transition-colors">
                Today
              </button>
              <button onClick={() => shiftPeriod(1)} className="p-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-muted)] transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <span className="text-sm font-semibold text-[var(--text)] min-w-[180px] text-center hidden sm:block">
              {view === "day" ? headingDay : headingWeek}
            </span>
          </div>
        </div>

        {/* Agent legend (when showing all) */}
        {isAdmin && agentFilter === "all" && agents.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap">
            {agents.map((a) => (
              <div key={a.id} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${(agentColorMap[a.id] || AGENT_COLORS[0]).dot}`} />
                <span className="text-xs text-[var(--text-muted)]">{a.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Calendar grid - bounded height with internal scroll so the header is never clipped */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] overflow-hidden">
        <div className="overflow-auto h-[calc(100vh-260px)] min-h-[440px]">
          <div className={`flex ${view === "day" ? "min-w-0" : "min-w-[640px]"}`}>
            <TimeGutter />
            <div className="flex-1 flex min-w-0">
              {displayDates.map((date) => (
                <DayColumn
                  key={toDateStr(date)}
                  date={date}
                  dayMeetings={meetingsByDate[toDateStr(date)] || []}
                  agentColorMap={agentColorMap}
                  agents={agents}
                  view={view}
                  onSelect={setSelectedMeeting}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <MeetingDrawer
        meeting={selectedMeeting}
        onClose={() => setSelectedMeeting(null)}
        agentColorMap={agentColorMap}
        onViewLead={viewLead}
        onOutcome={updateOutcome}
        onReschedule={reschedule}
        busy={actionBusy}
      />
    </div>
  );
}
