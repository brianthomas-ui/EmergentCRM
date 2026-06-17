import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import client from "@/api";
import { useAuth } from "@/context/AuthContext";
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

function Stat({ label, value, sub, icon: Icon, accent = "text-slate-900", testid }) {
  return (
    <div
      data-testid={testid}
      className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-2 animate-fade-up"
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
          {label}
        </span>
        <Icon className="w-4 h-4 text-slate-300" />
      </div>
      <div className={`font-heading text-3xl font-bold tracking-tighter ${accent}`}>{value}</div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

function StageFunnel({ counts }) {
  const order = [
    "New Booking",
    "Assigned",
    "Meeting Scheduled",
    "Meeting Completed",
    "Payment Link Sent",
    "Won",
  ];
  const max = Math.max(1, ...order.map((s) => counts[s] || 0));
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <h3 className="font-heading text-base font-bold tracking-tight text-slate-900 mb-4">
        Pipeline Funnel
      </h3>
      <div className="space-y-2.5">
        {order.map((s) => (
          <div key={s} className="flex items-center gap-3">
            <div className="w-32 text-xs font-medium text-slate-600 shrink-0">{s}</div>
            <div className="flex-1 bg-slate-100 rounded-xl h-6 overflow-hidden">
              <div
                className="h-full bg-slate-900 rounded-xl transition-all"
                style={{ width: `${((counts[s] || 0) / max) * 100}%` }}
              />
            </div>
            <div className="w-8 text-right text-sm font-semibold text-slate-900 font-mono">
              {counts[s] || 0}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    // mount-only: fetch dashboard once
    client.get("/dashboard").then((r) => setData(r.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data) return <div className="text-slate-400 text-sm">Loading dashboard…</div>;

  const targetPct = data.target ? Math.min(100, Math.round((data.revenue_won / data.target) * 100)) : 0;
  const teamPct = data.team_target
    ? Math.min(100, Math.round((data.revenue_won / data.team_target) * 100))
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tighter text-slate-900">
            {isAdmin ? "Team Control Room" : `Welcome, ${user?.name?.split(" ")[0]}`}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isAdmin
              ? "Team performance, targets and conversion at a glance."
              : "Your meetings, follow-ups and pipeline for today."}
          </p>
        </div>
      </div>

      {/* KPI row */}
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
          accent={data.noshow_today > 0 ? "text-red-600" : "text-slate-900"}
        />
      </div>

      {/* Target bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-semibold text-slate-900">
              {isAdmin ? "Team Revenue Target" : "Your Monthly Target"}
            </span>
          </div>
          <span className="text-sm font-mono font-semibold text-slate-900">
            {money(data.revenue_won)} / {money(isAdmin ? data.team_target : data.target)}
          </span>
        </div>
        <div className="bg-slate-100 rounded-xl h-3 overflow-hidden">
          <div
            data-testid="target-progress"
            className="h-full bg-blue-600 rounded-xl transition-all"
            style={{ width: `${isAdmin ? teamPct : targetPct}%` }}
          />
        </div>
        <div className="text-xs text-slate-400 mt-1.5">
          {isAdmin ? teamPct : targetPct}% achieved
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <StageFunnel counts={data.stage_counts} />

        {/* Today's meetings */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="font-heading text-base font-bold tracking-tight text-slate-900 mb-4">
            My Meetings Today
          </h3>
          {data.meetings_today_list.length === 0 ? (
            <div className="text-sm text-slate-400 py-8 text-center">No meetings scheduled today.</div>
          ) : (
            <div className="space-y-2">
              {data.meetings_today_list.map((m) => (
                <Link
                  to={`/leads/${m.lead_id}`}
                  key={m.id}
                  data-testid={`today-meeting-${m.id}`}
                  className="flex items-center justify-between p-3 border border-slate-200 rounded-xl hover:border-slate-400 transition-colors"
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{m.lead_name}</div>
                    <div className="text-xs text-slate-400">
                      {m.agent_name} · {m.source}
                    </div>
                  </div>
                  <div className="text-xs font-mono text-slate-600">{fmtDateTime(m.scheduled_at)}</div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Priority queues */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center gap-4">
          <Flame className="w-8 h-8 text-red-500" />
          <div>
            <div className="font-heading text-2xl font-bold text-slate-900">{data.hot}</div>
            <div className="text-xs text-slate-400 uppercase tracking-widest font-semibold">Hot Leads</div>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center gap-4">
          <CalendarCheck className="w-8 h-8 text-amber-500" />
          <div>
            <div className="font-heading text-2xl font-bold text-slate-900">{data.follow_up}</div>
            <div className="text-xs text-slate-400 uppercase tracking-widest font-semibold">
              Follow-up
            </div>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center gap-4">
          <CreditCard className="w-8 h-8 text-blue-500" />
          <div>
            <div className="font-heading text-2xl font-bold text-slate-900">
              {data.payment_pending}
            </div>
            <div className="text-xs text-slate-400 uppercase tracking-widest font-semibold">
              Payment Pending
            </div>
          </div>
        </div>
      </div>

      {/* Booking drivers — what gets leads to book */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h3 className="font-heading text-base font-bold tracking-tight text-slate-900 mb-1">What's Driving Bookings</h3>
        <p className="text-xs text-slate-400 mb-4">Which hooks get leads to book a meeting — and how they convert.</p>
        {data.booking_drivers.length === 0 ? (
          <div className="text-sm text-slate-400 py-6 text-center">No meetings booked yet.</div>
        ) : (
          <div className="space-y-2.5">
            {(() => {
              const max = Math.max(1, ...data.booking_drivers.map((d) => d.meetings));
              return data.booking_drivers.map((d) => (
                <div key={d.driver} data-testid={`driver-row-${d.driver}`} className="flex items-center gap-3">
                  <div className="w-40 text-sm font-medium text-slate-700 shrink-0 truncate">{d.driver}</div>
                  <div className="flex-1 bg-slate-100 rounded-full h-6 overflow-hidden">
                    <div
                      className="h-full bg-gradient-brand rounded-full flex items-center justify-end pr-2 transition-all"
                      style={{ width: `${(d.meetings / max) * 100}%` }}
                    >
                      <span className="text-[10px] font-semibold text-white">{d.meetings}</span>
                    </div>
                  </div>
                  <div className="w-32 text-right text-xs text-slate-500 font-mono">{d.completed} done · {d.won} won</div>
                </div>
              ));
            })()}
          </div>
        )}
      </div>

      {/* Per-agent leaderboard (admin) */}
      {isAdmin && data.per_agent && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 p-5 border-b border-slate-200">
            <Trophy className="w-4 h-4 text-amber-500" />
            <h3 className="font-heading text-base font-bold tracking-tight text-slate-900">
              Agent Leaderboard
            </h3>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {["Agent", "Leads", "Meetings", "Won", "Revenue", "Target %"].map((h) => (
                  <th
                    key={h}
                    className="text-xs font-semibold text-slate-500 uppercase tracking-widest text-left p-3"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.per_agent.map((a) => {
                const pct = a.target ? Math.round((a.revenue / a.target) * 100) : 0;
                return (
                  <tr key={a.id} data-testid={`agent-row-${a.id}`} className="border-b border-slate-100">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <img
                          src={a.avatar_url}
                          alt=""
                          className="w-7 h-7 rounded-xl object-cover border border-slate-200 bg-slate-100"
                        />
                        <span className="text-sm font-semibold text-slate-900">{a.name}</span>
                      </div>
                    </td>
                    <td className="p-3 text-sm text-slate-700 font-mono">{a.leads}</td>
                    <td className="p-3 text-sm text-slate-700 font-mono">{a.meetings}</td>
                    <td className="p-3 text-sm text-slate-700 font-mono">{a.won}</td>
                    <td className="p-3 text-sm font-semibold text-emerald-600 font-mono">
                      {money(a.revenue)}
                    </td>
                    <td className="p-3">
                      <Badge
                        className={
                          pct >= 100
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-slate-50 text-slate-600 border-slate-200"
                        }
                      >
                        {pct}%
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
