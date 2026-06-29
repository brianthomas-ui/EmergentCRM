import { useEffect, useState } from "react";
import { TrendingDown } from "lucide-react";
import client from "@/api";
import { Card } from "@/components/dark/Primitives";

export default function WinLossPanel() {
  const [data, setData] = useState(null);

  useEffect(() => {
    let live = true;
    client
      .get("/analytics/winloss")
      .then((r) => live && setData(r.data))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  if (!data) return null;
  const { won = 0, lost = 0, win_rate = 0, loss_reasons = [], funnel = [] } = data;
  const maxFunnel = Math.max(1, ...funnel.map((f) => f.count));
  const maxLoss = Math.max(1, ...loss_reasons.map((r) => r.count));

  return (
    <div className="grid lg:grid-cols-2 gap-4" data-testid="winloss-section">
      {/* Win rate + funnel */}
      <Card className="p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--text)]">Win / Loss</h2>
          <span className="text-[11px] text-[var(--text-faint)]">{won + lost} decided</span>
        </div>
        <div className="flex items-end gap-5">
          <div>
            <div className="text-3xl font-semibold tabular-nums text-emerald-300" data-testid="winloss-winrate">
              {win_rate}%
            </div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-faint)] mt-0.5">win rate</div>
          </div>
          <div className="flex gap-4 mb-1">
            <span className="text-xs text-[var(--text-muted)]">
              <b className="text-emerald-300 tabular-nums" data-testid="winloss-won">{won}</b> won
            </span>
            <span className="text-xs text-[var(--text-muted)]">
              <b className="text-rose-300 tabular-nums" data-testid="winloss-lost">{lost}</b> lost
            </span>
          </div>
        </div>
        <div className="space-y-1.5 pt-1 border-t border-[var(--border)]">
          <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-faint)] pt-2">Funnel</div>
          {funnel.map((f) => (
            <div key={f.stage} className="flex items-center gap-2">
              <span className="w-32 lg:w-40 shrink-0 text-[10px] text-[var(--text-muted)] truncate" title={f.stage}>
                {f.stage}
              </span>
              <div className="flex-1 h-4 rounded bg-slate-700/40 overflow-hidden">
                <div
                  className="h-full rounded bg-sky-500/70"
                  style={{ width: `${(f.count / maxFunnel) * 100}%`, minWidth: f.count ? "2px" : 0 }}
                />
              </div>
              <span className="text-[10px] font-mono tabular-nums text-[var(--text)] shrink-0 w-8 text-right">{f.count}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Loss reasons */}
      <Card className="p-4 flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-[var(--text)] flex items-center gap-1.5">
          <TrendingDown className="w-4 h-4 text-rose-400" /> Why deals are lost
        </h2>
        {loss_reasons.length === 0 ? (
          <div className="text-xs text-[var(--text-faint)] py-8 text-center">No lost deals in this workspace yet.</div>
        ) : (
          <div className="space-y-2">
            {loss_reasons.map((r) => (
              <div key={r.reason} className="flex items-center gap-2" data-testid={`loss-reason-${r.reason}`}>
                <span className="w-36 shrink-0 text-[11px] text-[var(--text-muted)] truncate" title={r.reason}>
                  {r.reason}
                </span>
                <div className="flex-1 h-4 rounded bg-slate-700/40 overflow-hidden">
                  <div className="h-full rounded bg-rose-500/60" style={{ width: `${(r.count / maxLoss) * 100}%`, minWidth: "2px" }} />
                </div>
                <span className="text-[10px] font-mono tabular-nums text-[var(--text)] shrink-0 w-8 text-right">{r.count}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
