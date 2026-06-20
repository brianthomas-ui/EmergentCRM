import { useMemo } from "react";
import { CalendarCheck, ChevronRight, Users } from "lucide-react";
import { timeAgo } from "@/components/helpers";
import { Card, Table, THead, TH, TR, TD, StatusBadge } from "@/components/dark/Primitives";
import Avatar from "@/components/dark/Avatar";

export function KpiCard({ label, value, sub, accent = false }) {
  return (
    <Card className="p-4 flex flex-col gap-1 min-w-0">
      <span className="text-[10px] font-mono font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]">
        {label}
      </span>
      <span
        className={`text-3xl font-semibold tabular-nums tracking-tight ${
          accent ? "text-emerald-300" : "text-[var(--text)]"
        }`}
      >
        {value}
      </span>
      {sub && <span className="text-xs text-[var(--text-muted)]">{sub}</span>}
    </Card>
  );
}

function SourceTag({ source }) {
  if (!source) return <span className="text-[var(--text-faint)]">—</span>;
  return (
    <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-medium bg-[var(--surface-3)] text-[var(--text-muted)] border border-[var(--border)]">
      {source}
    </span>
  );
}

export function TodaysMeetings({ meetings }) {
  const todayStr = new Date().toDateString();
  const todayMeets = useMemo(
    () =>
      meetings
        .filter((m) => m.scheduled_at && new Date(m.scheduled_at).toDateString() === todayStr)
        .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [meetings]
  );
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <CalendarCheck className="w-4 h-4 text-emerald-400" />
        <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
          Today's Meetings
        </span>
      </div>
      {todayMeets.length === 0 ? (
        <p className="text-xs text-[var(--text-faint)] py-1">None scheduled today.</p>
      ) : (
        <div className="space-y-2">
          {todayMeets.map((m) => (
            <div key={m.id} className="flex items-start gap-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
              <div className="min-w-0">
                <div className="text-sm text-[var(--text)] font-medium truncate">
                  {m.lead_name || "—"}
                </div>
                <div className="text-[11px] text-[var(--text-faint)]">
                  {new Date(m.scheduled_at).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  · {m.source || ""}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export function RecentNotes({ notes }) {
  const top = useMemo(() => notes.slice(0, 5), [notes]);
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
          Recent Notes
        </span>
      </div>
      {top.length === 0 ? (
        <p className="text-xs text-[var(--text-faint)] py-1">No recent notes.</p>
      ) : (
        <div className="space-y-3">
          {top.map((n, i) => (
            <div key={n.id || i} className="flex items-start gap-2.5">
              <Avatar name={n.author} size="sm" className="mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-semibold text-[var(--text)] truncate">{n.author}</span>
                  <span className="text-[10px] text-[var(--text-faint)] shrink-0">{timeAgo(n.created_at)}</span>
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-2">{n.text}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function LeadRow({ lead, meta, onRowClick }) {
  const l = lead;
  return (
    <TR key={l.id} data-testid={`lead-row-${l.id}`} onClick={() => onRowClick(l.id)}>
      <TD>
        <div className="flex items-center gap-2.5">
          <Avatar name={l.name} size="sm" src={l.avatar_url} />
          <div className="min-w-0">
            <div className="text-sm font-medium text-[var(--text)] truncate max-w-[160px]">{l.name}</div>
            {l.company && (
              <div className="text-[11px] text-[var(--text-faint)] truncate max-w-[160px]">{l.company}</div>
            )}
          </div>
        </div>
      </TD>
      <TD><SourceTag source={l.source} /></TD>
      <TD>
        <span className="text-sm text-[var(--text-muted)]">
          {l.product_line || l.plan || <span className="text-[var(--text-faint)]">—</span>}
        </span>
      </TD>
      <TD>
        {l.referred_by_name ? (
          <span className="text-xs text-emerald-300 font-medium" data-testid={`referral-by-${l.id}`}>
            {l.referred_by_name}
          </span>
        ) : (
          <span className="text-[var(--text-faint)]">—</span>
        )}
      </TD>
      <TD>
        <span className="text-xs text-[var(--text-muted)]">
          {l.last_contacted_at ? timeAgo(l.last_contacted_at) : <span className="text-[var(--text-faint)]">Never</span>}
        </span>
      </TD>
      <TD>
        {l.status ? (
          <StatusBadge status={l.status} tone={(meta?.status_meta || {})[l.status]?.tone} />
        ) : (
          <span className="text-[var(--text-faint)] text-xs">—</span>
        )}
      </TD>
      <TD align="right">
        <ChevronRight className="w-4 h-4 text-[var(--text-faint)]" />
      </TD>
    </TR>
  );
}

export function LeadsTable({ filtered, leads, loading, meta, onRowClick }) {
  return (
    <Card className="overflow-hidden">
      <Table>
        <THead>
          <TH>Name / Company</TH>
          <TH>Source</TH>
          <TH>Product Interest</TH>
          <TH>Referred By</TH>
          <TH>Last Contacted</TH>
          <TH>Status</TH>
          <TH className="w-8" />
        </THead>
        <tbody>
          {filtered.map((l) => (
            <LeadRow key={l.id} lead={l} meta={meta} onRowClick={onRowClick} />
          ))}
          {!loading && filtered.length === 0 && (
            <tr>
              <td colSpan={7} className="py-14 text-center">
                <Users className="w-8 h-8 mx-auto mb-2 text-[var(--text-faint)]" />
                <p className="text-sm text-[var(--text-faint)]">No leads found.</p>
              </td>
            </tr>
          )}
          {loading && (
            <tr>
              <td colSpan={7} className="py-10 text-center text-xs text-[var(--text-faint)]">
                Loading…
              </td>
            </tr>
          )}
        </tbody>
      </Table>
      {!loading && (
        <div className="px-4 py-2.5 border-t border-[var(--border)] text-[10px] text-[var(--text-faint)] font-mono">
          Showing {filtered.length} / {leads.length} leads
        </div>
      )}
    </Card>
  );
}
