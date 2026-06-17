import { useEffect, useState } from "react";
import client from "@/api";
import { money } from "@/components/helpers";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";
import { Target, Users, CheckCircle2, DollarSign } from "lucide-react";

const SEG_COLORS = {
  Won: "#059669",
  Advanced: "#D97706",
  Met: "#6366F1",
  Assigned: "#0284C7",
  Uncovered: "#E2E8F0",
};

// Stable chart style objects (defined once, not re-created per render)
const CHART_MARGIN = { top: 4, right: 8, left: -16, bottom: 4 };
const TOOLTIP_STYLE = { borderRadius: 12, border: "1px solid #E2E8F0", fontSize: 12 };
const LEGEND_STYLE = { fontSize: 11 };
const AXIS_TICK = { fontSize: 11, fill: "#94A3B8" };
const XAXIS_TICK_SM = { fontSize: 10, fill: "#64748B" };
const XAXIS_TICK_DATE = { fontSize: 10, fill: "#94A3B8" };
const STACK_ORDER = ["Uncovered", "Assigned", "Met", "Advanced", "Won"];

function toSegments(g) {
  const uncovered = Math.max(0, g.total - g.assigned);
  const assignedOnly = Math.max(0, g.assigned - g.met);
  const metOnly = Math.max(0, g.met - g.advanced);
  const advancedOnly = Math.max(0, g.advanced - g.won);
  return {
    label: g.label,
    Won: g.won,
    Advanced: advancedOnly,
    Met: metOnly,
    Assigned: assignedOnly,
    Uncovered: uncovered,
    total: g.total,
    revenue: g.revenue_usd,
  };
}

function Stat({ label, value, sub, icon: Icon, accent = "text-slate-900" }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">{label}</span>
        <Icon className="w-4 h-4 text-slate-300" />
      </div>
      <div className={`font-heading text-3xl font-bold tracking-tight mt-2 ${accent}`}>{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}

function CoverageBars({ title, data }) {
  const rows = data.map(toSegments);
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <h3 className="font-heading text-base font-bold tracking-tight text-slate-900 mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={rows} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
          <XAxis dataKey="label" tick={XAXIS_TICK_SM} interval={0} angle={-20} textAnchor="end" height={50} />
          <YAxis allowDecimals={false} tick={AXIS_TICK} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Legend wrapperStyle={LEGEND_STYLE} />
          {STACK_ORDER.map((k) => (
            <Bar key={k} dataKey={k} stackId="a" fill={SEG_COLORS[k]} radius={k === "Won" ? [4, 4, 0, 0] : 0} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function Coverage() {
  const [data, setData] = useState(null);
  const [tierMetric, setTierMetric] = useState("spend"); // spend | ltv

  useEffect(() => {
    // mount-only: fetch coverage once
    client.get("/coverage").then((r) => setData(r.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data) return <div className="text-slate-400 text-sm">Loading coverage…</div>;

  const t = data.totals;
  const pct = (n) => (t.total ? Math.round((n / t.total) * 100) : 0);
  const tierData = tierMetric === "spend" ? data.by_tier_spend : data.by_tier_ltv;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight text-slate-900">Coverage & Burn</h1>
        <p className="text-sm text-slate-500 mt-1">How well the book is worked across usage tiers and regions.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Total Accounts" value={t.total} sub="in the book" icon={Users} />
        <Stat label="Coverage (Owned)" value={`${pct(t.assigned)}%`} sub={`${t.assigned} assigned · ${t.met} met`} icon={Target} accent="text-sky-600" />
        <Stat label="Won" value={`${pct(t.won)}%`} sub={`${t.won} closed`} icon={CheckCircle2} accent="text-emerald-600" />
        <Stat label="Revenue (USD)" value={money(t.revenue_usd)} sub="from won accounts" icon={DollarSign} accent="text-emerald-600" />
      </div>

      {/* Tier coverage with metric toggle */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Tier by</span>
          <div className="inline-flex bg-slate-100 rounded-full p-0.5">
            {[["spend", "Monthly Spend"], ["ltv", "Lifetime Value"]].map(([k, lbl]) => (
              <button
                key={k}
                data-testid={`tier-metric-${k}`}
                onClick={() => setTierMetric(k)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  tierMetric === k ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>
        <CoverageBars title={`Coverage by Usage Tier (${tierMetric === "spend" ? "Monthly Spend" : "Lifetime Value"})`} data={tierData} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <CoverageBars title="Coverage by Region" data={data.by_region} />

        {/* Burn-up */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="font-heading text-base font-bold tracking-tight text-slate-900 mb-1">Burn-up — Progress vs Scope</h3>
          <p className="text-xs text-slate-400 mb-4">Cumulative accounts covered and won against the total book over time.</p>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data.burnup} margin={CHART_MARGIN}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="week" tick={XAXIS_TICK_DATE} />
              <YAxis allowDecimals={false} tick={AXIS_TICK} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={LEGEND_STYLE} />
              <Line type="monotone" dataKey="total" name="Total (scope)" stroke="#94A3B8" strokeWidth={2} strokeDasharray="5 4" dot={false} />
              <Line type="monotone" dataKey="covered" name="Covered" stroke="#0284C7" strokeWidth={2.5} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="won" name="Won" stroke="#059669" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Region revenue table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-slate-100">
          <h3 className="font-heading text-base font-bold tracking-tight text-slate-900">Region Breakdown</h3>
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {["Region", "Total", "Covered", "Met", "Advanced", "Won", "Revenue (USD)"].map((h) => (
                <th key={h} className="text-xs font-semibold text-slate-500 uppercase tracking-widest text-left p-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.by_region.map((g) => (
              <tr key={g.label} data-testid={`region-row-${g.label}`} className="border-b border-slate-100">
                <td className="p-3 text-sm font-semibold text-slate-900">{g.label}</td>
                <td className="p-3 text-sm text-slate-700 font-mono">{g.total}</td>
                <td className="p-3 text-sm text-slate-700 font-mono">{g.assigned}</td>
                <td className="p-3 text-sm text-slate-700 font-mono">{g.met}</td>
                <td className="p-3 text-sm text-slate-700 font-mono">{g.advanced}</td>
                <td className="p-3 text-sm text-slate-700 font-mono">{g.won}</td>
                <td className="p-3 text-sm font-semibold text-emerald-600 font-mono">{money(g.revenue_usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
