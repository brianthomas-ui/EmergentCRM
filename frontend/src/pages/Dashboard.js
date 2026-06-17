import { useEffect, useState } from "react";
import client from "@/api";
import { useAuth } from "@/context/AuthContext";
import {
  KpiRow,
  TargetBar,
  StageFunnel,
  TodaysMeetings,
  PriorityQueues,
  BookingDrivers,
  AgentLeaderboard,
} from "@/components/dashboard/DashboardWidgets";

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    // mount-only: fetch dashboard once
    client.get("/dashboard").then((r) => setData(r.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data) return <div className="text-zinc-400 text-sm">Loading dashboard…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tighter text-zinc-900">
            {isAdmin ? "Team Control Room" : `Welcome, ${user?.name?.split(" ")[0]}`}
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            {isAdmin
              ? "Team performance, targets and conversion at a glance."
              : "Your meetings, follow-ups and pipeline for today."}
          </p>
        </div>
      </div>

      <KpiRow data={data} isAdmin={isAdmin} />
      <TargetBar data={data} isAdmin={isAdmin} />

      <div className="grid lg:grid-cols-2 gap-6">
        <StageFunnel counts={data.stage_counts} />
        <TodaysMeetings meetings={data.meetings_today_list} />
      </div>

      <PriorityQueues data={data} />
      <BookingDrivers drivers={data.booking_drivers} />

      {isAdmin && data.per_agent && <AgentLeaderboard agents={data.per_agent} />}
    </div>
  );
}
