import { Link } from "react-router-dom";
import { money, Badge, fmtDateTime } from "@/components/helpers";
import {
  TrendingUp,
  CalendarCheck,
  UserX,
  DollarSign,
  Flame,
  CreditCard,
  Target,
  Trophy,
} from "lucide-react";

export function Stat({ label, value, sub, icon: Icon, accent = "text-zinc-900", testid }) {
  return (
    <div
      data-testid={testid}
      className="bg-white border border-zinc-200 rounded-lg p-5 flex flex-col gap-2 animate-fade-up"
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">{label}</span>
        <Icon className="w-4 h-4 text-zinc-300" />
      </div>
      <div className={`font-heading text-3xl font-bold tracking-tighter ${accent}`}>{value}</div>
      {sub && <div className="text-xs text-zinc-400">{sub}</div>}
    </div>
  );
}

export function KpiRow({ data, isAdmin }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Stat
        testid="stat-revenue"
        label="Revenue Closed"
        value={money(data.revenue_won)}
        sub={isAdmin ? `Team target ${money(data.team_target)}` : `Target ${money(data.target)}`}
        icon={DollarSign}
        accent="text-emerald-600"
      />
      <Stat
        testid="stat-pipeline-value"
        label="Open Pipeline $"
        value={money(data.pipeline_value)}
        sub={`${data.won_count} won deals`}
        icon={TrendingUp}
      />
      <Stat
        testid="stat-meetings-today"
        label="Meetings Today"
        value={data.meetings_today}
        sub={`${data.completed_today} completed`}
        icon={CalendarCheck}
      />
      <Stat
        testid="stat-noshows"
        label="No-shows Today"
        value={data.noshow_today}
        sub={`${data.payment_pending} payment pending`}
        icon={UserX}
        accent={data.noshow_today > 0 ? "text-red-600" : "text-zinc-900"}
      />
    </div>
  );
}

export function TargetBar({ data, isAdmin }) {
  const targetPct = data.target ? Math.min(100, Math.round((data.revenue_won / data.target) * 100)) : 0;
  const teamPct = data.team_target ? Math.min(100, Math.round((data.revenue_won / data.team_target) * 100)) : 0;
  const pct = isAdmin ? teamPct : targetPct;
  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-zinc-400" />
          <span className="text-sm font-semibold text-zinc-900">
            {isAdmin ? "Team Revenue Target" : "Your Monthly Target"}
          </span>
        </div>
        <span className="text-sm font-mono font-semibold text-zinc-900">
          {money(data.revenue_won)} / {money(isAdmin ? data.team_target : data.target)}
        </span>
      </div>
      <div className="bg-zinc-100 rounded-md h-3 overflow-hidden">
        <div data-testid="target-progress" className="h-full bg-zinc-950 rounded-md transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="text-xs text-zinc-400 mt-1.5">{pct}% achieved</div>
    </div>
  );
}

