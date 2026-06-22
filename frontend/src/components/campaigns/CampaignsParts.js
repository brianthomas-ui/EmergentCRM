import { useState } from "react";
import { toast } from "sonner";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import { Send, Megaphone, Users, CalendarCheck, TrendingUp, StickyNote } from "lucide-react";
import client, { apiError } from "@/api";
import { fmtDate } from "@/components/helpers";
import {
  Card,
  Table, THead, TH, TR, TD,
  Select,
  btnEmerald,
  btnGhost,
  darkInput,
} from "@/components/dark/Primitives";

const CHANNEL_COLORS = ["#10b981", "#38bdf8", "#a78bfa", "#f59e0b", "#f43f5e", "#64748b"];
const CHANNEL_LABELS = ["Email", "In-App", "LinkedIn", "Referral", "Paid Ads", "Other"];

// Stable chart-config objects hoisted out of render (recharts re-render avoidance).
const LINE_MARGIN = { top: 4, right: 8, left: -20, bottom: 0 };
const AXIS_TICK = { fontSize: 10, fill: "var(--text-faint)" };

// Build deterministic demo chart data from real campaigns.
export function buildPerformanceData(campaigns) {
  if (!campaigns.length) {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
    return months.map((m, i) => ({
      name: m,
      leads: 40 + i * 18 + Math.round(Math.sin(i) * 12),
      meetings: 12 + i * 5 + Math.round(Math.cos(i) * 4),
      conversions: 3 + i * 2,
    }));
  }
  return [...campaigns]
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .map((c) => ({
      name: c.name.length > 14 ? c.name.slice(0, 13) + "…" : c.name,
      leads: c.recipient_count || 0,
      meetings: c.booked_count || 0,
      conversions: Math.round((c.booked_count || 0) * 0.45),
    }));
}

export function buildChannelData(campaigns) {
  if (!campaigns.length) {
    return CHANNEL_LABELS.map((name, i) => ({ name, value: [452, 186, 138, 94, 79, 73][i] }));
  }
  const total = campaigns.reduce((s, c) => s + (c.recipient_count || 0), 0) || 1;
  return CHANNEL_LABELS.map((name, i) => ({
    name,
    value: Math.round(total * [0.37, 0.16, 0.12, 0.10, 0.08, 0.07][i]),
  }));
}

