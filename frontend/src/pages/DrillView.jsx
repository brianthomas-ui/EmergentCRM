import { useEffect, useMemo, useState } from "react";
import { Loader2, ArrowUpDown } from "lucide-react";
import client from "@/api";
import { Card } from "@/components/dark/Primitives";
import PeriodFilter, { DEFAULT_PERIOD, toParams } from "@/components/dark/PeriodFilter";
import { money, moneyCompact, fmtDateTime, Badge, statusToneClass } from "@/components/helpers";
import { useOpen } from "@/hooks/useOpen";

const num = (v) => Number(v || 0);

// ---- Tile ----
function Tile({ label, value, accent = "text-[var(--text)]" }) {
  return (
    <Card className="p-4">
      <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-[var(--text-faint)]">{label}</div>
      <div className={`text-2xl font-semibold tabular-nums mt-1 ${accent}`}>{value}</div>
    </Card>
  );
}

// ---- Column sets ----
function buildConfig(spec, openLead, openAgent) {
  const kind = spec.kind || "metric";
  const metric = spec.metric || "";

  if (kind === "payments") {
    return {
      needsPeriod: false,
      cols: [
        { key: "customer", label: "Customer", grow: true, render: (r) => (
          <button onClick={() => (r.lead_id ? openLead(r.lead_id, r.lead_name) : null)} className={`text-left ${r.lead_id ? "hover:text-emerald-300" : ""} text-[var(--text)] font-medium transition-colors`}>
            {r.lead_name || r.customer_email || "Standalone"}
          </button>
        ) },
        { key: "amount_usd", label: "Amount", align: "right", sort: (r) => num(r.amount_usd ?? r.amount), render: (r) => <span className="font-mono tabular-nums">{money(r.amount_usd ?? r.amount)}</span> },
        { key: "provider", label: "Provider", render: (r) => <span className="capitalize">{r.provider}</span> },
        { key: "agent_name", label: "Agent", render: (r) => r.agent_name || "-" },
        { key: "payment_status", label: "Status", render: (r) => <Badge className={statusToneClass(r.payment_status)}>{r.payment_status}</Badge> },
        { key: "created_at", label: "Created", sort: (r) => r.created_at || "", render: (r) => <span className="text-xs text-[var(--text-faint)] font-mono">{fmtDateTime(r.created_at)}</span> },
      ],
      tiles: (rows) => [
        { label: "Payments", value: rows.length },
        { label: "Total (USD)", value: moneyCompact(rows.reduce((s, r) => s + num(r.amount_usd ?? r.amount), 0)), accent: metric === "pending" ? "text-amber-300" : "text-emerald-300" },
      ],
      defaultSort: "amount_usd",
    };
  }

  if (kind === "teamstat") {
    const valOf = (m) => {
      const s = m.stats || {};
      if (metric === "revenue") return num(s.revenue);
      if (metric === "meetings") return num(s.meetings);
      if (metric === "conv") return num(s.leads) > 0 ? (num(s.won) / num(s.leads)) * 100 : 0;
      return num(s.won);
    };
    const disp = (m) => {
      const v = valOf(m);
      if (metric === "revenue") return money(v);
      if (metric === "conv") return `${v.toFixed(1)}%`;
      return String(v);
    };
    return {
      needsPeriod: true,
      cols: [
        { key: "name", label: "Rep", grow: true, render: (r) => (
          <button onClick={() => openAgent(r.id, r.name)} className="text-left font-medium text-[var(--text)] hover:text-emerald-300 transition-colors">{r.name}</button>
        ) },
        { key: "val", label: spec.title?.split(" · ")[0] || "Value", align: "right", sort: (r) => valOf(r), render: (r) => <span className="font-mono tabular-nums">{disp(r)}</span> },
      ],
      tiles: (rows) => [
        { label: "Reps", value: rows.length },
        { label: "Total", value: metric === "revenue" ? moneyCompact(rows.reduce((s, r) => s + valOf(r), 0)) : metric === "conv" ? "—" : rows.reduce((s, r) => s + valOf(r), 0) },
      ],
      defaultSort: "val",
    };
  }

  // ---- metric (dashboard drilldown) ----
  const m = metric.toLowerCase();
  const isPayments = metric === "revenue_closed" || metric.startsWith("product:") || m.includes("revenue");
  const isMeetings = metric === "meetings_today" || metric === "no_shows_today";

  if (isMeetings) {
    return {
      needsPeriod: true,
      cols: [
        { key: "lead_name", label: "Lead", grow: true, render: (r) => (
          <button onClick={() => (r.lead_id ? openLead(r.lead_id, r.lead_name) : null)} className="text-left font-medium text-[var(--text)] hover:text-emerald-300 transition-colors">{r.lead_name || "—"}</button>
        ) },
        { key: "agent_name", label: "Agent", render: (r) => r.agent_name || "-" },
        { key: "source", label: "Source", render: (r) => r.source || "-" },
        { key: "scheduled_at", label: "Scheduled", sort: (r) => r.scheduled_at || "", render: (r) => <span className="text-xs text-[var(--text-faint)] font-mono">{fmtDateTime(r.scheduled_at)}</span> },
      ],
      tiles: (rows) => [{ label: "Meetings", value: rows.length }],
    };
  }
  if (isPayments) {
    return {
      needsPeriod: true,
      cols: [
        { key: "lead_name", label: "Lead", grow: true, render: (r) => (
          <button onClick={() => (r.lead_id || r.id ? openLead(r.lead_id || r.id, r.lead_name || r.name) : null)} className="text-left font-medium text-[var(--text)] hover:text-emerald-300 transition-colors">{r.lead_name || r.name || "—"}</button>
        ) },
        { key: "product_line", label: "Product", render: (r) => r.product_line || "-" },
        { key: "amount_usd", label: "Amount", align: "right", sort: (r) => num(r.amount_usd ?? r.amount), render: (r) => <span className="font-mono tabular-nums">{money(r.amount_usd ?? r.amount)}</span> },
        { key: "payment_status", label: "Status", render: (r) => (r.payment_status ? <Badge className={statusToneClass(r.payment_status)}>{r.payment_status}</Badge> : "-") },
      ],
      tiles: (rows) => [
        { label: "Records", value: rows.length },
        { label: "Total (USD)", value: moneyCompact(rows.reduce((s, r) => s + num(r.amount_usd ?? r.amount), 0)), accent: "text-emerald-300" },
      ],
      defaultSort: "amount_usd",
    };
  }
  // leads
  return {
    needsPeriod: true,
    cols: [
      { key: "name", label: "Name", grow: true, render: (r) => (
        <button onClick={() => (r.id || r.lead_id ? openLead(r.id || r.lead_id, r.name) : null)} className="text-left font-medium text-[var(--text)] hover:text-emerald-300 transition-colors">{r.name || "—"}</button>
      ) },
      { key: "company", label: "Company", render: (r) => r.company || "-" },
      { key: "status", label: "Status", render: (r) => (r.status ? <Badge className={statusToneClass(r.status, r.status_tone)}>{r.status}</Badge> : "-") },
      { key: "monthly_spend", label: "Spend/mo", align: "right", sort: (r) => num(r.monthly_spend), render: (r) => <span className="font-mono tabular-nums">{money(r.monthly_spend)}</span> },
      { key: "lifetime_value", label: "LTV", align: "right", sort: (r) => num(r.lifetime_value), render: (r) => <span className="font-mono tabular-nums">{money(r.lifetime_value)}</span> },
    ],
    tiles: (rows) => [
      { label: "Leads", value: rows.length },
      { label: "Pipeline (LTV)", value: moneyCompact(rows.reduce((s, r) => s + num(r.lifetime_value), 0)) },
    ],
    defaultSort: "lifetime_value",
  };
}

