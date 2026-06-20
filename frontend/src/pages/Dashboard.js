/**
 * Dashboard — Emergent Dark Sales Console
 * Matches mockup-1.png. All metrics scoped by PeriodFilter.
 * Uses: dark/Primitives, dark/PeriodFilter, dark/Avatar, @/api, helpers.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  DollarSign,
  TrendingUp,
  CalendarCheck,
  CreditCard,
  UserX,
  Percent,
  Trophy,
  Activity,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { Link } from "react-router-dom";
import client from "@/api";
import { useAuth } from "@/context/AuthContext";
import PeriodFilter, { DEFAULT_PERIOD, toParams } from "@/components/dark/PeriodFilter";
import { Card, StatusBadge } from "@/components/dark/Primitives";
import Avatar from "@/components/dark/Avatar";
import DrillDownModal from "@/components/DrillDownModal";
import {
  money,
  moneyCompact,
  statusToneClass,
  fmtDateTime,
  timeAgo,
} from "@/components/helpers";

// ---------------------------------------------------------------------------
// Donut chart — pure SVG, no dep.
// ---------------------------------------------------------------------------
const DONUT_COLORS = [
  "#10b981", // emerald-500
  "#06b6d4", // cyan-500
  "#8b5cf6", // violet-500
  "#f59e0b", // amber-500
];

function DonutChart({ slices, total, cx = 80, cy = 80, r = 60, thickness = 18 }) {
  if (!total) {
    return (
      <svg viewBox="0 0 160 160" className="w-full h-full">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={thickness} />
        <text x={cx} y={cy + 5} textAnchor="middle" fill="var(--text-faint)" fontSize="11" fontFamily="monospace">
          No data
        </text>
      </svg>
    );
  }
  const circ = 2 * Math.PI * r;
  let offset = 0;
  const arcs = slices.map((s, i) => {
    const dash = (s.value / total) * circ;
    const arc = { ...s, dash, offset, color: DONUT_COLORS[i % DONUT_COLORS.length] };
    offset += dash;
    return arc;
  });
  return (
    <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={thickness} />
      {arcs.map((a) => (
        <circle
          key={a.label}
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={a.color}
          strokeWidth={thickness}
          strokeDasharray={`${a.dash} ${circ - a.dash}`}
          strokeDashoffset={-a.offset}
          strokeLinecap="butt"
        />
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// KPI Card
// ---------------------------------------------------------------------------
function KpiCard({ label, value, sub, delta, icon: Icon, accent = "text-[var(--text)]", onClick, testid }) {
  return (
    <Card
      onClick={onClick}
      className="p-4 flex flex-col gap-2 select-none"
      data-testid={testid}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]">
          {label}
        </span>
        {Icon && <Icon className="w-3.5 h-3.5 text-[var(--text-faint)]" />}
      </div>
      <div className={`text-2xl font-semibold tracking-tight tabular-nums ${accent}`}>{value}</div>
      <div className="flex items-center justify-between gap-2">
        {sub && <div className="text-[11px] text-[var(--text-muted)] truncate">{sub}</div>}
        {delta != null && (
          <span
            className={`text-[10px] font-mono font-medium shrink-0 ${
              delta >= 0 ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {delta >= 0 ? "+" : ""}
            {delta}% vs prev
          </span>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Revenue by Product — donut + legend
// ---------------------------------------------------------------------------
function RevenueByProduct({ productRevenue, currency = "usd", onDrill }) {
  const lines = Object.entries(productRevenue || {});
  const total = lines.reduce((s, [, v]) => s + (v.won_revenue || 0), 0);
  const slices = lines
    .map(([name, v]) => ({ label: name, value: v.won_revenue || 0 }))
    .filter((s) => s.value > 0);

  return (
    <Card className="p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-mono font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
          Revenue by Product
        </h3>
        <span className="text-[10px] text-[var(--text-faint)]">{moneyCompact(total, currency)} total</span>
      </div>

      <div className="flex items-center gap-4">
        {/* donut */}
        <div className="relative shrink-0 w-28 h-28">
          <DonutChart slices={slices} total={total} />
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-base font-semibold tabular-nums text-[var(--text)]">
              {moneyCompact(total, currency)}
            </span>
            <span className="text-[9px] text-[var(--text-faint)] uppercase tracking-widest mt-0.5">won</span>
          </div>
        </div>

        {/* legend */}
        <div className="flex-1 space-y-2 min-w-0">
          {lines.map(([name, v], i) => {
            const pct = total > 0 ? Math.round((v.won_revenue / total) * 100) : 0;
            return (
              <button
                key={name}
                onClick={() => onDrill?.(`product:${name}`, name)}
                className="w-full flex items-center gap-2 text-left group"
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }}
                />
                <span className="text-[11px] text-[var(--text-muted)] truncate group-hover:text-[var(--text)] transition-colors flex-1">
                  {name}
                </span>
                <span className="text-[11px] tabular-nums text-[var(--text)] font-medium shrink-0">
                  {moneyCompact(v.won_revenue || 0, currency)}
                </span>
                <span className="text-[10px] text-[var(--text-faint)] tabular-nums shrink-0 w-8 text-right">
                  {pct}%
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* sub-line */}
      <div className="pt-1 border-t border-[var(--border)] flex items-center justify-between text-[10px] text-[var(--text-faint)]">
        <span>{lines.reduce((s, [, v]) => s + (v.won_count || 0), 0)} deals won</span>
        <span>{moneyCompact(lines.reduce((s, [, v]) => s + (v.pipeline_value || 0), 0), currency)} open pipeline</span>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Pipeline by Stage — HIGH-CONTRAST bars (emerald fill on slate track).
// ---------------------------------------------------------------------------
const STATUS_ORDER = [
  "New / Needs Review",
  "Contacted",
  "Interested",
  "Contact in Future",
  "Payment Link Sent",
  "Payment Link Failed",
  "Payment Link Paid",
  "No-Show",
  "Not Interested",
  "Changed Their Mind",
];

function PipelineByStage({ statusCounts, statusMeta, onDrillStatus }) {
  const counts = statusCounts || {};
  const meta = statusMeta || {};

  // Build ordered list, skip zeroes for compactness but keep at least 5 rows.
  const rows = STATUS_ORDER.map((s) => ({
    status: s,
    count: counts[s] || 0,
    tone: meta[s]?.tone,
  }));

  const max = Math.max(1, ...rows.map((r) => r.count));
  const total = rows.reduce((s, r) => s + r.count, 0);

  return (
    <Card className="p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-mono font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
          Pipeline by Stage
        </h3>
        <span className="text-[10px] text-[var(--text-faint)]">{total} total</span>
      </div>

      <div className="space-y-1.5">
        {rows.map((r) => {
          const pct = (r.count / max) * 100;
          const toneClasses = statusToneClass(r.status, r.tone);
          // Extract text colour from the tone class string (first class starts with "text-")
          const textCls = toneClasses.split(" ").find((c) => c.startsWith("text-")) || "text-slate-300";

          return (
            <button
              key={r.status}
              onClick={() => onDrillStatus?.(`status:${r.status}`, r.status)}
              className="w-full flex items-center gap-2 group"
              title={r.status}
            >
              {/* label */}
              <div className={`w-36 shrink-0 text-[10px] font-medium truncate text-left ${textCls} group-hover:opacity-90`}>
                {r.status}
              </div>

              {/* bar track (slate-700) + fill (emerald or tone-derived) */}
              <div className="flex-1 h-5 rounded bg-slate-700/60 overflow-hidden relative">
                <div
                  className="h-full rounded transition-all duration-300"
                  style={{
                    width: `${pct}%`,
                    minWidth: r.count > 0 ? "2px" : 0,
                    background:
                      r.tone === "green" || r.tone === "emerald"
                        ? "#10b981"
                        : r.tone === "cyan"
                        ? "#06b6d4"
                        : r.tone === "amber"
                        ? "#f59e0b"
                        : r.tone === "orange"
                        ? "#f97316"
                        : r.tone === "purple"
                        ? "#8b5cf6"
                        : r.tone === "rose" || r.tone === "rose-muted"
                        ? "#f43f5e"
                        : r.tone === "blue" || r.tone === "blue-gray"
                        ? "#64748b"
                        : "#64748b",
                  }}
                />
                {/* inline count label — always white so it's readable */}
                {r.count > 0 && (
                  <span className="absolute inset-y-0 right-1.5 flex items-center text-[10px] font-semibold text-white font-mono">
                    {r.count}
                  </span>
                )}
              </div>

              {/* count column for zero rows */}
              {r.count === 0 && (
                <span className="w-6 text-right text-[10px] text-[var(--text-faint)] font-mono shrink-0">0</span>
              )}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Recent Activity
// ---------------------------------------------------------------------------
function RecentActivity({ items }) {
  const empty = !items || items.length === 0;
  return (
    <Card className="p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-mono font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)] flex items-center gap-1.5">
          <Activity className="w-3 h-3" />
          Recent Activity
        </h3>
      </div>
      {empty ? (
        <div className="text-[11px] text-[var(--text-faint)] py-6 text-center">No recent activity.</div>
      ) : (
        <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
          {items.map((item, i) => (
            <div key={item.id || `${item.created_at || "a"}-${i}`} className="flex items-start gap-2.5">
              <Avatar name={item.actor || item.agent} size="sm" className="shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-[var(--text)] leading-snug truncate">
                  <span className="font-medium text-emerald-300">{item.actor || item.agent}</span>{" "}
                  {item.description || item.text}
                </p>
                {item.lead_name && (
                  <p className="text-[10px] text-[var(--text-faint)] truncate mt-0.5">{item.lead_name}</p>
                )}
              </div>
              <span className="text-[10px] text-[var(--text-faint)] font-mono shrink-0 mt-0.5 whitespace-nowrap">
                {timeAgo(item.created_at)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Today's Meetings
// ---------------------------------------------------------------------------
function TodaysMeetings({ meetings, onDrill }) {
  const items = meetings || [];
  return (
    <Card className="p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-mono font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)] flex items-center gap-1.5">
          <CalendarCheck className="w-3 h-3" />
          Today's Meetings
        </h3>
        <button
          onClick={() => onDrill?.("meetings_today", "Meetings Today")}
          className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-0.5 transition-colors"
        >
          View all <ChevronRight className="w-3 h-3" />
        </button>
      </div>
      {items.length === 0 ? (
        <div className="text-[11px] text-[var(--text-faint)] py-6 text-center">No meetings today.</div>
      ) : (
        <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
          {items.map((m) => (
            <Link
              key={m.id}
              to={`/leads/${m.lead_id}`}
              className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-[var(--surface-2)] transition-colors group"
            >
              <Avatar name={m.lead_name || m.agent_name} size="sm" className="shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-medium text-[var(--text)] truncate group-hover:text-emerald-300 transition-colors">
                  {m.lead_name}
                </div>
                <div className="text-[10px] text-[var(--text-faint)] truncate">{m.agent_name}</div>
              </div>
              <div className="shrink-0 text-right">
                <StatusBadge
                  status={m.status === "completed" ? "Contacted" : m.status === "no_show" ? "No-Show" : "New / Needs Review"}
                  className="text-[9px] px-1.5 py-0"
                />
                <div className="text-[10px] text-[var(--text-faint)] font-mono mt-0.5">
                  {fmtDateTime(m.scheduled_at)}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Top Agents leaderboard
// ---------------------------------------------------------------------------
function TopAgents({ agents, onDrill }) {
  const rows = (agents || []).slice(0, 8);
  if (!rows.length) return null;
  const maxRev = Math.max(1, ...rows.map((a) => a.revenue || 0));

  return (
    <Card className="p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-mono font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)] flex items-center gap-1.5">
          <Trophy className="w-3 h-3 text-amber-400" />
          Top Agents
        </h3>
        <span className="text-[10px] text-[var(--text-faint)]">by revenue</span>
      </div>

      <div className="space-y-2">
        {rows.map((a, rank) => {
          const pct = a.target ? Math.min(100, Math.round((a.revenue / a.target) * 100)) : 0;
          const barPct = (a.revenue / maxRev) * 100;
          return (
            <div key={a.id} className="flex items-center gap-2.5">
              {/* rank */}
              <span className="text-[10px] font-mono text-[var(--text-faint)] w-4 shrink-0 text-center">
                {rank + 1}
              </span>

              {/* avatar */}
              <Avatar src={a.avatar_url} name={a.name} size="sm" className="shrink-0" />

              {/* name + bar */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[11px] font-medium text-[var(--text)] truncate">{a.name}</span>
                  <span className="text-[11px] font-semibold tabular-nums text-emerald-300 shrink-0 ml-2">
                    {moneyCompact(a.revenue || 0)}
                  </span>
                </div>
                <div className="h-1.5 rounded bg-slate-700/60 overflow-hidden">
                  <div
                    className="h-full rounded bg-emerald-500 transition-all duration-300"
                    style={{ width: `${barPct}%` }}
                  />
                </div>
              </div>

              {/* target % */}
              <span
                className={`text-[10px] font-mono shrink-0 w-8 text-right ${
                  pct >= 100 ? "text-emerald-400" : pct >= 60 ? "text-amber-400" : "text-[var(--text-faint)]"
                }`}
              >
                {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Drill-down columns
// ---------------------------------------------------------------------------
const KPI_COLUMNS = [
  { key: "name", label: "Name" },
  { key: "company", label: "Company" },
  { key: "status", label: "Status" },
  { key: "lifetime_value", label: "LTV", render: (v) => money(v) },
];

const PIPELINE_COLUMNS = [
  { key: "name", label: "Name" },
  { key: "company", label: "Company" },
  { key: "status", label: "Status" },
  { key: "monthly_spend", label: "Spend/mo", render: (v) => money(v) },
  { key: "lifetime_value", label: "LTV", render: (v) => money(v) },
];

const MEETING_COLUMNS = [
  { key: "lead_name", label: "Lead" },
  { key: "agent_name", label: "Agent" },
  { key: "source", label: "Source" },
  {
    key: "scheduled_at",
    label: "Scheduled",
    render: (v) => (v ? new Date(v).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "-"),
  },
];

const PAYMENT_COLUMNS = [
  { key: "lead_name", label: "Lead" },
  { key: "product_line", label: "Product" },
  { key: "amount_usd", label: "Amount (USD)", render: (v) => money(v) },
  { key: "payment_status", label: "Status" },
];

// ---------------------------------------------------------------------------
// Main Dashboard
// ---------------------------------------------------------------------------
const POLL_MS = 20_000;

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const [period, setPeriod] = useState(DEFAULT_PERIOD);
  const [data, setData] = useState(null);
  const [statusMeta, setStatusMeta] = useState({});
  const [recentActivity, setRecentActivity] = useState([]);
  const [drill, setDrill] = useState({ open: false, title: "", items: null, columns: null });
  const pollRef = useRef(null);

  // Load /meta once.
  useEffect(() => {
    client.get("/meta").then((r) => setStatusMeta(r.data?.status_meta || {})).catch(() => {});
  }, []);

  // Load /dashboard on period change + poll.
  const load = useCallback(() => {
    const params = toParams(period);
    client
      .get("/dashboard", { params })
      .then((r) => setData(r.data))
      .catch(() => {});
  }, [period]);

  useEffect(() => {
    load();
    clearInterval(pollRef.current);
    pollRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [load]);

  // Load recent global activity from leads (fallback: derive from meetings_today_list).
  useEffect(() => {
    client
      .get("/activities/recent", { params: { limit: 20 } })
      .then((r) => setRecentActivity(Array.isArray(r.data) ? r.data : r.data?.items || []))
      .catch(() => {
        // Endpoint may not exist; derive from meetings list already in data.
        setRecentActivity([]);
      });
  }, [period]);

  const closeDrill = () => setDrill((d) => ({ ...d, open: false }));

  const openDrill = useCallback((metric, title, cols) => {
    const params = { metric, ...toParams(period) };
    setDrill({ open: true, title, items: null, columns: cols ?? KPI_COLUMNS });
    client
      .get("/dashboard/drilldown", { params })
      .then((r) =>
        setDrill((d) => ({
          ...d,
          items: Array.isArray(r.data) ? r.data : r.data?.items ?? [],
        }))
      )
      .catch(() => setDrill((d) => ({ ...d, items: [] })));
  }, [period]);

  // ---------- derived ----------
  const revenueClosed = data?.revenue_won ?? 0;
  const openPipeline = data?.pipeline_value ?? 0;
  const meetingsToday = data?.meetings_today ?? 0;
  const paymentPending = data?.payment_pending ?? 0;
  const noShowToday = data?.noshow_today ?? 0;
  // Conversion = won / (won + not-interested + changed-their-mind). Fallback to 0.
  const conversionNumerator = data?.won_count ?? 0;
  const statusCounts = data?.status_counts || {};
  const conversionDenominator =
    conversionNumerator +
    (statusCounts["Not Interested"] || 0) +
    (statusCounts["Changed Their Mind"] || 0);
  const conversionRate =
    conversionDenominator > 0 ? Math.round((conversionNumerator / conversionDenominator) * 100) : 0;

  const target = isAdmin ? (data?.team_target ?? 0) : (data?.target ?? 0);
  const targetPct = target > 0 ? Math.min(100, Math.round((revenueClosed / target) * 100)) : 0;

  const productRevenue = data?.product_revenue || {};
  const meetingsList = data?.meetings_today_list || [];
  const agentLeaderboard = data?.per_agent || [];

  return (
    <div className="min-h-full p-5 space-y-4" style={{ background: "var(--bg)", color: "var(--text)" }}>

      {/* ---- Header ---- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-semibold tracking-tight text-[var(--text)]">
            {isAdmin ? "Sales Console" : `Welcome, ${user?.name?.split(" ")[0] ?? "Agent"}`}
          </h1>
          <p className="text-[11px] text-[var(--text-faint)] mt-0.5">
            {isAdmin ? "Team performance overview" : "Your pipeline and meetings"}
          </p>
        </div>
        <div data-tour="dashboard-period">
          <PeriodFilter value={period} onChange={setPeriod} />
        </div>
      </div>

      {/* ---- Loading skeleton ---- */}
      {!data && (
        <div className="flex items-center gap-2 text-[var(--text-faint)] text-sm py-12 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading dashboard…
        </div>
      )}

      {data && (
        <>
          {/* ---- KPI Cards (6) ---- */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3" data-tour="dashboard-kpis">
            <KpiCard
              testid="kpi-revenue"
              label="Revenue Closed"
              value={moneyCompact(revenueClosed)}
              sub={target ? `Target ${moneyCompact(target)} · ${targetPct}%` : "No target set"}
              icon={DollarSign}
              accent="text-emerald-300"
              onClick={() => openDrill("revenue_closed", "Revenue Closed", PAYMENT_COLUMNS)}
            />
            <KpiCard
              testid="kpi-pipeline"
              label="Open Pipeline"
              value={moneyCompact(openPipeline)}
              sub={`${data.won_count ?? 0} won deals`}
              icon={TrendingUp}
              onClick={() => openDrill("open_pipeline", "Open Pipeline", PIPELINE_COLUMNS)}
            />
            <KpiCard
              testid="kpi-meetings"
              label="Meetings Today"
              value={meetingsToday}
              sub={`${data.completed_today ?? 0} completed`}
              icon={CalendarCheck}
              onClick={() => openDrill("meetings_today", "Meetings Today", MEETING_COLUMNS)}
            />
            <KpiCard
              testid="kpi-payment-pending"
              label="Payment Pending"
              value={paymentPending}
              sub="Awaiting payment"
              icon={CreditCard}
              accent={paymentPending > 0 ? "text-amber-300" : "text-[var(--text)]"}
              onClick={() => openDrill("payment_pending", "Payment Pending", PIPELINE_COLUMNS)}
            />
            <KpiCard
              testid="kpi-noshows"
              label="No-Shows"
              value={noShowToday}
              sub={`${data.noshow_total ?? 0} total`}
              icon={UserX}
              accent={noShowToday > 0 ? "text-violet-300" : "text-[var(--text)]"}
              onClick={() => openDrill("no_shows_today", "No-Shows", MEETING_COLUMNS)}
            />
            <KpiCard
              testid="kpi-conversion"
              label="Conversion"
              value={`${conversionRate}%`}
              sub={`${conversionNumerator} of ${conversionDenominator} closed`}
              icon={Percent}
              accent={conversionRate >= 50 ? "text-emerald-300" : conversionRate >= 25 ? "text-amber-300" : "text-rose-300"}
              onClick={() => openDrill("group:Won", "Won Deals", PIPELINE_COLUMNS)}
            />
          </div>

          {/* ---- Row 2: Donut + Pipeline by Stage ---- */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <RevenueByProduct
              productRevenue={productRevenue}
              currency="usd"
              onDrill={(metric, title) => openDrill(metric, title, PAYMENT_COLUMNS)}
            />
            <PipelineByStage
              statusCounts={statusCounts}
              statusMeta={statusMeta}
              onDrillStatus={(metric, title) => openDrill(metric, title, PIPELINE_COLUMNS)}
            />
          </div>

          {/* ---- Row 3: Recent Activity + Today's Meetings + Top Agents ---- */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <RecentActivity
              items={
                recentActivity.length > 0
                  ? recentActivity
                  : meetingsList.map((m) => ({
                      actor: m.agent_name,
                      description: `booked a meeting with ${m.lead_name}`,
                      lead_name: m.source ? `via ${m.source}` : undefined,
                      created_at: m.scheduled_at,
                    }))
              }
            />
            <TodaysMeetings
              meetings={meetingsList}
              onDrill={(metric, title) => openDrill(metric, title, MEETING_COLUMNS)}
            />
            {(isAdmin || agentLeaderboard.length > 0) && (
              <TopAgents agents={agentLeaderboard} />
            )}
          </div>
        </>
      )}

      <DrillDownModal
        open={drill.open}
        onClose={closeDrill}
        title={drill.title}
        items={drill.items}
        columns={drill.columns}
      />
    </div>
  );
}
