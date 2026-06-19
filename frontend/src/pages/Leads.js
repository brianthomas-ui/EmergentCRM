import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Upload, Search, Users, ChevronRight, CalendarCheck } from "lucide-react";
import client, { apiError } from "@/api";
import { useAuth } from "@/context/AuthContext";
import {
  fmtDate,
  timeAgo,
  statusToneClass,
  VISIBLE_STATUSES,
  PRODUCT_LINES,
  REGIONS,
  PRIORITIES,
} from "@/components/helpers";
import {
  Card,
  Table,
  THead,
  TH,
  TR,
  TD,
  StatusBadge,
  Select,
  darkInput,
  btnEmerald,
  btnGhost,
} from "@/components/dark/Primitives";
import PeriodFilter, { DEFAULT_PERIOD, toParams } from "@/components/dark/PeriodFilter";
import Avatar from "@/components/dark/Avatar";
import NewLeadModal from "@/components/dark/NewLeadModal";

// ---------------------------------------------------------------------------
// Dark KPI card
// ---------------------------------------------------------------------------
function KpiCard({ label, value, sub, accent = false }) {
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

// ---------------------------------------------------------------------------
// Source badge — plain pill
// ---------------------------------------------------------------------------
function SourceTag({ source }) {
  if (!source) return <span className="text-[var(--text-faint)]">—</span>;
  return (
    <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-medium bg-[var(--surface-3)] text-[var(--text-muted)] border border-[var(--border)]">
      {source}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Today's Meetings side widget
// ---------------------------------------------------------------------------
function TodaysMeetings({ meetings }) {
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

// ---------------------------------------------------------------------------
// Recent Notes side widget
// ---------------------------------------------------------------------------
function RecentNotes({ notes }) {
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

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function Leads() {
  const { isAdmin, user } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef();

  const [leads, setLeads] = useState([]);
  const [meta, setMeta] = useState(null);
  const [team, setTeam] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [recentNotes, setRecentNotes] = useState([]);
  const [loading, setLoading] = useState(true);

  // filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [productFilter, setProductFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [period, setPeriod] = useState(DEFAULT_PERIOD);

  // modal
  const [newOpen, setNewOpen] = useState(false);

  const statuses = meta?.statuses || VISIBLE_STATUSES;
  const products = meta?.product_lines || PRODUCT_LINES;

  const load = useCallback(() => {
    setLoading(true);
    const params = { ...toParams(period) };
    if (search) params.search = search;
    if (statusFilter) params.status = statusFilter;
    if (productFilter) params.product_line = productFilter;
    client
      .get("/leads", { params })
      .then((r) => setLeads(r.data || []))
      .catch((e) => toast.error(apiError(e)))
      .finally(() => setLoading(false));
  }, [search, statusFilter, productFilter, period]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    client.get("/meta").then((r) => setMeta(r.data)).catch(() => {});
    if (isAdmin) {
      client.get("/team").then((r) => setTeam(r.data || [])).catch(() => {});
    }
    // Meetings for sidebar (no period filter — just upcoming)
    client.get("/meetings").then((r) => setMeetings(r.data || [])).catch(() => {});
    // Recent notes across leads (best-effort endpoint)
    client.get("/leads/notes/recent").then((r) => setRecentNotes(r.data || [])).catch(() => {});
  }, [isAdmin]);

  // KPI derivations
  const kpis = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now - 7 * 86400e3);
    const total = leads.length;
    const newThisWeek = leads.filter((l) => l.created_at && new Date(l.created_at) >= weekAgo).length;
    const qualified = leads.filter((l) =>
      ["Interested", "Payment Link Sent"].includes(l.status)
    ).length;
    const followupsDue = leads.filter((l) =>
      l.next_followup_at && new Date(l.next_followup_at) <= now
    ).length;
    return { total, newThisWeek, qualified, followupsDue };
  }, [leads]);

  // Client-side source filter
  const filtered = useMemo(() => {
    if (!sourceFilter) return leads;
    return leads.filter((l) => (l.source || "").toLowerCase() === sourceFilter.toLowerCase());
  }, [leads, sourceFilter]);

  // Unique sources for filter dropdown
  const sources = useMemo(
    () => [...new Set(leads.map((l) => l.source).filter(Boolean))].sort(),
    [leads]
  );

  const importCsv = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data } = await client.post("/leads/import", fd);
      toast.success(`Imported ${data.created} leads (${data.skipped} skipped)`);
      load();
    } catch (err) {
      toast.error(apiError(err));
    }
    e.target.value = "";
  };

  return (
    <div className="flex flex-col gap-5 min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-[var(--text)]">
            Leads
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Manage and qualify inbound prospects
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                hidden
                onChange={importCsv}
                data-testid="csv-input"
              />
              <button
                onClick={() => fileRef.current.click()}
                className={btnGhost}
                data-testid="import-csv-btn"
              >
                <Upload className="w-4 h-4" /> Import CSV
              </button>
            </>
          )}
          <button
            onClick={() => setNewOpen(true)}
            className={btnEmerald}
            data-testid="new-lead-btn"
          >
            <Plus className="w-4 h-4" /> New Lead
          </button>
        </div>
      </div>

      {/* KPI row + period filter */}
      <div className="space-y-3">
        <PeriodFilter value={period} onChange={setPeriod} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label="Total Leads" value={kpis.total} sub="in selected period" />
          <KpiCard
            label="New This Week"
            value={kpis.newThisWeek}
            sub={`+${kpis.newThisWeek} this week`}
            accent
          />
          <KpiCard
            label="Qualified"
            value={kpis.qualified}
            sub={`${leads.length ? Math.round((kpis.qualified / leads.length) * 100) : 0}% of total`}
          />
          <KpiCard label="Follow-ups Due" value={kpis.followupsDue} sub="overdue today" />
        </div>
      </div>

      {/* Two-column layout: table + sidebar */}
      <div className="flex gap-5 min-h-0 flex-1">
        {/* Table column */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          {/* Filter bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-faint)]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email, company…"
                className={`${darkInput} pl-9`}
                data-testid="lead-search"
              />
            </div>
            <div className="w-44">
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                data-testid="filter-status"
              >
                <option value="">All Statuses</option>
                {statuses.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
            </div>
            <div className="w-44">
              <Select
                value={productFilter}
                onChange={(e) => setProductFilter(e.target.value)}
                data-testid="filter-product"
              >
                <option value="">All Products</option>
                {products.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </Select>
            </div>
            {sources.length > 0 && (
              <div className="w-40">
                <Select
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value)}
                  data-testid="filter-source"
                >
                  <option value="">All Sources</option>
                  {sources.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </Select>
              </div>
            )}
          </div>

          {/* Dense table */}
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
                  <TR
                    key={l.id}
                    data-testid={`lead-row-${l.id}`}
                    onClick={() => navigate(`/leads/${l.id}`)}
                  >
                    <TD>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={l.name} size="sm" src={l.avatar_url} />
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-[var(--text)] truncate max-w-[160px]">
                            {l.name}
                          </div>
                          {l.company && (
                            <div className="text-[11px] text-[var(--text-faint)] truncate max-w-[160px]">
                              {l.company}
                            </div>
                          )}
                        </div>
                      </div>
                    </TD>
                    <TD>
                      <SourceTag source={l.source} />
                    </TD>
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
                        <StatusBadge
                          status={l.status}
                          tone={(meta?.status_meta || {})[l.status]?.tone}
                        />
                      ) : (
                        <span className="text-[var(--text-faint)] text-xs">—</span>
                      )}
                    </TD>
                    <TD align="right">
                      <ChevronRight className="w-4 h-4 text-[var(--text-faint)]" />
                    </TD>
                  </TR>
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
        </div>

        {/* Sidebar */}
        <div className="hidden xl:flex flex-col gap-4 w-64 shrink-0">
          <TodaysMeetings meetings={meetings} />
          <RecentNotes notes={recentNotes} />
        </div>
      </div>

      <NewLeadModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        meta={meta}
        onCreated={() => {
          setNewOpen(false);
          load();
        }}
      />
    </div>
  );
}
