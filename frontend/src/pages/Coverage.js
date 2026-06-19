import { useCallback, useEffect, useState } from "react";
import client from "@/api";
import { money } from "@/components/helpers";
import { BurnUpChart } from "@/components/coverage/CoverageWidgets";
import { Target, Users, CheckCircle2, DollarSign } from "lucide-react";
import DrillDownModal from "@/components/DrillDownModal";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";

// Chart style constants copied from CoverageWidgets to keep them local.
const SEG_COLORS = {
  Won: "#18181B",
  Advanced: "#52525B",
  Met: "#A1A1AA",
  Assigned: "#D4D4D8",
  Uncovered: "#F4F4F5",
};
const CHART_MARGIN = { top: 4, right: 8, left: -16, bottom: 4 };
const TOOLTIP_STYLE = { borderRadius: 6, border: "1px solid #18181B", background: "#0A0A0A", color: "#fff", fontSize: 12 };
const TOOLTIP_ITEM = { color: "#fff" };
const LEGEND_STYLE = { fontSize: 11 };
const AXIS_TICK = { fontSize: 11, fill: "#A1A1AA" };
const XAXIS_TICK_SM = { fontSize: 10, fill: "#71717A" };
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

// Drill-down column definitions.
const LEAD_COLUMNS = [
  { key: "name",    label: "Name" },
  { key: "company", label: "Company" },
  { key: "stage",   label: "Stage" },
  { key: "monthly_spend",  label: "Spend/mo", render: (v) => money(v) },
  { key: "lifetime_value", label: "LTV",      render: (v) => money(v) },
];

// Clickable coverage bars.
function ClickableCoverageBars({ title, data, onBarClick }) {
  const rows = data.map(toSegments);
  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-5">
      <h3 className="font-heading text-base font-bold tracking-tight text-zinc-900 mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={rows}
          margin={CHART_MARGIN}
          onClick={(payload) => {
            if (payload && payload.activePayload && payload.activePayload.length > 0) {
              const label = payload.activePayload[0]?.payload?.label;
              if (label && onBarClick) onBarClick(label);
            }
          }}
          style={{ cursor: onBarClick ? "pointer" : "default" }}
        >
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

// Clickable region table.
function ClickableRegionTable({ regions, onRowClick }) {
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
            <tr
              key={g.label}
              data-testid={`region-row-${g.label}`}
              role="button"
              tabIndex={0}
              className="border-b border-zinc-100 cursor-pointer hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-950 transition-colors"
              onClick={() => onRowClick(g.label)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onRowClick(g.label)}
            >
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

// Local stat tile copy; stat tiles do not need click behavior.
function CoverageStat({ label, value, sub, icon: Icon, accent = "text-zinc-900" }) {
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

// Main page.
export default function Coverage() {
  const [data, setData]         = useState(null);
  const [tierMetric, setTierMetric] = useState("spend"); // spend | ltv

  // Drill-down state
  const [drill, setDrill] = useState({ open: false, title: "", items: null });

  useEffect(() => {
    client.get("/coverage").then((r) => setData(r.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeDrill = () => setDrill((d) => ({ ...d, open: false }));

  const openDrill = useCallback((params, title) => {
    setDrill({ open: true, title, items: null });
    client
      .get("/coverage/drilldown", { params })
      .then((r) => setDrill((d) => ({ ...d, items: Array.isArray(r.data) ? r.data : (r.data?.items ?? []) })))
      .catch(() => setDrill((d) => ({ ...d, items: [] })));
  }, []);

  if (!data) return <div className="text-zinc-400 text-sm">Loading coverage...</div>;

  const t = data.totals;
  const pct = (n) => (t.total ? Math.round((n / t.total) * 100) : 0);
  const tierData = tierMetric === "spend" ? data.by_tier_spend : data.by_tier_ltv;

  // Handlers
  const onTierBarClick = (label) =>
    openDrill({ basis: tierMetric, tier: label }, `${tierMetric === "spend" ? "Spend" : "LTV"} Tier - ${label}`);

  const onRegionBarClick = (label) =>
    openDrill({ basis: tierMetric, region: label }, `Region - ${label}`);

  const onRegionRowClick = (label) =>
    openDrill({ basis: tierMetric, region: label }, `Region - ${label}`);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight text-zinc-900">Coverage & Burn</h1>
        <p className="text-sm text-zinc-500 mt-1">How well the book is worked across usage tiers and regions.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <CoverageStat label="Total Accounts" value={t.total} sub="in the book" icon={Users} />
        <CoverageStat label="Coverage (Owned)" value={`${pct(t.assigned)}%`} sub={`${t.assigned} assigned · ${t.met} met`} icon={Target} accent="text-zinc-950" />
        <CoverageStat label="Won" value={`${pct(t.won)}%`} sub={`${t.won} closed`} icon={CheckCircle2} accent="text-emerald-600" />
        <CoverageStat label="Revenue (USD)" value={money(t.revenue_usd)} sub="from won accounts" icon={DollarSign} accent="text-emerald-600" />
      </div>

      {/* Tier coverage with metric toggle */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Tier by</span>
          <div className="inline-flex bg-zinc-100 rounded-md p-0.5">
            {[["spend", "Monthly Spend"], ["ltv", "Lifetime Value"]].map(([k, lbl]) => (
              <button
                key={k}
                data-testid={`tier-metric-${k}`}
                onClick={() => setTierMetric(k)}
                className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  tierMetric === k ? "bg-zinc-950 text-white" : "text-zinc-600 hover:text-zinc-950"
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>
        <ClickableCoverageBars
          title={`Coverage by Usage Tier (${tierMetric === "spend" ? "Monthly Spend" : "Lifetime Value"})`}
          data={tierData}
          onBarClick={onTierBarClick}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <ClickableCoverageBars
          title="Coverage by Region"
          data={data.by_region}
          onBarClick={onRegionBarClick}
        />
        <BurnUpChart data={data.burnup} />
      </div>

      <ClickableRegionTable
        regions={data.by_region}
        onRowClick={onRegionRowClick}
      />

      <DrillDownModal
        open={drill.open}
        onClose={closeDrill}
        title={drill.title}
        items={drill.items}
        columns={LEAD_COLUMNS}
      />
    </div>
  );
}
