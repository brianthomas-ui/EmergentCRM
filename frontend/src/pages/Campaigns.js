import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Download } from "lucide-react";
import client, { apiError } from "@/api";
import PeriodFilter, { DEFAULT_PERIOD, toParams } from "@/components/dark/PeriodFilter";
import { btnEmerald, btnGhost } from "@/components/dark/Primitives";
import {
  buildPerformanceData,
  buildChannelData,
  NewCampaignModal,
  CampaignKpis,
  PerformanceCharts,
  CampaignsTable,
  CampaignsSidebar,
} from "@/components/campaigns/CampaignsParts";

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(DEFAULT_PERIOD);
  const [showNew, setShowNew] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [notes, setNotes] = useState(
    "Campaign momentum is solid this quarter — Email remains our top channel at ~37% of total reach. LinkedIn sequences saw a 2.1x lift in meeting-to-close rate. Follow up on the 3 campaigns still in draft status before end of month."
  );
  const [editingNotes, setEditingNotes] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = toParams(period);
    client
      .get("/campaigns", { params })
      .then((r) => setCampaigns(r.data || []))
      .catch((e) => toast.error(apiError(e)))
      .finally(() => setLoading(false));
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const kpis = useMemo(() => {
    const active = campaigns.filter((c) => c.status === "sent" || c.status === "active").length;
    const totalLeads = campaigns.reduce((s, c) => s + (c.recipient_count || 0), 0);
    const totalMeetings = campaigns.reduce((s, c) => s + (c.booked_count || 0), 0);
    const totalSent = campaigns.reduce((s, c) => s + (c.sent_count || 0), 0);
    const conversion = totalSent > 0
      ? ((campaigns.reduce((s, c) => s + (c.booked_count || 0), 0) / totalSent) * 100).toFixed(1) + "%"
      : "—";
    return { active, totalLeads, totalMeetings, conversion };
  }, [campaigns]);

  const topCampaigns = useMemo(
    () => [...campaigns].sort((a, b) => (b.booked_count || 0) - (a.booked_count || 0)).slice(0, 5),
    [campaigns]
  );
  const perfData = useMemo(() => buildPerformanceData(campaigns), [campaigns]);
  const channelData = useMemo(() => buildChannelData(campaigns), [campaigns]);
  const filtered = useMemo(
    () => (filterStatus ? campaigns.filter((c) => c.status === filterStatus) : campaigns),
    [campaigns, filterStatus]
  );

  const send = async (id) => {
    try {
      await client.post(`/campaigns/${id}/send`);
      toast.success("Mail-merge sent via Gmail");
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <div className="space-y-5 text-[var(--text)]">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-[var(--text)]">Campaigns</h1>
          <p className="text-xs text-[var(--text-faint)] mt-0.5">Track outreach initiatives and lead sources</p>
        </div>
        <div className="flex items-center gap-2">
          <button className={btnGhost} onClick={() => {}}>
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
          <button className={btnEmerald} onClick={() => setShowNew(true)} data-testid="new-campaign-btn">
            <Plus className="w-3.5 h-3.5" />
            New Campaign
          </button>
        </div>
      </div>

      {/* KPI cards + PeriodFilter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>
      <CampaignKpis kpis={kpis} campaigns={campaigns} />

      {/* Charts row */}
      <PerformanceCharts perfData={perfData} channelData={channelData} />

      {/* Campaign table + sidebar */}
      <div className="grid lg:grid-cols-3 gap-4" data-tour="campaigns-table">
        <CampaignsTable
          loading={loading}
          filtered={filtered}
          campaigns={campaigns}
          filterStatus={filterStatus}
          setFilterStatus={setFilterStatus}
          onSend={send}
        />
        <CampaignsSidebar
          topCampaigns={topCampaigns}
          notes={notes}
          setNotes={setNotes}
          editingNotes={editingNotes}
          setEditingNotes={setEditingNotes}
        />
      </div>

      <NewCampaignModal open={showNew} onClose={() => setShowNew(false)} onCreated={load} />
    </div>
  );
}
