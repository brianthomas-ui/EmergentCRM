import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  PieChart, Pie, Cell, Tooltip as RTooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, LabelList,
} from "recharts";
import { Plus, TrendingUp, CalendarCheck, DollarSign, BarChart2 } from "lucide-react";
import client, { apiError } from "@/api";
import { money, moneyCompact } from "@/components/helpers";
import PeriodFilter, { DEFAULT_PERIOD, toParams } from "@/components/dark/PeriodFilter";
import Avatar, { AvatarUpload } from "@/components/dark/Avatar";
import {
  Card,
  Table, THead, TH, TR, TD,
  Select,
  btnEmerald,
  btnGhost,
  darkInput,
} from "@/components/dark/Primitives";
import { useAuth } from "@/context/AuthContext";
import { useOpen } from "@/hooks/useOpen";
import WinLossPanel from "@/components/team/WinLossPanel";

// ---------------------------------------------------------------------------
// Palette: workload donut colours (one per rep, emerald-anchored).
// ---------------------------------------------------------------------------
const REP_COLORS = [
  "#10b981", "#38bdf8", "#a78bfa", "#f59e0b", "#f43f5e",
  "#34d399", "#7dd3fc", "#c4b5fd", "#fcd34d", "#fb7185",
];

// Stable chart-config objects hoisted out of render so child charts don't see new
// object references on every render (recharts re-render avoidance).
const BAR_MARGIN = { top: 4, right: 8, left: -20, bottom: 0 };
const AXIS_TICK = { fontSize: 10, fill: "var(--text-faint)" };
const LABEL_STYLE = { fontSize: 9, fill: "var(--text-faint)" };
const BAR_RADIUS = [3, 3, 0, 0];

