import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Download, Search } from "lucide-react";
import client, { apiError } from "@/api";
import { useAuth } from "@/context/AuthContext";
import { VISIBLE_STATUSES, PRODUCT_LINES, PROVIDERS } from "@/components/helpers";
import { btnEmerald, darkInput } from "@/components/dark/Primitives";
import { DealsSummary, DealsFilters, DealsTable } from "@/components/deals/DealsParts";
import PeriodFilter, { toParams, DEFAULT_PERIOD } from "@/components/dark/PeriodFilter";
import DealDrawer from "@/components/dark/DealDrawer";
import NewLeadModal from "@/components/dark/NewLeadModal";
import { PaymentModal } from "@/components/lead/LeadModals";

const WON_STATUS = "Payment Link Paid";

// Recency buckets for the time-grouped pipeline. A deal lands in the first bucket
// whose window contains its last_activity (fallback updated_at / created_at).
const DAY = 86400000;
function recencyBucket(iso) {
  if (!iso) return "earlier";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "earlier";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (t >= startOfToday) return "today";
  if (t >= startOfToday - 6 * DAY) return "this_week";
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  if (t >= startOfMonth) return "this_month";
  return "earlier";
}
const BUCKETS = [
  { key: "today", label: "Today" },
  { key: "this_week", label: "Earlier this week" },
  { key: "this_month", label: "Earlier this month" },
  { key: "earlier", label: "Earlier" },
];

