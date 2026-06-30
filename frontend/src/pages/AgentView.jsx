import { useEffect, useMemo, useState } from "react";
import { Loader2, Mail, Trophy, CalendarCheck, Users as UsersIcon, DollarSign } from "lucide-react";
import client from "@/api";
import { Card } from "@/components/dark/Primitives";
import Avatar from "@/components/dark/Avatar";
import { money, moneyCompact, Badge, statusToneClass, fmtDate } from "@/components/helpers";
import { useOpen } from "@/hooks/useOpen";

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

const num = (v) => Number(v || 0);

function KpiTile({ icon: Icon, label, value, accent = "text-[var(--text)]" }) {
  return (
    <Card className="p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-[var(--text-faint)]">{label}</span>
        {Icon && <Icon className="w-3.5 h-3.5 text-[var(--text-faint)]" />}
      </div>
      <div className={`text-2xl font-semibold tabular-nums tracking-tight ${accent}`}>{value}</div>
    </Card>
  );
}

export default function AgentView({ agentId, name }) {
  const { openLead } = useOpen();
  const [agent, setAgent] = useState(null);
  const [leads, setLeads] = useState(null);

  useEffect(() => {
    let live = true;
    setAgent(null);
    setLeads(null);
    client
      .get("/team", { params: { period: "this_month" } })
      .then((r) => {
        if (!live) return;
        const a = (r.data || []).find((m) => m.id === agentId) || null;
        setAgent(a);
      })
      .catch(() => live && setAgent(false));
    client
      .get("/leads", { params: { owner: agentId } })
      .then((r) => live && setLeads(r.data || []))
      .catch(() => live && setLeads([]));
    return () => {
      live = false;
    };
  }, [agentId]);

  const stats = agent?.stats || {};
  const target = num(agent?.monthly_target);
  const revenue = num(stats.revenue);
  const targetPct = target > 0 ? Math.min(100, Math.round((revenue / target) * 100)) : 0;
  const convPct = num(stats.leads) > 0 ? (num(stats.won) / num(stats.leads)) * 100 : 0;

  const stageRows = useMemo(() => {
    const counts = {};
    (leads || []).forEach((l) => {
      counts[l.status] = (counts[l.status] || 0) + 1;
    });
    const rows = STATUS_ORDER.map((s) => ({ status: s, count: counts[s] || 0 }));
    const max = Math.max(1, ...rows.map((r) => r.count));
    return { rows, max };
  }, [leads]);

  const sortedLeads = useMemo(
    () => [...(leads || [])].sort((a, b) => num(b.lifetime_value) - num(a.lifetime_value)),
    [leads]
  );

  const displayName = agent?.name || name || "Agent";

  return (
    <div className="flex flex-col gap-5" data-testid="agent-view">
      <div className="flex items-end gap-3">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-emerald-400/80">Agent profile</div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-[var(--text)] mt-0.5">{displayName}</h1>
        </div>
      </div>

      {agent === null || leads === null ? (
        <div className="flex items-center gap-2 text-[var(--text-faint)] text-sm py-16 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-5">
          {/* Left: profile + target */}
          <div className="col-span-12 lg:col-span-4 flex flex-col gap-5">
            <Card className="p-5 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <Avatar src={agent?.avatar_url || ""} name={displayName} size="lg" className="shrink-0" />
                <div className="min-w-0">
                  <div className="text-base font-semibold text-[var(--text)] truncate">{displayName}</div>
                  {agent?.email && (
                    <a
                      href={`mailto:${agent.email}`}
                      className="inline-flex items-center gap-1.5 text-xs text-[var(--text-faint)] hover:text-emerald-300 transition-colors truncate"
                    >
                      <Mail className="w-3 h-3" /> {agent.email}
                    </a>
                  )}
                  <div className="mt-1">
                    <Badge className="tone-chip tone-emerald">{agent?.role || "agent"}</Badge>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-faint)]">Won vs Target</span>
                  <span className="text-xs font-mono text-[var(--text-muted)]">
                    {moneyCompact(revenue)} / {target > 0 ? moneyCompact(target) : "—"}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[var(--surface-3)] overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${targetPct}%` }} />
                </div>
                <div className="text-right text-[10px] font-mono text-emerald-300 mt-1">{targetPct}% of target</div>
              </div>
            </Card>

            <div className="grid grid-cols-2 gap-3">
              <KpiTile icon={DollarSign} label="Revenue" value={moneyCompact(revenue)} accent="text-emerald-300" />
              <KpiTile icon={Trophy} label="Deals Won" value={num(stats.won)} />
              <KpiTile icon={CalendarCheck} label="Meetings" value={num(stats.meetings)} />
              <KpiTile icon={UsersIcon} label="Leads" value={num(stats.leads)} />
            </div>
            <KpiTile label="Conversion (Won / Leads)" value={`${convPct.toFixed(1)}%`} accent="text-sky-300" />
          </div>

          {/* Right: pipeline + assigned leads */}
          <div className="col-span-12 lg:col-span-8 flex flex-col gap-5">
            <Card className="p-4 flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-[var(--text)]">Pipeline by Stage</h2>
              <div className="space-y-1.5">
                {stageRows.rows.map((r) => (
                  <div key={r.status} className="flex items-center gap-2">
                    <div className="w-32 lg:w-40 shrink-0 text-[10px] font-medium text-[var(--text-muted)] truncate">{r.status}</div>
                    <div className="flex-1 h-5 rounded bg-[var(--surface-3)] overflow-hidden relative">
                      <div
                        className="h-full rounded bg-emerald-500/80 transition-all"
                        style={{ width: `${(r.count / stageRows.max) * 100}%`, minWidth: r.count > 0 ? "2px" : 0 }}
                      />
                      {r.count > 0 && (
                        <span className="absolute inset-y-0 right-1.5 flex items-center text-[10px] font-semibold text-white font-mono">
                          {r.count}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
                <h2 className="text-sm font-semibold text-[var(--text)]">Assigned Leads</h2>
                <span className="text-[11px] text-[var(--text-faint)]">{sortedLeads.length} leads</span>
              </div>
              {sortedLeads.length === 0 ? (
                <div className="py-12 text-center text-sm text-[var(--text-faint)]">No leads assigned in this workspace.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]/40 text-left">
                        {["Name", "Company", "Status", "LTV", "Created"].map((h, i) => (
                          <th key={h} className={`px-3 py-2.5 text-[10px] font-mono font-semibold uppercase tracking-wider text-[var(--text-faint)] ${i === 3 ? "text-right" : ""}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedLeads.slice(0, 100).map((l) => (
                        <tr key={l.id} data-testid={`agent-lead-${l.id}`} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-2)] transition-colors">
                          <td className="px-3 py-2.5">
                            <button onClick={() => openLead(l.id, l.name)} className="text-left font-medium text-[var(--text)] hover:text-emerald-300 transition-colors">{l.name}</button>
                          </td>
                          <td className="px-3 py-2.5 text-[var(--text-muted)]">{l.company || "-"}</td>
                          <td className="px-3 py-2.5">{l.status ? <Badge className={statusToneClass(l.status, l.status_tone)}>{l.status}</Badge> : "-"}</td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[var(--text-muted)]">{money(l.lifetime_value)}</td>
                          <td className="px-3 py-2.5 text-xs font-mono text-[var(--text-faint)]">{fmtDate(l.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