export default function DrillView({ spec }) {
  const { openLead, openAgent } = useOpen();
  const [period, setPeriod] = useState(DEFAULT_PERIOD);
  const [rows, setRows] = useState(null);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("desc");

  const config = useMemo(() => buildConfig(spec, openLead, openAgent), [spec, openLead, openAgent]);
  const kind = spec.kind || "metric";

  useEffect(() => {
    let live = true;
    setRows(null);
    const run = async () => {
      try {
        if (kind === "payments") {
          const { data } = await client.get("/payments");
          let list = data || [];
          if (spec.metric === "collected") list = list.filter((p) => p.payment_status === "paid");
          else if (spec.metric === "pending") list = list.filter((p) => p.payment_status !== "paid");
          if (live) setRows(list);
        } else if (kind === "teamstat") {
          const { data } = await client.get("/team", { params: toParams(period) });
          if (live) setRows((data || []).filter((m) => m.stats));
        } else {
          const { data } = await client.get("/dashboard/drilldown", { params: { metric: spec.metric, ...toParams(period) } });
          if (live) setRows(Array.isArray(data) ? data : data?.items || []);
        }
      } catch (e) {
        if (live) setRows([]);
      }
    };
    run();
    return () => { live = false; };
  }, [kind, spec.metric, period]);

  const sorted = useMemo(() => {
    if (!rows) return null;
    const key = sortKey || config.defaultSort;
    if (!key) return rows;
    const col = config.cols.find((c) => c.key === key);
    if (!col || !col.sort) return rows;
    const arr = [...rows].sort((a, b) => {
      const va = col.sort(a), vb = col.sort(b);
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [rows, sortKey, sortDir, config]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  return (
    <div className="flex flex-col gap-5" data-testid="drill-view">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-emerald-400/80">Breakdown</div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-[var(--text)] mt-0.5">{spec.title || "Details"}</h1>
        </div>
        {config.needsPeriod && <PeriodFilter value={period} onChange={setPeriod} />}
      </div>

      {!sorted ? (
        <div className="flex items-center gap-2 text-[var(--text-faint)] text-sm py-16 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {config.tiles(sorted).map((t) => <Tile key={t.label} {...t} />)}
          </div>

          <Card className="overflow-hidden">
            {sorted.length === 0 ? (
              <div className="py-16 text-center text-sm text-[var(--text-faint)]">No records found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]/40">
                      {config.cols.map((c) => (
                        <th
                          key={c.key}
                          onClick={() => c.sort && toggleSort(c.key)}
                          className={`px-3 py-2.5 text-[10px] font-mono font-semibold uppercase tracking-wider text-[var(--text-faint)] ${c.align === "right" ? "text-right" : "text-left"} ${c.sort ? "cursor-pointer hover:text-[var(--text)]" : ""}`}
                        >
                          <span className="inline-flex items-center gap-1">{c.label}{c.sort && <ArrowUpDown className="w-3 h-3 opacity-50" />}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((r, i) => (
                      <tr key={r.id || r.lead_id || i} data-testid={`drill-row-${r.id || r.lead_id || i}`} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-2)] transition-colors">
                        {config.cols.map((c) => (
                          <td key={c.key} className={`px-3 py-2.5 text-[var(--text-muted)] ${c.align === "right" ? "text-right" : "text-left"}`}>
                            {c.render(r)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-3 py-2 text-right text-[11px] text-[var(--text-faint)] font-mono">{sorted.length} record{sorted.length !== 1 ? "s" : ""}</div>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