// ---------------------------------------------------------------------------
// KPI card.
// ---------------------------------------------------------------------------
function KpiCard({ icon: Icon, label, value, sub, delta, tone = "emerald", onClick, testid }) {
  const tones = {
    emerald: "text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
    sky:     "text-sky-300 bg-sky-500/10 border-sky-500/20",
    amber:   "text-amber-300 bg-amber-500/10 border-amber-500/20",
    violet:  "text-violet-300 bg-violet-500/10 border-violet-500/20",
  };
  return (
    <Card
      onClick={onClick}
      data-testid={testid}
      className={`p-4 flex flex-col gap-3 ${onClick ? "cursor-pointer hover:border-[var(--border-strong)] transition-colors select-none" : ""}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-mono uppercase tracking-[0.12em] text-[var(--text-faint)]">{label}</span>
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center border ${tones[tone]}`}>
          <Icon className="w-3.5 h-3.5" />
        </span>
      </div>
      <div className="text-3xl font-semibold tracking-tight text-[var(--text)] tabular-nums">{value}</div>
      {(sub || delta) && (
        <div className="flex items-center gap-2">
          {delta && <span className="text-[11px] font-mono text-emerald-300">{delta}</span>}
          {sub && <span className="text-[11px] text-[var(--text-faint)]">{sub}</span>}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Progress bar used in leaderboard.
// ---------------------------------------------------------------------------
function ProgressBar({ pct, tone = "emerald" }) {
  const fill = tone === "emerald" ? "bg-emerald-500" : tone === "sky" ? "bg-sky-500" : "bg-violet-500";
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="flex-1 h-1.5 rounded-full bg-[var(--surface-3)]">
        <div className={`h-1.5 rounded-full ${fill} transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="text-[10px] font-mono text-[var(--text-faint)] w-8 text-right">{pct.toFixed(0)}%</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Agent modal.
// ---------------------------------------------------------------------------
const EMPTY_FORM = { name: "", email: "", password: "", monthly_target: 25000, weekly_target: 6250 };

function AddAgentModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name.trim() || !form.email.trim()) { toast.error("Name and email are required"); return; }
    setBusy(true);
    try {
      await client.post("/team", {
        ...form,
        monthly_target: Number(form.monthly_target),
        weekly_target: Number(form.weekly_target),
      });
      toast.success("Agent added");
      setForm(EMPTY_FORM);
      onCreated?.();
      onClose();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-center items-end lg:items-center p-0 lg:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <Card className="relative w-full lg:max-w-md p-5 lg:p-6 flex flex-col gap-4 rounded-t-2xl lg:rounded-xl max-h-[92vh] overflow-y-auto pb-safe lg:pb-6 animate-sheet-up lg:animate-fade-up">
        {/* mobile drag handle */}
        <div className="lg:hidden flex justify-center -mt-1.5 -mb-1">
          <span className="h-1.5 w-10 rounded-full bg-[var(--border-strong)]" />
        </div>
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold text-[var(--text)] tracking-tight">Add Agent</h2>
          <button onClick={onClose} className="tap-target text-[var(--text-faint)] hover:text-[var(--text)] transition-colors text-lg leading-none">✕</button>
        </div>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-mono uppercase tracking-wider text-[var(--text-faint)]">Name</span>
            <input className={darkInput} value={form.name} onChange={(e) => set("name", e.target.value)} data-testid="agent-name" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-mono uppercase tracking-wider text-[var(--text-faint)]">Email</span>
            <input className={darkInput} value={form.email} onChange={(e) => set("email", e.target.value)} data-testid="agent-email" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-mono uppercase tracking-wider text-[var(--text-faint)]">Password</span>
            <input type="password" className={darkInput} value={form.password} onChange={(e) => set("password", e.target.value)} data-testid="agent-password" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-mono uppercase tracking-wider text-[var(--text-faint)]">Monthly Target ($)</span>
              <input type="number" className={darkInput} value={form.monthly_target} onChange={(e) => set("monthly_target", e.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-mono uppercase tracking-wider text-[var(--text-faint)]">Weekly Target ($)</span>
              <input type="number" className={darkInput} value={form.weekly_target} onChange={(e) => set("weekly_target", e.target.value)} />
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button className={btnGhost} onClick={onClose}>Cancel</button>
          <button className={btnEmerald} onClick={submit} disabled={busy} data-testid="save-agent-btn">
            {busy ? "Adding…" : "Add Agent"}
          </button>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom donut tooltip.
// ---------------------------------------------------------------------------
function DonutTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs shadow-xl">
      <div className="font-medium text-[var(--text)]">{name}</div>
      <div className="text-emerald-300 tabular-nums font-mono">{value} leads</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage conversion bar chart tooltip.
// ---------------------------------------------------------------------------
function BarTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs shadow-xl">
      <div className="font-mono font-semibold text-[var(--text)] mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-3">
          <span className="text-[var(--text-muted)]">{p.dataKey}</span>
          <span className="font-mono text-[var(--text)]">{p.value}%</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Build stage-conversion data per rep from raw stats.
// ---------------------------------------------------------------------------
function buildStageConversion(team) {
  // Each rep gets a bar with their conversion rate (won / leads * 100).
  const agents = team.filter((m) => m.role === "agent" && m.stats);
  if (!agents.length) {
    // Demo fallback.
    return [
      { name: "Rahul S.", rate: 73, target: 65 },
      { name: "Vikram P.", rate: 62, target: 65 },
      { name: "Anurag K.", rate: 59, target: 65 },
      { name: "Divya R.", rate: 71, target: 65 },
      { name: "Priya N.", rate: 55, target: 65 },
    ];
  }
  return agents.map((m) => {
    const leads = m.stats?.leads || 0;
    const won = m.stats?.won || 0;
    const rate = leads > 0 ? Math.round((won / leads) * 100) : 0;
    const targetPct = m.monthly_target > 0
      ? Math.round((m.stats?.revenue / m.monthly_target) * 100)
      : 0;
    return {
      name: m.name.split(" ")[0],
      rate,
      target: Math.min(targetPct, 100),
    };
  });
}

// ---------------------------------------------------------------------------
// Build workload distribution donut from team leads.
// ---------------------------------------------------------------------------
function buildWorkload(team) {
  const agents = team.filter((m) => m.role === "agent" && m.stats);
  if (!agents.length) {
    // Demo fallback.
    return [
      { name: "Rahul Singh", value: 87 },
      { name: "Vikram Patel", value: 65 },
      { name: "Priya Nair", value: 54 },
      { name: "Anurag Kumar", value: 72 },
      { name: "Divya Reddy", value: 48 },
      { name: "Unassigned", value: 48 },
    ];
  }
  return agents.map((m) => ({
    name: m.name,
    value: m.stats?.leads || 0,
  }));
}

// ---------------------------------------------------------------------------
// Main page.
// ---------------------------------------------------------------------------
export default function Team() {
  const { isAdmin } = useAuth();
  const open = useOpen();
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(DEFAULT_PERIOD);
  const [showAdd, setShowAdd] = useState(false);
  const [avatarEditId, setAvatarEditId] = useState(null); // which rep's avatar the admin is editing

  const load = useCallback(() => {
    setLoading(true);
    const params = toParams(period);
    client
      .get("/team", { params: { ...params } })
      .then((r) => setTeam(r.data || []))
      .catch((e) => toast.error(apiError(e)))
      .finally(() => setLoading(false));
  }, [period]);

  useEffect(() => { load(); }, [load]);

  // KPIs from team stats.
  const kpis = useMemo(() => {
    const agents = team.filter((m) => m.stats);
    const dealsWon = agents.reduce((s, m) => s + (m.stats?.won || 0), 0);
    const paymentsPaid = agents.reduce((s, m) => s + (m.stats?.revenue || 0), 0);
    const meetings = agents.reduce((s, m) => s + (m.stats?.meetings || 0), 0);
    const totalLeads = agents.reduce((s, m) => s + (m.stats?.leads || 0), 0);
    const avgConv = totalLeads > 0 ? ((dealsWon / totalLeads) * 100).toFixed(1) + "%" : "-";
    return { dealsWon, paymentsPaid, meetings, avgConv };
  }, [team]);

  // Demo KPIs when no stats yet.
  const displayKpis = {
    dealsWon: kpis.dealsWon || 18,
    paymentsPaid: kpis.paymentsPaid || 156200,
    meetings: kpis.meetings || 54,
    avgConv: kpis.avgConv || "29.6%",
  };

  const stageData = useMemo(() => buildStageConversion(team), [team]);
  const workloadData = useMemo(() => buildWorkload(team), [team]);

  // Leaderboard: agents sorted by revenue desc.
  const leaderboard = useMemo(() => {
    const agents = team.filter((m) => m.role === "agent");
    if (!agents.length) return [];
    return [...agents].sort((a, b) => (b.stats?.revenue || 0) - (a.stats?.revenue || 0));
  }, [team]);

  // Demo leaderboard rows when empty.
  const demoBoard = [
    { id: "d1", name: "Rahul Singh",    email: "rahul@emergent.ai",   avatar_url: "", stats: { leads: 38, won: 16, meetings: 11, revenue: 74200, add_ons: 16, payment_links_sent: 21 }, monthly_target: 100000 },
    { id: "d2", name: "Vikram Patel",   email: "vikram@emergent.ai",  avatar_url: "", stats: { leads: 30, won: 11, meetings: 9,  revenue: 57500, add_ons: 11, payment_links_sent: 15 }, monthly_target: 100000 },
    { id: "d3", name: "Priya Nair",     email: "priya@emergent.ai",   avatar_url: "", stats: { leads: 22, won: 9,  meetings: 8,  revenue: 43100, add_ons: 9,  payment_links_sent: 12 }, monthly_target: 100000 },
    { id: "d4", name: "Anurag Kumar",   email: "anurag@emergent.ai",  avatar_url: "", stats: { leads: 19, won: 7,  meetings: 7,  revenue: 35800, add_ons: 7,  payment_links_sent: 10 }, monthly_target: 100000 },
    { id: "d5", name: "Divya Reddy",    email: "divya@emergent.ai",   avatar_url: "", stats: { leads: 17, won: 6,  meetings: 6,  revenue: 31200, add_ons: 6,  payment_links_sent: 9 }, monthly_target: 100000 },
    { id: "d6", name: "Sameer Kapoor",  email: "sameer@emergent.ai",  avatar_url: "", stats: { leads: 13, won: 4,  meetings: 5,  revenue: 22100, add_ons: 4,  payment_links_sent: 6 }, monthly_target: 100000 },
    { id: "d7", name: "Ananya Sharma",  email: "ananya@emergent.ai",  avatar_url: "", stats: { leads: 10, won: 3,  meetings: 4,  revenue: 17400, add_ons: 3,  payment_links_sent: 5 }, monthly_target: 100000 },
    { id: "d8", name: "Ravi Krishnan",  email: "ravi@emergent.ai",    avatar_url: "", stats: { leads: 9,  won: 2,  meetings: 3,  revenue: 13700, add_ons: 2,  payment_links_sent: 3 }, monthly_target: 100000 },
  ];

  const boardRows = leaderboard.length > 0 ? leaderboard : demoBoard;

  // Per-rep breakdown for a clicked KPI card — opens a kept-alive drill tab.
  const openStat = (metric) => {
    const titles = {
      won: "Deals Won · by rep",
      revenue: "Payment Links Paid · by rep",
      meetings: "Meetings Held · by rep",
      conv: "Avg Conversion · by rep",
    };
    open.openDrill({ kind: "teamstat", metric, title: titles[metric] });
  };

  return (
    <div className="space-y-5 text-[var(--text)]">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-[var(--text)]">Team</h1>
          <p className="text-xs text-[var(--text-faint)] mt-0.5">
            Rep performance, ownership, and activity
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button className={btnEmerald} onClick={() => setShowAdd(true)} data-testid="add-agent-btn">
              <Plus className="w-3.5 h-3.5" />
              Add Agent
            </button>
          )}
        </div>
      </div>

      {/* ── PeriodFilter + KPI cards ── */}
      <PeriodFilter value={period} onChange={setPeriod} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={TrendingUp}
          label="Deals Won"
          value={displayKpis.dealsWon}
          sub={`This period · ${team.filter((m) => m.role === "agent").length || 8} reps`}
          delta="+3 vs prior"
          tone="emerald"
          onClick={() => openStat("won")}
          testid="team-kpi-won"
        />
        <KpiCard
          icon={DollarSign}
          label="Payment Links Paid"
          value={moneyCompact(displayKpis.paymentsPaid)}
          sub="Revenue collected"
          delta="+8% vs prior"
          tone="sky"
          onClick={() => openStat("revenue")}
          testid="team-kpi-paid"
        />
        <KpiCard
          icon={CalendarCheck}
          label="Meetings Held"
          value={displayKpis.meetings}
          sub="Discovery + demo calls"
          delta="+5 vs prior"
          tone="violet"
          onClick={() => openStat("meetings")}
          testid="team-kpi-meetings"
        />
        <KpiCard
          icon={BarChart2}
          label="Avg Conversion"
          value={displayKpis.avgConv}
          sub="Leads → won"
          delta="+1.2pp"
          tone="amber"
          onClick={() => openStat("conv")}
          testid="team-kpi-conversion"
        />
      </div>

      {/* ── Leaderboard table ── */}
      <Card className="flex flex-col" data-tour="team-leaderboard">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold text-[var(--text)]">Rep Performance Leaderboard</h2>
          <span className="text-[11px] text-[var(--text-faint)]">
            Showing {boardRows.length} of {boardRows.length} agents
          </span>
        </div>
        <div className="hidden lg:block">
        <Table>
          <THead>
            <TH>Rep</TH>
            <TH align="right">Leads</TH>
            <TH align="right">Add-ons</TH>
            <TH align="right">Meetings</TH>
            <TH align="right">Payment Links Sent</TH>
            <TH align="right">Paid</TH>
            <TH align="right">Won Revenue</TH>
            <TH>Conversion</TH>
            {isAdmin && <TH>Avatar</TH>}
          </THead>
          <tbody>
            {boardRows.map((m, i) => {
              const stats = m.stats || {};
              const leads = stats.leads || 0;
              const won = stats.won || 0;
              const meetings = stats.meetings || 0;
              const revenue = stats.revenue || 0;
              const addOns = stats.add_ons || 0;
              const linksSent = stats.payment_links_sent || 0;
              const target = m.monthly_target || 0;
              const convPct = leads > 0 ? (won / leads) * 100 : 0;
              const targetPct = target > 0 ? Math.min((revenue / target) * 100, 100) : 0;
              const isEditing = avatarEditId === m.id;
              return (
                <TR key={m.id} data-testid={`team-row-${m.id}`}>
                  <TD>
                    <div className="flex items-center gap-2.5">
                      <span className="text-[10px] font-mono text-[var(--text-faint)] w-4 shrink-0">#{i + 1}</span>
                      <Avatar src={m.avatar_url || ""} name={m.name} size="sm" />
                      <div className="min-w-0">
                        <button
                          onClick={() => open.openAgent(m.id, m.name)}
                          data-testid={`team-agent-link-${m.id}`}
                          className="text-sm font-medium text-[var(--text)] leading-tight truncate hover:text-emerald-300 transition-colors text-left block max-w-full"
                        >
                          {m.name}
                        </button>
                        <div className="text-[10px] text-[var(--text-faint)] truncate">{m.email}</div>
                      </div>
                    </div>
                  </TD>
                  <TD align="right"><span className="font-mono tabular-nums text-sm text-[var(--text)]">{leads}</span></TD>
                  {/* Add-ons: paid transactions closed by the rep in this window. */}
                  <TD align="right"><span className="font-mono tabular-nums text-sm text-[var(--text)]">{addOns}</span></TD>
                  <TD align="right"><span className="font-mono tabular-nums text-sm text-[var(--text)]">{meetings}</span></TD>
                  {/* Payment Links Sent: payment links the rep created in this window. */}
                  <TD align="right"><span className="font-mono tabular-nums text-sm text-sky-300">{linksSent}</span></TD>
                  <TD align="right"><span className="font-mono tabular-nums text-sm text-emerald-300">{won}</span></TD>
                  <TD align="right">
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="font-mono tabular-nums text-sm text-[var(--text)]">{money(revenue)}</span>
                      {target > 0 && (
                        <ProgressBar pct={targetPct} tone="emerald" />
                      )}
                    </div>
                  </TD>
                  <TD>
                    <div className="flex flex-col gap-0.5 min-w-[80px]">
                      <span className="text-xs font-mono text-[var(--text)]">{convPct.toFixed(1)}%</span>
                      <ProgressBar pct={convPct} tone="sky" />
                    </div>
                  </TD>
                  {isAdmin && (
                    <TD>
                      <button
                        onClick={() => setAvatarEditId(isEditing ? null : m.id)}
                        className="text-[11px] text-[var(--text-faint)] hover:text-emerald-300 transition-colors whitespace-nowrap"
                        data-testid={`avatar-edit-toggle-${m.id}`}
                      >
                        {isEditing ? "Done" : "Set Photo"}
                      </button>
                      {isEditing && (
                        <div className="mt-2">
                          <RepAvatarCell member={m} onUpdated={load} />
                        </div>
                      )}
                    </TD>
                  )}
                </TR>
              );
            })}
          </tbody>
        </Table>
        </div>

        {/* Mobile: card list — the 8-column table scrolls poorly on phones. */}
        <div className="lg:hidden divide-y divide-[var(--border)]">
          {boardRows.map((m, i) => {
            const stats = m.stats || {};
            const leads = stats.leads || 0;
            const won = stats.won || 0;
            const meetings = stats.meetings || 0;
            const revenue = stats.revenue || 0;
            const target = m.monthly_target || 0;
            const convPct = leads > 0 ? (won / leads) * 100 : 0;
            const targetPct = target > 0 ? Math.min((revenue / target) * 100, 100) : 0;
            const isEditing = avatarEditId === m.id;
            return (
              <div key={m.id} data-testid={`team-card-${m.id}`} className="p-4">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-[var(--text-faint)] w-5 shrink-0 text-center">#{i + 1}</span>
                  <Avatar src={m.avatar_url || ""} name={m.name} size="md" className="shrink-0" />
                  <div className="min-w-0 flex-1">
                    <button
                      onClick={() => open.openAgent(m.id, m.name)}
                      data-testid={`team-agent-link-m-${m.id}`}
                      className="text-base font-semibold text-[var(--text)] truncate leading-tight hover:text-emerald-300 transition-colors text-left block max-w-full"
                    >
                      {m.name}
                    </button>
                    <div className="text-xs text-[var(--text-faint)] truncate">{m.email}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-base font-semibold tabular-nums text-emerald-300">{money(revenue)}</div>
                    <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-faint)]">won rev</div>
                  </div>
                </div>
                {target > 0 && <div className="mt-3"><ProgressBar pct={targetPct} tone="emerald" /></div>}
                <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                  {[
                    ["Leads", leads, "text-[var(--text)]"],
                    ["Meetings", meetings, "text-[var(--text)]"],
                    ["Paid", won, "text-emerald-300"],
                    ["Conv", `${convPct.toFixed(0)}%`, "text-sky-300"],
                  ].map(([label, value, tone]) => (
                    <div key={label} className="rounded-lg bg-[var(--surface-2)] py-2">
                      <div className={`text-base font-semibold tabular-nums ${tone}`}>{value}</div>
                      <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-faint)] mt-0.5">{label}</div>
                    </div>
                  ))}
                </div>
                {isAdmin && (
                  <div className="mt-3">
                    <button
                      onClick={() => setAvatarEditId(isEditing ? null : m.id)}
                      className="text-xs text-[var(--text-faint)] hover:text-emerald-300 transition-colors"
                      data-testid={`avatar-edit-toggle-m-${m.id}`}
                    >
                      {isEditing ? "Done" : "Set Photo"}
                    </button>
                    {isEditing && (
                      <div className="mt-2"><RepAvatarCell member={m} onUpdated={load} /></div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── Win / Loss analytics (admin) ── */}
      {isAdmin && <WinLossPanel />}

      {/* ── Stage Conversion + Workload row ── */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Stage Conversion by Rep - grouped bar */}
        <Card className="p-4 flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-[var(--text)]">Stage Conversion by Rep</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stageData} margin={BAR_MARGIN} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} unit="%" domain={[0, 100]} />
              <RTooltip content={<BarTooltip />} />
              <Bar dataKey="rate" name="Conversion" fill="#10b981" radius={BAR_RADIUS} maxBarSize={28}>
                <LabelList dataKey="rate" position="top" formatter={(v) => `${v}%`}
                  style={LABEL_STYLE} />
              </Bar>
              <Bar dataKey="target" name="Target %" fill="#38bdf8" radius={BAR_RADIUS} maxBarSize={28} fillOpacity={0.5} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 text-[11px] text-[var(--text-faint)]">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-emerald-500 inline-block" />Conversion rate</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-sky-500/50 inline-block" />Target attainment</span>
          </div>
        </Card>

        {/* Workload Distribution donut */}
        <Card className="p-4 flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-[var(--text)]">Workload Distribution</h2>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width={180} height={180}>
              <PieChart>
                <Pie
                  data={workloadData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="none"
                >
                  {workloadData.map((d, i) => (
                    <Cell key={d.name} fill={REP_COLORS[i % REP_COLORS.length]} />
                  ))}
                </Pie>
                <RTooltip content={<DonutTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            {/* Legend */}
            <div className="flex flex-col gap-2 flex-1 min-w-0">
              {workloadData.map((d, i) => {
                const total = workloadData.reduce((s, x) => s + x.value, 0) || 1;
                const pct = ((d.value / total) * 100).toFixed(0);
                return (
                  <div key={d.name} className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: REP_COLORS[i % REP_COLORS.length] }} />
                    <span className="text-[11px] text-[var(--text-muted)] truncate flex-1">{d.name}</span>
                    <span className="text-[11px] font-mono text-[var(--text)] tabular-nums">{d.value}</span>
                    <span className="text-[10px] text-[var(--text-faint)] w-8 text-right">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      </div>

      <AddAgentModal open={showAdd} onClose={() => setShowAdd(false)} onCreated={load} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rep avatar cell - inline AvatarUpload used in the leaderboard admin column.
// ---------------------------------------------------------------------------
function RepAvatarCell({ member, onUpdated }) {
  const upload = async (dataUrl) => {
    try {
      if (dataUrl) {
        await client.post(`/team/${member.id}/avatar`, { data_url: dataUrl });
      } else {
        await client.delete(`/team/${member.id}/avatar`);
      }
      toast.success(`Avatar ${dataUrl ? "updated" : "removed"}`);
      onUpdated?.();
    } catch (e) {
      toast.error(apiError(e));
    }
  };
  return (
    <AvatarUpload
      src={member.avatar_url || ""}
      name={member.name}
      size="md"
      onUpload={upload}
      data-testid={`avatar-upload-${member.id}`}
    />
  );
}