function KpiCard({ icon: Icon, label, value, sub, tone = "emerald" }) {
  const tones = {
    emerald: "text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
    sky: "text-sky-300 bg-sky-500/10 border-sky-500/20",
    violet: "text-violet-300 bg-violet-500/10 border-violet-500/20",
    amber: "text-amber-300 bg-amber-500/10 border-amber-500/20",
  };
  return (
    <Card className="p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-mono uppercase tracking-[0.12em] text-[var(--text-faint)]">{label}</span>
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center border ${tones[tone]}`}>
          <Icon className="w-3.5 h-3.5" />
        </span>
      </div>
      <div className="text-3xl font-semibold tracking-tight text-[var(--text)] tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-[var(--text-faint)]">{sub}</div>}
    </Card>
  );
}

function CampaignStatusBadge({ status }) {
  const map = {
    draft: "text-slate-300 border-slate-600/40 bg-slate-600/10",
    sent: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10",
    paused: "text-amber-300 border-amber-500/30 bg-amber-500/10",
    active: "text-sky-300 border-sky-500/30 bg-sky-500/10",
  };
  const cls = map[(status || "draft").toLowerCase()] || map.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap ${cls}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {status || "draft"}
    </span>
  );
}

function DonutTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs shadow-xl">
      <div className="font-medium text-[var(--text)]">{name}</div>
      <div className="text-emerald-300 tabular-nums font-mono">{value.toLocaleString()} leads</div>
    </div>
  );
}

function LineTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs shadow-xl min-w-[120px]">
      <div className="font-mono font-semibold text-[var(--text)] mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4">
          <span style={{ color: p.color }} className="font-medium capitalize">{p.dataKey}</span>
          <span className="text-[var(--text)] tabular-nums font-mono">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

const EMPTY_FORM = {
  name: "",
  segment_label: "High spend power users",
  min_spend: 100,
  template_subject: "Ready to scale beyond your current plan?",
  template_body:
    "Hi {{name}},\n\nWe noticed your team is getting great value from {{plan}}. Let's chat about unlocking higher limits and priority support.\n\nBook 20 minutes here: [Calendly link]\n\nBest,\nEmergent Labs",
};

export function NewCampaignModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name.trim()) { toast.error("Campaign name is required"); return; }
    setBusy(true);
    try {
      await client.post("/campaigns", { ...form, min_spend: Number(form.min_spend) });
      toast.success("Campaign created");
      setForm(EMPTY_FORM);
      onCreated?.();
      onClose();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <Card className="relative w-full max-w-lg p-6 flex flex-col gap-4 animate-fadeIn">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold text-[var(--text)] tracking-tight">New Campaign</h2>
          <button onClick={onClose} className="text-[var(--text-faint)] hover:text-[var(--text)] transition-colors text-lg leading-none">✕</button>
        </div>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-mono uppercase tracking-wider text-[var(--text-faint)]">Campaign Name</span>
            <input className={darkInput} value={form.name} placeholder="Q3 Power User Outreach"
              onChange={(e) => set("name", e.target.value)} data-testid="campaign-name" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-mono uppercase tracking-wider text-[var(--text-faint)]">Segment Label</span>
              <input className={darkInput} value={form.segment_label}
                onChange={(e) => set("segment_label", e.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-mono uppercase tracking-wider text-[var(--text-faint)]">Min Spend ($)</span>
              <input type="number" className={darkInput} value={form.min_spend}
                onChange={(e) => set("min_spend", e.target.value)} data-testid="campaign-minspend" />
            </label>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-mono uppercase tracking-wider text-[var(--text-faint)]">Email Subject</span>
            <input className={darkInput} value={form.template_subject}
              onChange={(e) => set("template_subject", e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-mono uppercase tracking-wider text-[var(--text-faint)]">Email Body</span>
            <textarea className={`${darkInput} min-h-[100px] font-mono text-xs resize-none`}
              value={form.template_body} onChange={(e) => set("template_body", e.target.value)} />
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button className={btnGhost} onClick={onClose}>Cancel</button>
          <button className={btnEmerald} onClick={submit} disabled={busy} data-testid="save-campaign-btn">
            {busy ? "Creating…" : "Create Campaign"}
          </button>
        </div>
      </Card>
    </div>
  );
}

export function CampaignKpis({ kpis, campaigns }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard icon={Megaphone} label="Active Campaigns" value={kpis.active}
        sub={`${campaigns.length} total · ${campaigns.filter((c) => c.status === "draft").length} draft`} tone="emerald" />
      <KpiCard icon={Users} label="Leads Generated" value={kpis.totalLeads.toLocaleString()}
        sub="Total recipients across campaigns" tone="sky" />
      <KpiCard icon={CalendarCheck} label="Meetings Booked" value={kpis.totalMeetings.toLocaleString()}
        sub="From campaign-linked bookings" tone="violet" />
      <KpiCard icon={TrendingUp} label="Conversion" value={kpis.conversion}
        sub="Booked / sent across all campaigns" tone="amber" />
    </div>
  );
}

export function PerformanceCharts({ perfData, channelData }) {
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-2 p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-semibold text-[var(--text)]">Campaign Performance</h2>
          <div className="flex items-center gap-3 text-[11px] text-[var(--text-faint)]">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />Leads</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-sky-400 inline-block" />Meetings</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-violet-400 inline-block" />Conversions</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={perfData} margin={LINE_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} />
            <RTooltip content={<LineTooltip />} />
            <Line type="monotone" dataKey="leads" stroke="#10b981" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="meetings" stroke="#38bdf8" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="conversions" stroke="#a78bfa" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Card className="p-4 flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-[var(--text)]">Leads by Channel</h2>
        <div className="flex-1 flex flex-col items-center">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={channelData} cx="50%" cy="45%" innerRadius={55} outerRadius={80} paddingAngle={2} dataKey="value" stroke="none">
                {channelData.map((d, i) => (
                  <Cell key={d.name} fill={CHANNEL_COLORS[i % CHANNEL_COLORS.length]} />
                ))}
              </Pie>
              <RTooltip content={<DonutTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 w-full mt-1">
            {channelData.map((d, i) => (
              <div key={d.name} className="flex items-center gap-1.5 text-[11px]">
                <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: CHANNEL_COLORS[i % CHANNEL_COLORS.length] }} />
                <span className="text-[var(--text-faint)] truncate">{d.name}</span>
                <span className="text-[var(--text)] font-mono tabular-nums ml-auto">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

function CampaignRow({ c, onSend }) {
  return (
    <TR data-testid={`campaign-row-${c.id}`}>
      <TD>
        <div className="font-medium text-[var(--text)] text-sm leading-tight">{c.name}</div>
        <div className="text-[11px] text-[var(--text-faint)] mt-0.5">{fmtDate(c.created_at)}</div>
      </TD>
      <TD>
        <div className="text-[11px] text-[var(--text-muted)] max-w-[140px] truncate">{c.segment_label}</div>
        <div className="text-[10px] text-[var(--text-faint)] mt-0.5">spend ≥ ${c.min_spend}</div>
      </TD>
      <TD align="right"><span className="font-mono tabular-nums text-[var(--text)]">{(c.sent_count || 0).toLocaleString()}</span></TD>
      <TD align="right">
        <span className="font-mono tabular-nums text-sky-300">{(c.opened_count || 0).toLocaleString()}</span>
        {c.sent_count > 0 && (
          <span className="text-[10px] text-[var(--text-faint)] ml-1">({Math.round((c.opened_count / c.sent_count) * 100)}%)</span>
        )}
      </TD>
      <TD align="right"><span className="font-mono tabular-nums text-violet-300">{(c.replied_count || 0).toLocaleString()}</span></TD>
      <TD align="right"><span className="font-mono tabular-nums text-emerald-300">{(c.booked_count || 0).toLocaleString()}</span></TD>
      <TD><CampaignStatusBadge status={c.status} /></TD>
      <TD>
        {c.status !== "sent" ? (
          <button
            onClick={() => onSend(c.id)}
            data-testid={`send-campaign-${c.id}`}
            className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap"
          >
            <Send className="w-3 h-3" />
            Send
          </button>
        ) : (
          <span className="text-[11px] text-[var(--text-faint)]">{c.recipient_count} rcpt</span>
        )}
      </TD>
    </TR>
  );
}

export function CampaignsTable({ loading, filtered, campaigns, filterStatus, setFilterStatus, onSend }) {
  return (
    <Card className="lg:col-span-2 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <h2 className="text-sm font-semibold text-[var(--text)]">All Campaigns</h2>
        <div className="flex items-center gap-2">
          <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="text-[11px] py-1 h-7 w-36">
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
          </Select>
          <span className="text-[11px] text-[var(--text-faint)]">
            {filtered.length} campaign{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
      <Table>
        <THead>
          <TH>Campaign</TH>
          <TH>Segment</TH>
          <TH align="right">Sent</TH>
          <TH align="right">Opened</TH>
          <TH align="right">Replied</TH>
          <TH align="right">Booked</TH>
          <TH>Status</TH>
          <TH>Action</TH>
        </THead>
        <tbody>
          {loading && (
            <TR>
              <TD className="text-[var(--text-faint)] py-8 text-center" align="center">
                <span className="text-xs">Loading…</span>
              </TD>
            </TR>
          )}
          {!loading && filtered.length === 0 && (
            <TR>
              <TD align="center" className="py-10 text-[var(--text-faint)] text-xs">
                No campaigns yet - create your first segment above.
              </TD>
            </TR>
          )}
          {!loading && filtered.map((c) => (
            <CampaignRow key={c.id} c={c} onSend={onSend} />
          ))}
        </tbody>
      </Table>
      {!loading && filtered.length > 0 && (
        <div className="px-4 py-2.5 border-t border-[var(--border)] text-[11px] text-[var(--text-faint)]">
          Showing {filtered.length} of {campaigns.length} campaigns
        </div>
      )}
    </Card>
  );
}

function TopPerforming({ topCampaigns }) {
  return (
    <Card className="p-4 flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-[var(--text)]">Top Performing Campaigns</h2>
      <div className="flex flex-col gap-2">
        {topCampaigns.length === 0 && <p className="text-xs text-[var(--text-faint)]">No data yet.</p>}
        {topCampaigns.map((c, i) => {
          const convRate = c.sent_count > 0 ? ((c.booked_count / c.sent_count) * 100).toFixed(1) : "0.0";
          const barPct = topCampaigns[0]?.booked_count > 0
            ? Math.round(((c.booked_count || 0) / topCampaigns[0].booked_count) * 100) : 0;
          return (
            <div key={c.id} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-mono text-[var(--text-faint)] w-4 shrink-0">#{i + 1}</span>
                  <span className="text-[12px] text-[var(--text)] truncate">{c.name}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] font-mono text-emerald-300 tabular-nums">{c.booked_count || 0}</span>
                  <span className="text-[10px] text-[var(--text-faint)]">{convRate}%</span>
                </div>
              </div>
              <div className="h-1 w-full rounded-full bg-[var(--surface-3)]">
                <div className="h-1 rounded-full bg-emerald-500/70 transition-all" style={{ width: `${barPct}%` }} />
              </div>
            </div>
          );
        })}
        {topCampaigns.length === 0 &&
          ["Email Re-engagement", "LinkedIn Outreach", "Product Demo Invite", "Annual Renewal", "Upsell Top Users"].map((name, i) => (
            <div key={name} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-mono text-[var(--text-faint)] w-4">#{i + 1}</span>
                  <span className="text-[12px] text-[var(--text)] truncate">{name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-emerald-300">{[47, 38, 31, 22, 18][i]}</span>
                  <span className="text-[10px] text-[var(--text-faint)]">{["9.1%", "7.4%", "6.2%", "5.8%", "4.3%"][i]}</span>
                </div>
              </div>
              <div className="h-1 w-full rounded-full bg-[var(--surface-3)]">
                <div className="h-1 rounded-full bg-emerald-500/70" style={{ width: `${[100, 81, 66, 47, 38][i]}%` }} />
              </div>
            </div>
          ))}
      </div>
    </Card>
  );
}

function NotesCard({ notes, setNotes, editingNotes, setEditingNotes }) {
  return (
    <Card className="p-4 flex flex-col gap-2 flex-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <StickyNote className="w-3.5 h-3.5 text-amber-300" />
          <h2 className="text-sm font-semibold text-[var(--text)]">Notes</h2>
        </div>
        <button onClick={() => setEditingNotes((v) => !v)} className="text-[11px] text-[var(--text-faint)] hover:text-[var(--text)] transition-colors">
          {editingNotes ? "Save" : "Edit"}
        </button>
      </div>
      {editingNotes ? (
        <textarea className={`${darkInput} text-xs resize-none min-h-[120px]`} value={notes} onChange={(e) => setNotes(e.target.value)} />
      ) : (
        <p className="text-xs text-[var(--text-muted)] leading-relaxed">{notes}</p>
      )}
    </Card>
  );
}

export function CampaignsSidebar({ topCampaigns, notes, setNotes, editingNotes, setEditingNotes }) {
  return (
    <div className="flex flex-col gap-4">
      <TopPerforming topCampaigns={topCampaigns} />
      <NotesCard notes={notes} setNotes={setNotes} editingNotes={editingNotes} setEditingNotes={setEditingNotes} />
    </div>
  );
}