export default function Deals() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();

  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState(null);
  const [team, setTeam] = useState([]);

  // filters
  const [search, setSearch] = useState("");
  const [product, setProduct] = useState("");
  const [status, setStatus] = useState("");
  const [provider, setProvider] = useState("");
  const [owner, setOwner] = useState("");
  const [mine, setMine] = useState(false);
  const [period, setPeriod] = useState({ ...DEFAULT_PERIOD, period: "all" });

  // column sort within each recency group
  const [sortKey, setSortKey] = useState("amount"); // amount | created | owner | activity
  const [sortDir, setSortDir] = useState("desc");
  const onSort = (key) => {
    if (key === sortKey) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir(key === "owner" ? "asc" : "desc"); }
  };

  // drawer / modal
  const [selected, setSelected] = useState(null);
  const [newOpen, setNewOpen] = useState(false);

  // payment-link modal (rep sets amount + multiplier before sending)
  const [packages, setPackages] = useState({});
  const [fxRate, setFxRate] = useState(85);
  const [payModal, setPayModal] = useState(false);
  const [payLeadId, setPayLeadId] = useState(null);
  const [payForm, setPayForm] = useState({
    provider: "stripe",
    product_line: "Credit Top-Up",
    package_id: "",
    amount: "",
    currency: "usd",
    multiplier: 7.5,
    description: "",
    credits: "",
    boost_credits: "",
  });

  const openPayModal = (lead) => {
    const pl = lead?.product_line || "Credit Top-Up";
    const isCredit = pl === "Credit Top-Up";
    setPayLeadId(lead.id);
    setPayForm({
      provider: lead?.provider || "stripe",
      product_line: pl,
      package_id: isCredit ? "" : (lead?.package_id || ""),
      amount: !isCredit && lead?.amount ? String(lead.amount) : "",
      currency: lead?.currency || "usd",
      multiplier: meta?.credit_multiplier?.default ?? 7.5,
      description: "",
      credits: "",
      boost_credits: "",
    });
    setPayModal(true);
  };

  const createPayment = async () => {
    try {
      const isCredit = (payForm.product_line || "Credit Top-Up") === "Credit Top-Up";
      const body = {
        lead_id: payLeadId,
        provider: payForm.provider,
        origin_url: window.location.origin,
        package_id: payForm.package_id || null,
        product_line: payForm.product_line || "Credit Top-Up",
        currency: payForm.currency,
        description: payForm.description || "",
      };
      if (payForm.amount !== "" && payForm.amount != null) body.amount = Number(payForm.amount);
      if (isCredit) {
        const mult = Number(payForm.multiplier) || meta?.credit_multiplier?.default || 7.5;
        body.multiplier = mult;
        if (body.amount) {
          const usd = payForm.currency === "inr" && fxRate ? body.amount / fxRate : body.amount;
          body.credits = Math.round(usd * mult);
        }
      } else {
        if (payForm.credits !== "" && payForm.credits != null) body.credits = Number(payForm.credits);
        if (payForm.boost_credits !== "" && payForm.boost_credits != null)
          body.boost_credits = Number(payForm.boost_credits);
      }
      const { data: rec } = await client.post("/payments/link", body);
      toast.success("Payment link generated");
      setPayModal(false);
      load();
      if (rec.payment_link) navigator.clipboard?.writeText(rec.payment_link).catch(() => {});
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const load = useCallback(() => {
    setLoading(true);
    client
      .get("/leads", { params: toParams(period) })
      .then((r) => setLeads(r.data || []))
      .catch((e) => toast.error(apiError(e)))
      .finally(() => setLoading(false));
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    client.get("/meta").then((r) => setMeta(r.data)).catch(() => {});
    client.get("/payments/packages").then((r) => setPackages(r.data)).catch(() => {});
    client.get("/settings").then((r) => setFxRate(r.data.inr_per_usd)).catch(() => {});
    if (isAdmin) client.get("/team").then((r) => setTeam(r.data || [])).catch(() => {});
  }, [isAdmin]);

  const statuses = meta?.statuses || VISIBLE_STATUSES;
  const products = meta?.product_lines || PRODUCT_LINES;
  const providers = meta?.providers || PROVIDERS;
  const statusMeta = meta?.status_meta || {};

  // ---- product card aggregates ----
  const productStats = useMemo(() => {
    const map = {};
    products.forEach((p) => (map[p] = { wonRevenue: 0, wonCount: 0, openValue: 0, currency: "usd" }));
    leads.forEach((l) => {
      const pl = l.product_line;
      if (!map[pl]) return;
      if (l.currency) map[pl].currency = l.currency;
      const amt = Number(l.amount || 0);
      if (l.status === WON_STATUS) {
        map[pl].wonRevenue += amt;
        map[pl].wonCount += 1;
      } else if ((l.status_groups || []).includes("Active Pipeline")) {
        map[pl].openValue += amt;
      }
    });
    return map;
  }, [leads, products]);

  // ---- stage summary aggregates ----
  const stageStats = useMemo(() => {
    const map = {};
    statuses.forEach((s) => (map[s] = { count: 0, value: 0 }));
    leads.forEach((l) => {
      if (!map[l.status]) map[l.status] = { count: 0, value: 0 };
      map[l.status].count += 1;
      map[l.status].value += Number(l.amount || 0);
    });
    return map;
  }, [leads, statuses]);

  // ---- filtered rows ----
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (product && l.product_line !== product) return false;
      if (status && l.status !== status) return false;
      if (provider && (l.provider || "").toLowerCase() !== provider) return false;
      if (owner && l.owner_id !== owner) return false;
      if (mine && l.owner_id !== user?.id) return false;
      if (q) {
        const hay = `${l.name || ""} ${l.company || ""} ${l.email || ""} ${l.phone || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [leads, product, status, provider, owner, mine, search, user]);

  // ---- time-grouped + sorted sections ----
  const sections = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const activityOf = (l) => l.last_activity || l.updated_at || l.created_at;
    const cmp = (a, b) => {
      let av, bv;
      if (sortKey === "owner") { av = (a.owner_name || "").toLowerCase(); bv = (b.owner_name || "").toLowerCase(); }
      else if (sortKey === "created") { av = new Date(a.created_at || 0).getTime(); bv = new Date(b.created_at || 0).getTime(); }
      else if (sortKey === "activity") { av = new Date(activityOf(a) || 0).getTime(); bv = new Date(activityOf(b) || 0).getTime(); }
      else { av = Number(a.amount || 0); bv = Number(b.amount || 0); } // amount
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    };
    const byKey = {};
    rows.forEach((l) => {
      const k = recencyBucket(activityOf(l));
      (byKey[k] = byKey[k] || []).push(l);
    });
    return BUCKETS
      .map((b) => ({ ...b, rows: (byKey[b.key] || []).slice().sort(cmp) }))
      .filter((s) => s.rows.length > 0);
  }, [rows, sortKey, sortDir]);

  const onRowAction = async (lead, action) => {
    // Light, demo-safe flows. Heavier flows open the drawer.
    if (action.kind === "view_customer" || action.kind === "qualify" || action.kind === "open") {
      setSelected(lead);
      return;
    }
    if (action.kind === "send_link") {
      openPayModal(lead);
      return;
    }
    if (action.kind === "mark_paid") {
      await recordManualPaid(lead);
      return;
    }
    if (action.kind === "follow_up") {
      await setLeadStatus(lead.id, "Contact in Future", "Follow-up set");
      return;
    }
    if (action.kind === "reschedule") {
      setSelected(lead);
      return;
    }
    if (action.kind === "loss_reason" || action.kind === "recovery") {
      setSelected(lead);
      return;
    }
    if (action.kind === "mark_interested") {
      await setLeadStatus(lead.id, "Interested", `${lead.name} → Interested`);
      return;
    }
    setSelected(lead);
  };

  const updateLead = async (id, payload, msg) => {
    try {
      await client.put(`/leads/${id}`, payload);
      toast.success(msg || "Updated");
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  // Status changes go through the dedicated /stage endpoint (single-writer model).
  const setLeadStatus = async (id, status, msg) => {
    try {
      await client.put(`/leads/${id}/stage`, { stage: status });
      toast.success(msg || `Status → ${status}`);
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  // "Mark paid" records an offline/Manual payment (already received) -> Won (G5).
  // No amount yet -> open the payment modal so the agent sets one.
  const recordManualPaid = async (lead) => {
    if (!lead.amount) { openPayModal(lead); return; }
    try {
      await client.post("/payments/link", {
        lead_id: lead.id, provider: "manual",
        amount: Number(lead.amount), currency: lead.currency || "usd", mark_paid: true,
      });
      toast.success(`${lead.name} — payment recorded, deal won`);
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-[var(--text)]">Pipeline</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Stripe &amp; Razorpay payment links · 4 product lines
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btnGhost inline-flex items-center gap-1.5 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border)] text-[var(--text)] rounded-lg px-3.5 py-2 text-sm font-medium transition-colors" disabled>
            <Download className="w-4 h-4" /> Export
          </button>
          <button data-testid="new-lead-btn" className={btnEmerald} onClick={() => setNewOpen(true)}>
            <Plus className="w-4 h-4" /> New Lead
          </button>
        </div>
      </div>

      {/* Prominent search + period scope */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="relative flex-1" data-tour="deals-search">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-faint)]" />
          <input
            data-testid="deals-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search deals by lead, company, email or phone…"
            className={`${darkInput} pl-10 h-11 text-[15px]`}
          />
        </div>
        <div data-tour="deals-period">
          <PeriodFilter value={period} onChange={setPeriod} includeAll />
        </div>
      </div>

      {/* Product revenue cards + stage summary strip */}
      <DealsSummary
        products={products}
        productStats={productStats}
        statuses={statuses}
        stageStats={stageStats}
        statusMeta={statusMeta}
        product={product}
        setProduct={setProduct}
        status={status}
        setStatus={setStatus}
      />

      {/* Filter row (dropdowns only — search lives in the top bar) */}
      <DealsFilters
        product={product} setProduct={setProduct}
        status={status} setStatus={setStatus}
        provider={provider} setProvider={setProvider}
        owner={owner} setOwner={setOwner}
        mine={mine} setMine={setMine}
        products={products} statuses={statuses} providers={providers}
        team={team} isAdmin={isAdmin}
      />

      {/* Table-first pipeline, grouped by recency */}
      <DealsTable
        loading={loading}
        sections={sections}
        rowCount={rows.length}
        leads={leads}
        selected={selected}
        setSelected={setSelected}
        onRowAction={onRowAction}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
      />

      {/* Detail drawer */}
      <DealDrawer
        leadId={selected?.id}
        open={!!selected}
        onClose={() => setSelected(null)}
        meta={meta}
        onChanged={() => {
          load();
        }}
        onSendLink={(lead) => {
          setSelected(null);
          openPayModal(lead);
        }}
        onViewLead={(id) => navigate(`/leads/${id}`)}
      />

      {/* Payment-link modal (amount + multiplier) */}
      <PaymentModal
        open={payModal}
        onClose={() => setPayModal(false)}
        payForm={payForm}
        setPayForm={setPayForm}
        packages={packages}
        fxRate={fxRate}
        meta={meta}
        onSubmit={createPayment}
      />

      {/* New lead modal */}
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
