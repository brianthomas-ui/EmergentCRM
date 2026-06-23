import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Upload, Search } from "lucide-react";
import client, { apiError } from "@/api";
import { useAuth } from "@/context/AuthContext";
import { VISIBLE_STATUSES, PRODUCT_LINES } from "@/components/helpers";
import { Select, darkInput, btnEmerald, btnGhost } from "@/components/dark/Primitives";
import PeriodFilter, { DEFAULT_PERIOD, toParams } from "@/components/dark/PeriodFilter";
import NewLeadModal from "@/components/dark/NewLeadModal";
import { KpiCard, TodaysMeetings, RecentNotes, LeadsTable } from "@/components/leads/LeadsParts";
import SavedViews from "@/components/leads/SavedViews";
import BulkBar from "@/components/leads/BulkBar";

// Named "views" - a single mechanism shared by the Leads KPI cards (clicked in place)
// and the My Work tiles (which navigate here as /leads?view=...). Each is a client-side
// predicate over the loaded leads.
const VIEW_LABEL = {
  all: "All leads", new: "New this week", qualified: "Qualified",
  followups: "Follow-ups due", open: "Open pipeline", pending: "Payment pending",
  stale: "Going stale", won: "Won deals",
};
function viewPredicate(view) {
  const now = Date.now();
  const weekAgo = now - 7 * 86400e3;
  const inGroup = (l, g) => (l.status_groups || []).includes(g);
  switch (view) {
    case "new": return (l) => l.created_at && new Date(l.created_at).getTime() >= weekAgo;
    case "qualified": return (l) => ["Interested", "Payment Link Sent"].includes(l.status);
    case "followups": return (l) => l.next_followup_at && new Date(l.next_followup_at).getTime() <= now;
    case "open": return (l) => inGroup(l, "Active Pipeline");
    case "pending": return (l) => ["Payment Link Sent", "Payment Link Failed"].includes(l.status);
    case "stale": return (l) => inGroup(l, "Active Pipeline") && l.last_activity && (now - new Date(l.last_activity).getTime()) > 7 * 86400e3;
    case "won": return (l) => l.status === "Payment Link Paid";
    default: return () => true;
  }
}

export default function Leads() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const fileRef = useRef();

  const [leads, setLeads] = useState([]);
  const [meta, setMeta] = useState(null);
  const [meetings, setMeetings] = useState([]);
  const [recentNotes, setRecentNotes] = useState([]);
  const [agents, setAgents] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [loading, setLoading] = useState(true);

  // filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [productFilter, setProductFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [period, setPeriod] = useState(DEFAULT_PERIOD);
  const [view, setView] = useState(searchParams.get("view") || "all");

  // Keep the active view in sync with a ?view= deep link (e.g. from My Work tiles).
  useEffect(() => {
    setView(searchParams.get("view") || "all");
  }, [searchParams]);

  const pickView = (v) => {
    const next = view === v ? "all" : v;
    setView(next);
    setSearchParams(next === "all" ? {} : { view: next }, { replace: true });
  };

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
    // Meetings for the sidebar "today" widget - scoped server-side (the collection is large).
    client.get("/meetings", { params: { today: "true" } }).then((r) => setMeetings(r.data || [])).catch(() => {});
    // Recent notes across leads
    client.get("/leads/notes/recent").then((r) => setRecentNotes(r.data || [])).catch(() => {});
    // Team list powers the bulk "Assign to…" picker (admins only).
    if (isAdmin) client.get("/team").then((r) => setAgents(r.data || [])).catch(() => {});
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

  // Client-side source filter + the active KPI/My-Work "view".
  const filtered = useMemo(() => {
    const pred = viewPredicate(view);
    return leads.filter(
      (l) => pred(l) && (!sourceFilter || (l.source || "").toLowerCase() === sourceFilter.toLowerCase())
    );
  }, [leads, sourceFilter, view]);

  // Unique sources for filter dropdown
  const sources = useMemo(
    () => [...new Set(leads.map((l) => l.source).filter(Boolean))].sort(),
    [leads]
  );

  // Bulk selection (over the currently filtered rows).
  const visibleIds = useMemo(() => filtered.map((l) => l.id), [filtered]);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const toggle = (id) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleAll = () =>
    setSelected((s) => {
      const n = new Set(s);
      if (allSelected) visibleIds.forEach((id) => n.delete(id));
      else visibleIds.forEach((id) => n.add(id));
      return n;
    });
  const clearSelection = () => setSelected(new Set());

  // Saved views: persist/restore the simple filter set.
  const currentFilters = { search, statusFilter, productFilter, sourceFilter, view };
  const applyView = (f) => {
    setSearch(f.search || "");
    setStatusFilter(f.statusFilter || "");
    setProductFilter(f.productFilter || "");
    setSourceFilter(f.sourceFilter || "");
    const v = f.view || "all";
    setView(v);
    setSearchParams(v === "all" ? {} : { view: v }, { replace: true });
  };

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
          <SavedViews currentFilters={currentFilters} onApply={applyView} />
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
          <KpiCard label="Total Leads" value={kpis.total} sub="in selected period" active={view === "all"} onClick={() => pickView("all")} />
          <KpiCard label="New This Week" value={kpis.newThisWeek} sub={`+${kpis.newThisWeek} this week`} accent active={view === "new"} onClick={() => pickView("new")} />
          <KpiCard
            label="Qualified"
            value={kpis.qualified}
            sub={`${leads.length ? Math.round((kpis.qualified / leads.length) * 100) : 0}% of total`}
            active={view === "qualified"}
            onClick={() => pickView("qualified")}
          />
          <KpiCard label="Follow-ups Due" value={kpis.followupsDue} sub="overdue today" active={view === "followups"} onClick={() => pickView("followups")} />
        </div>
        {view !== "all" && (
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <span>Showing <span className="font-medium text-[var(--text)]">{VIEW_LABEL[view] || view}</span> · {filtered.length} of {leads.length}</span>
            <button onClick={() => pickView("all")} className="text-emerald-400 hover:text-emerald-300">Clear</button>
          </div>
        )}
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
            {selected.size > 0 && (
              <div className="mb-3">
                <BulkBar
                  count={selected.size}
                  ids={[...selected]}
                  statuses={statuses}
                  agents={agents}
                  isAdmin={isAdmin}
                  onClear={clearSelection}
                  onDone={() => {
                    clearSelection();
                    load();
                  }}
                />
              </div>
            )}
            <LeadsTable
              filtered={filtered}
              leads={leads}
              loading={loading}
              meta={meta}
              onRowClick={(id) => navigate(`/leads/${id}`)}
              selectable
              selected={selected}
              onToggle={toggle}
              onToggleAll={toggleAll}
              allSelected={allSelected}
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