export function StageFunnel({ counts }) {
  const order = ["New Booking", "Assigned", "Meeting Scheduled", "Meeting Completed", "Payment Link Sent", "Won"];
  const max = Math.max(1, ...order.map((s) => counts[s] || 0));
  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-5">
      <h3 className="font-heading text-base font-bold tracking-tight text-zinc-900 mb-4">Pipeline Funnel</h3>
      <div className="space-y-2.5">
        {order.map((s) => (
          <div key={s} className="flex items-center gap-3">
            <div className="w-32 text-xs font-medium text-zinc-600 shrink-0">{s}</div>
            <div className="flex-1 bg-zinc-100 rounded-lg h-6 overflow-hidden">
              <div className="h-full bg-zinc-900 rounded-lg transition-all" style={{ width: `${((counts[s] || 0) / max) * 100}%` }} />
            </div>
            <div className="w-8 text-right text-sm font-semibold text-zinc-900 font-mono">{counts[s] || 0}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TodaysMeetings({ meetings }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-5">
      <h3 className="font-heading text-base font-bold tracking-tight text-zinc-900 mb-4">My Meetings Today</h3>
      {meetings.length === 0 ? (
        <div className="text-sm text-zinc-400 py-8 text-center">No meetings scheduled today.</div>
      ) : (
        <div className="space-y-2">
          {meetings.map((m) => (
            <Link
              to={`/leads/${m.lead_id}`}
              key={m.id}
              data-testid={`today-meeting-${m.id}`}
              className="flex items-center justify-between p-3 border border-zinc-200 rounded-lg hover:border-zinc-400 transition-colors"
            >
              <div>
                <div className="text-sm font-semibold text-zinc-900">{m.lead_name}</div>
                <div className="text-xs text-zinc-400">{m.agent_name} · {m.source}</div>
              </div>
              <div className="text-xs font-mono text-zinc-600">{fmtDateTime(m.scheduled_at)}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function QueueCard({ icon: Icon, iconClass, value, label }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-5 flex items-center gap-4">
      <Icon className={`w-8 h-8 ${iconClass}`} />
      <div>
        <div className="font-heading text-2xl font-bold text-zinc-900">{value}</div>
        <div className="text-xs text-zinc-400 uppercase tracking-widest font-semibold">{label}</div>
      </div>
    </div>
  );
}

export function PriorityQueues({ data }) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <QueueCard icon={Flame} iconClass="text-red-500" value={data.hot} label="Hot Leads" />
      <QueueCard icon={CalendarCheck} iconClass="text-amber-500" value={data.follow_up} label="Follow-up" />
      <QueueCard icon={CreditCard} iconClass="text-blue-500" value={data.payment_pending} label="Payment Pending" />
    </div>
  );
}

export function BookingDrivers({ drivers }) {
  const max = Math.max(1, ...drivers.map((d) => d.meetings));
  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-5">
      <h3 className="font-heading text-base font-bold tracking-tight text-zinc-900 mb-1">What's Driving Bookings</h3>
      <p className="text-xs text-zinc-400 mb-4">Which hooks get leads to book a meeting, and how they convert.</p>
      {drivers.length === 0 ? (
        <div className="text-sm text-zinc-400 py-6 text-center">No meetings booked yet.</div>
      ) : (
        <div className="space-y-2.5">
          {drivers.map((d) => (
            <div key={d.driver} data-testid={`driver-row-${d.driver}`} className="flex items-center gap-3">
              <div className="w-40 text-sm font-medium text-zinc-700 shrink-0 truncate">{d.driver}</div>
              <div className="flex-1 bg-zinc-100 rounded-md h-6 overflow-hidden">
                <div
                  className="h-full bg-zinc-950 rounded-md flex items-center justify-end pr-2 transition-all"
                  style={{ width: `${(d.meetings / max) * 100}%` }}
                >
                  <span className="text-[10px] font-semibold text-white">{d.meetings}</span>
                </div>
              </div>
              <div className="w-32 text-right text-xs text-zinc-500 font-mono">{d.completed} done · {d.won} won</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AgentLeaderboard({ agents }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 p-5 border-b border-zinc-200">
        <Trophy className="w-4 h-4 text-amber-500" />
        <h3 className="font-heading text-base font-bold tracking-tight text-zinc-900">Agent Leaderboard</h3>
      </div>
      <table className="w-full">
        <thead>
          <tr className="bg-zinc-50 border-b border-zinc-200">
            {["Agent", "Leads", "Meetings", "Won", "Revenue", "Target %"].map((h) => (
              <th key={h} className="text-xs font-semibold text-zinc-500 uppercase tracking-widest text-left p-3">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {agents.map((a) => {
            const pct = a.target ? Math.round((a.revenue / a.target) * 100) : 0;
            return (
              <tr key={a.id} data-testid={`agent-row-${a.id}`} className="border-b border-zinc-100">
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <img src={a.avatar_url} alt="" className="w-7 h-7 rounded-lg object-cover border border-zinc-200 bg-zinc-100" />
                    <span className="text-sm font-semibold text-zinc-900">{a.name}</span>
                  </div>
                </td>
                <td className="p-3 text-sm text-zinc-700 font-mono">{a.leads}</td>
                <td className="p-3 text-sm text-zinc-700 font-mono">{a.meetings}</td>
                <td className="p-3 text-sm text-zinc-700 font-mono">{a.won}</td>
                <td className="p-3 text-sm font-semibold text-emerald-600 font-mono">{money(a.revenue)}</td>
                <td className="p-3">
                  <Badge className={pct >= 100 ? "text-emerald-600 border-emerald-200" : "text-zinc-500 border-zinc-200"}>{pct}%</Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
