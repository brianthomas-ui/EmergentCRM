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
import { money } from "@/components/helpers";

const SEG_COLORS = {
  Won: "#18181B",
  Advanced: "#52525B",
  Met: "#A1A1AA",
  Assigned: "#D4D4D8",
  Uncovered: "#F4F4F5",
};

// Stable chart style objects (defined once, not re-created per render)
const CHART_MARGIN = { top: 4, right: 8, left: -16, bottom: 4 };
const TOOLTIP_STYLE = { borderRadius: 6, border: "1px solid #18181B", background: "#0A0A0A", color: "#fff", fontSize: 12 };
const TOOLTIP_ITEM = { color: "#fff" };
const LEGEND_STYLE = { fontSize: 11 };
const LINE_DOT = { r: 3 };
const AXIS_TICK = { fontSize: 11, fill: "#A1A1AA" };
const XAXIS_TICK_SM = { fontSize: 10, fill: "#71717A" };
const XAXIS_TICK_DATE = { fontSize: 10, fill: "#A1A1AA" };
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

export function CoverageStat({ label, value, sub, icon: Icon, accent = "text-zinc-900" }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">{label}</span>
        <Icon className="w-4 h-4 text-zinc-300" />
      </div>
      <div className={`font-heading text-3xl font-bold tracking-tight mt-2 ${accent}`}>{value}</div>
      {sub && <div className="text-xs text-zinc-400 mt-1">{sub}</div>}
    </div>
  );
}

export function CoverageBars({ title, data }) {
  const rows = data.map(toSegments);
  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-5">
      <h3 className="font-heading text-base font-bold tracking-tight text-zinc-900 mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={rows} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F4F4F5" vertical={false} />
          <XAxis dataKey="label" tick={XAXIS_TICK_SM} interval={0} angle={-20} textAnchor="end" height={50} />
          <YAxis allowDecimals={false} tick={AXIS_TICK} />
          <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM} labelStyle={TOOLTIP_ITEM} />
          <Legend wrapperStyle={LEGEND_STYLE} />
          {STACK_ORDER.map((k) => (
            <Bar key={k} dataKey={k} stackId="a" fill={SEG_COLORS[k]} radius={k === "Won" ? [4, 4, 0, 0] : 0} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BurnUpChart({ data }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-5">
      <h3 className="font-heading text-base font-bold tracking-tight text-zinc-900 mb-1">Burn-up: Progress vs Scope</h3>
      <p className="text-xs text-zinc-400 mb-4">Cumulative accounts covered and won against the total book over time.</p>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F4F4F5" vertical={false} />
          <XAxis dataKey="week" tick={XAXIS_TICK_DATE} />
          <YAxis allowDecimals={false} tick={AXIS_TICK} />
          <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM} labelStyle={TOOLTIP_ITEM} />
          <Legend wrapperStyle={LEGEND_STYLE} />
          <Line type="monotone" dataKey="total" name="Total (scope)" stroke="#D4D4D8" strokeWidth={2} strokeDasharray="5 4" dot={false} />
          <Line type="monotone" dataKey="covered" name="Covered" stroke="#A1A1AA" strokeWidth={2.5} dot={LINE_DOT} />
          <Line type="monotone" dataKey="won" name="Won" stroke="#18181B" strokeWidth={2.5} dot={LINE_DOT} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RegionTable({ regions }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
      <div className="p-5 border-b border-zinc-100">
        <h3 className="font-heading text-base font-bold tracking-tight text-zinc-900">Region Breakdown</h3>
      </div>
      <table className="w-full">
        <thead>
          <tr className="bg-zinc-50 border-b border-zinc-200">
            {["Region", "Total", "Covered", "Met", "Advanced", "Won", "Revenue (USD)"].map((h) => (
              <th key={h} className="text-xs font-semibold text-zinc-500 uppercase tracking-widest text-left p-3">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {regions.map((g) => (
            <tr key={g.label} data-testid={`region-row-${g.label}`} className="border-b border-zinc-100">
              <td className="p-3 text-sm font-semibold text-zinc-900">{g.label}</td>
              <td className="p-3 text-sm text-zinc-700 font-mono">{g.total}</td>
              <td className="p-3 text-sm text-zinc-700 font-mono">{g.assigned}</td>
              <td className="p-3 text-sm text-zinc-700 font-mono">{g.met}</td>
              <td className="p-3 text-sm text-zinc-700 font-mono">{g.advanced}</td>
              <td className="p-3 text-sm text-zinc-700 font-mono">{g.won}</td>
              <td className="p-3 text-sm font-semibold text-emerald-600 font-mono">{money(g.revenue_usd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
