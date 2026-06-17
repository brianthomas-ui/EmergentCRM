import { useEffect, useState } from "react";
import client from "@/api";
import { money } from "@/components/helpers";
import { CoverageStat, CoverageBars, BurnUpChart, RegionTable } from "@/components/coverage/CoverageWidgets";
import { Target, Users, CheckCircle2, DollarSign } from "lucide-react";

export default function Coverage() {
  const [data, setData] = useState(null);
  const [tierMetric, setTierMetric] = useState("spend"); // spend | ltv

  useEffect(() => {
    // mount-only: fetch coverage once
    client.get("/coverage").then((r) => setData(r.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data) return <div className="text-zinc-400 text-sm">Loading coverage…</div>;

  const t = data.totals;
  const pct = (n) => (t.total ? Math.round((n / t.total) * 100) : 0);
  const tierData = tierMetric === "spend" ? data.by_tier_spend : data.by_tier_ltv;

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
        <CoverageBars title={`Coverage by Usage Tier (${tierMetric === "spend" ? "Monthly Spend" : "Lifetime Value"})`} data={tierData} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <CoverageBars title="Coverage by Region" data={data.by_region} />
        <BurnUpChart data={data.burnup} />
      </div>

      <RegionTable regions={data.by_region} />
    </div>
  );
}
