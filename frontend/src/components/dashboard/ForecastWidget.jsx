import { useEffect, useState } from "react";
import { Loader2, Target } from "lucide-react";
import client from "@/api";
import { Card } from "@/components/dark/Primitives";
import { moneyCompact } from "@/components/helpers";

function Metric({ label, value, sub, accent = "text-[var(--text)]", testid }) {
  return (
    <div className="rounded-lg bg-[var(--surface-2)] border border-[var(--border)] p-3" data-testid={testid}>
      <div className="text-[9px] font-mono uppercase tracking-[0.12em] text-[var(--text-faint)]">{label}</div>
      <div className={`text-lg font-semibold tabular-nums mt-1 ${accent}`}>{value}</div>
      {sub && <div className="text-[10px] text-[var(--text-faint)] mt-0.5">{sub}</div>}
    </div>
  );
}

export default function ForecastWidget({ className = "" }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let live = true;
    client
      .get("/forecast")
      .then((r) => live && setData(r.data))
      .catch(() => live && setErr(true));
    return () => {
      live = false;
    };
  }, []);

  if (err) return null;

  const maxStage = data ? Math.max(1, ...data.by_stage.map((x) => x.weighted)) : 1;

  return (
    <Card className={`p-4 flex flex-col gap-4 ${className}`} data-testid="forecast-widget">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-mono font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)] flex items-center gap-1.5">
          <Target className="w-3.5 h-3.5" /> Pipeline Forecast
        </h3>
        {data && (
          <span
            data-testid="forecast-attainment"
            className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border ${
              data.attainment_pct >= 100
                ? "text-emerald-300 border-emerald-500/30 bg-emerald-500/10"
                : data.attainment_pct >= 70
                ? "text-amber-300 border-amber-500/30 bg-amber-500/10"
                : "text-rose-300 border-rose-500/30 bg-rose-500/10"
            }`}
          >
            {data.attainment_pct}% of target
          </span>
        )}
      </div>

      {!data ? (
        <div className="flex items-center gap-2 text-[var(--text-faint)] text-xs py-6 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading forecast…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Metric label="Committed" value={moneyCompact(data.committed)} accent="text-emerald-300" testid="forecast-committed" />
            <Metric label="Weighted open" value={moneyCompact(data.weighted_open)} sub={`${data.open_deals} open`} testid="forecast-weighted" />
            <Metric label="Forecast" value={moneyCompact(data.forecast_total)} testid="forecast-total" />
          </div>

          {data.target > 0 && (
            <div>
              <div className="flex items-center justify-between text-[10px] text-[var(--text-faint)] font-mono mb-1">
                <span>Forecast vs target</span>
                <span>
                  {moneyCompact(data.forecast_total)} / {moneyCompact(data.target)}
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-700/60 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    data.attainment_pct >= 100 ? "bg-emerald-500" : "bg-emerald-500/70"
                  }`}
                  style={{ width: `${Math.min(100, data.attainment_pct)}%` }}
                />
              </div>
            </div>
          )}

          {data.by_stage?.length > 0 && (
            <div className="space-y-1.5 pt-1 border-t border-[var(--border)]">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-faint)] pt-2">
                Weighted by stage
              </div>
              {data.by_stage.map((s) => (
                <div key={s.stage} className="flex items-center gap-2" data-testid={`forecast-stage-${s.stage}`}>
                  <span className="w-28 lg:w-40 shrink-0 text-[10px] text-[var(--text-muted)] truncate" title={s.stage}>
                    {s.stage}
                  </span>
                  <div className="flex-1 h-4 rounded bg-slate-700/40 overflow-hidden">
                    <div
                      className="h-full rounded bg-emerald-500/70 transition-all duration-300"
                      style={{ width: `${(s.weighted / maxStage) * 100}%`, minWidth: "2px" }}
                    />
                  </div>
                  <span className="text-[10px] font-mono tabular-nums text-[var(--text)] shrink-0 w-14 text-right">
                    {moneyCompact(s.weighted)}
                  </span>
                  <span className="text-[10px] font-mono text-[var(--text-faint)] shrink-0 w-8 text-right">
                    {Math.round(s.prob * 100)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
