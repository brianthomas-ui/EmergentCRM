import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Upload, Search } from "lucide-react";
import client, { apiError } from "@/api";
import { useAuth } from "@/context/AuthContext";
import { VISIBLE_STATUSES, PRODUCT_LINES } from "@/components/helpers";
import { Select, darkInput, btnEmerald, btnGhost } from "@/components/dark/Primitives";
import PeriodFilter, { DEFAULT_PERIOD, toParams } from "@/components/dark/PeriodFilter";
import NewLeadModal from "@/components/dark/NewLeadModal";
import { KpiCard, TodaysMeetings, RecentNotes, LeadsTable } from "@/components/leads/LeadsParts";

export default function Leads() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef();

  const [leads, setLeads] = useState([]);
  const [meta, setMeta] = useState(null);
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
    // Meetings for sidebar (no period filter — just upcoming)
    client.get("/meetings").then((r) => setMeetings(r.data || [])).catch(() => {});
    // Recent notes across leads
    client.get("/leads/notes/recent").then((r) => setRecentNotes(r.data || [])).catch(() => {});
  }, [isAdmin]);

  // KPI derivations
  const kpis = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now - 7 * 86400e3);
    const total = leads.length;
    const newThisWeek = leads.filter((l) => l.created_at && new Date(l.created_at) >= weekAgo).length;
    const qualified = leads.filter((l) => ["Interested", "Payment Link Sent"].includes(l.status)).length;
    const followupsDue = leads.filter((l) => l.next_followup_at && new Date(l.next_followup_at) <= now).length;
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
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-[var(--text)]">Leads</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Manage and qualify inbound prospects</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <>
              <input ref={fileRef} type="file" accept=".csv" hidden onChange={importCsv} data-testid="csv-input" />
              <button onClick={() => fileRef.current.click()} className={btnGhost} data-testid="import-csv-btn">
                <Upload className="w-4 h-4" /> Import CSV
              </button>
            </>
          )}
          <button onClick={() => setNewOpen(true)} className={btnEmerald} data-testid="new-lead-btn">
            <Plus className="w-4 h-4" /> New Lead
          </button>
        </div>
      </div>

      {/* KPI row + period filter */}
      <div className="space-y-3">
        <PeriodFilter value={period} onChange={setPeriod} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label="Total Leads" value={kpis.total} sub="in selected period" />
          <KpiCard label="New This Week" value={kpis.newThisWeek} sub={`+${kpis.newThisWeek} this week`} accent />
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
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} data-testid="filter-status">
                <option value="">All Statuses</option>
                {statuses.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
            </div>
            <div className="w-44">
              <Select value={productFilter} onChange={(e) => setProductFilter(e.target.value)} data-testid="filter-product">
                <option value="">All Products</option>
                {products.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </Select>
            </div>
            {sources.length > 0 && (
              <div className="w-40">
                <Select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} data-testid="filter-source">
                  <option value="">All Sources</option>
                  {sources.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </Select>
              </div>
            )}
          </div>

          <div data-tour="leads-table">
            <LeadsTable
              filtered={filtered}
              leads={leads}
              loading={loading}
              meta={meta}
              onRowClick={(id) => navigate(`/leads/${id}`)}
            />
          </div>
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
