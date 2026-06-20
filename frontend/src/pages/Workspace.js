import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import client, { apiError } from "@/api";
import { useAuth } from "@/context/AuthContext";
import { money, fmtDateTime, timeAgo, Badge, statusToneClass } from "@/components/helpers";
import {
  CalendarClock, Bell, CreditCard, AlertTriangle, MessageSquare,
  TrendingUp, Users, Trophy, ChevronRight, Inbox,
} from "lucide-react";

const StatTile = ({ icon: Icon, label, value, accent, testid }) => (
  <div data-testid={testid} className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
    <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-[var(--text-faint)]">
      <Icon className={`w-3.5 h-3.5 ${accent || ""}`} /> {label}
    </div>
    <div className="mt-1.5 text-2xl font-semibold tabular-nums text-[var(--text)]">{value}</div>
  </div>
);

const Section = ({ icon: Icon, title, count, children, testid }) => (
  <div data-testid={testid} className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] overflow-hidden">
    <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
        <Icon className="w-4 h-4 text-[var(--accent-text)]" /> {title}
      </div>
      <span className="text-[11px] font-mono text-[var(--text-faint)]">{count}</span>
    </div>
    <div className="divide-y divide-[var(--border)]">{children}</div>
  </div>
);

const Empty = ({ children }) => (
  <div className="px-4 py-8 text-center text-sm text-[var(--text-faint)] flex flex-col items-center gap-2">
    <Inbox className="w-5 h-5 opacity-60" /> {children}
  </div>
);

function LeadRow({ lead, onOpen, right }) {
  return (
    <button
      onClick={() => onOpen(lead.id)}
      data-testid={`workspace-lead-${lead.id}`}
      className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--surface-2)] transition-colors group"
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-[var(--text)] truncate">{lead.name}</div>
        <div className="text-[11px] text-[var(--text-faint)] truncate">{lead.company || lead.email}</div>
      </div>
      {lead.status && <Badge className={statusToneClass(lead.status, lead.status_tone)}>{lead.status}</Badge>}
      {right}
      <ChevronRight className="w-4 h-4 text-[var(--text-faint)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </button>
  );
}

export default function Workspace() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    client.get("/workspace").then((r) => setData(r.data)).catch((e) => setError(apiError(e)));
  }, []);

  const openLead = (id) => navigate(`/leads/${id}`);

  if (error) return <div data-testid="workspace-error" className="text-sm text-rose-400">{error}</div>;
  if (!data) return <div className="text-sm text-[var(--text-faint)]">Loading your work…</div>;

  const s = data.stats;
  const firstName = (user?.name || "there").split(" ")[0];

  return (
    <div className="space-y-6" data-testid="workspace-page">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-[var(--text)]">
          Good to see you, {firstName} 👋
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Your command center — clear this list to keep every active conversation moving.
        </p>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatTile testid="ws-stat-open" icon={Users} label="Open leads" value={s.open_leads} />
        <StatTile testid="ws-stat-followups" icon={Bell} label="Follow-ups due" value={s.followups_due} accent="text-amber-400" />
        <StatTile testid="ws-stat-pending" icon={CreditCard} label="Payment pending" value={s.payment_pending} accent="text-amber-400" />
        <StatTile testid="ws-stat-meetings" icon={CalendarClock} label="Meetings / wk" value={s.meetings_this_week} />
        <StatTile testid="ws-stat-won" icon={Trophy} label="Won this month" value={s.won_this_month} accent="text-emerald-400" />
        <StatTile testid="ws-stat-revenue" icon={TrendingUp} label="Revenue / mo" value={money(s.revenue_this_month)} accent="text-emerald-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Section testid="ws-followups" icon={Bell} title="Follow-ups due" count={data.followups_due.length}>
          {data.followups_due.length === 0 ? <Empty>You're all caught up on follow-ups.</Empty> :
            data.followups_due.map((l) => (
              <LeadRow key={l.id} lead={l} onOpen={openLead}
                right={l.next_followup_at && <span className="text-[10px] font-mono text-amber-400 shrink-0">{timeAgo(l.next_followup_at)}</span>} />
            ))}
        </Section>

        <Section testid="ws-today" icon={CalendarClock} title="Today's meetings" count={data.today_meetings.length}>
          {data.today_meetings.length === 0 ? <Empty>No meetings scheduled today.</Empty> :
            data.today_meetings.map((m) => (
              <button key={m.id} onClick={() => openLead(m.lead_id)} data-testid={`ws-meeting-${m.id}`}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--surface-2)] transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[var(--text)] truncate">{m.lead_name}</div>
                  <div className="text-[11px] text-[var(--text-faint)]">{fmtDateTime(m.scheduled_at)}</div>
                </div>
                {m.booking_driver && <Badge className="text-[var(--text-muted)] border-[var(--border)]">{m.booking_driver}</Badge>}
              </button>
            ))}
        </Section>

        <Section testid="ws-pending" icon={CreditCard} title="Payment pending" count={data.payment_pending.length}>
          {data.payment_pending.length === 0 ? <Empty>No deals waiting on payment.</Empty> :
            data.payment_pending.map((l) => (
              <LeadRow key={l.id} lead={l} onOpen={openLead}
                right={l.amount ? <span className="text-[11px] font-semibold tabular-nums text-emerald-400 shrink-0">{money(l.amount, l.currency)}</span> : null} />
            ))}
        </Section>

        <Section testid="ws-attention" icon={AlertTriangle} title="Needs attention (going stale)" count={data.needs_attention.length}>
          {data.needs_attention.length === 0 ? <Empty>Nothing's gone stale. Nice work.</Empty> :
            data.needs_attention.map((l) => (
              <LeadRow key={l.id} lead={l} onOpen={openLead}
                right={<span className="text-[10px] font-mono text-rose-400 shrink-0">{timeAgo(l.last_activity || l.updated_at)}</span>} />
            ))}
        </Section>
      </div>

      {/* Recent conversations */}
      <Section testid="ws-conversations" icon={MessageSquare} title="Recent conversations" count={data.recent_conversations.length}>
        {data.recent_conversations.length === 0 ? <Empty>Log a note after your next call to start the feed.</Empty> :
          data.recent_conversations.map((n, i) => (
            <button key={n.id || i} onClick={() => openLead(n.lead_id)} data-testid={`ws-note-${i}`}
              className="w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-[var(--surface-2)] transition-colors">
              <MessageSquare className="w-3.5 h-3.5 text-[var(--text-faint)] mt-1 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-[var(--text)]">{n.text}</div>
                <div className="text-[11px] text-[var(--text-faint)] mt-0.5">
                  <span className="text-[var(--accent-text)] font-medium">{n.lead_name}</span> · {n.author} · {timeAgo(n.created_at)}
                </div>
              </div>
            </button>
          ))}
      </Section>
    </div>
  );
}
