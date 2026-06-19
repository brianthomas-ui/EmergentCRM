import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Search, Plus, Download, Loader2 } from "lucide-react";
import client, { apiError } from "@/api";
import { useAuth } from "@/context/AuthContext";
import {
  money,
  moneyCompact,
  fmtDate,
  timeAgo,
  statusAction,
  VISIBLE_STATUSES,
  PRODUCT_LINES,
  PROVIDERS,
} from "@/components/helpers";
import {
  Card,
  Table,
  THead,
  TH,
  TR,
  TD,
  StatusBadge,
  ProviderTag,
  ProductCard,
  StagePill,
  Select,
  RowActionButton,
  btnEmerald,
  darkInput,
} from "@/components/dark/Primitives";
import DealDrawer from "@/components/dark/DealDrawer";
import NewLeadModal from "@/components/dark/NewLeadModal";
import { PaymentModal } from "@/components/lead/LeadModals";

const WON_STATUS = "Payment Link Paid";

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
      .get("/leads")
      .then((r) => setLeads(r.data || []))
      .catch((e) => toast.error(apiError(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    client.get("/meta").then((r) => setMeta(r.data)).catch(() => {});
    client.get("/payments/packages").then((r) => setPackages(r.data)).catch(() => {});
    client.get("/settings").then((r) => setFxRate(r.data.inr_per_usd)).catch(() => {});
    if (isAdmin) client.get("/team").then((r) => setTeam(r.data || [])).catch(() => {});
  }, [load, isAdmin]);

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
      await updateLead(lead.id, { payment_status: "Paid" }, `${lead.name} marked paid`);
      return;
    }
    if (action.kind === "follow_up") {
      await updateLead(lead.id, { stage: "Contact in Future", next_action: "Follow up" }, "Follow-up set");
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
      await updateLead(lead.id, { stage: "Interested" }, `${lead.name} → Interested`);
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

      {/* Product revenue cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {products.map((p) => {
          const s = productStats[p] || {};
          return (
            <ProductCard
              key={p}
              name={p}
              currency={s.currency}
              wonRevenue={s.wonRevenue}
              wonCount={s.wonCount}
              openValue={s.openValue}
              onClick={() => setProduct(product === p ? "" : p)}
            />
          );
        })}
      </div>

      {/* Stage summary strip */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {statuses.map((s) => {
          const st = stageStats[s] || { count: 0, value: 0 };
          return (
            <StagePill
              key={s}
              label={s}
              tone={statusMeta[s]?.tone}
              count={st.count}
              value={st.value}
              active={status === s}
              onClick={() => setStatus(status === s ? "" : s)}
            />
          );
        })}
      </div>

      {/* Filter row */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-faint)]" />
            <input
              data-testid="deals-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search lead, company, email, phone…"
              className={`${darkInput} pl-9`}
            />
          </div>
          <Select value={product} onChange={(e) => setProduct(e.target.value)} className="w-auto min-w-[160px]" data-testid="filter-product">
            <option value="">All Products</option>
            {products.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto min-w-[150px]" data-testid="filter-status">
            <option value="">All Statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
          <Select value={provider} onChange={(e) => setProvider(e.target.value)} className="w-auto min-w-[130px]" data-testid="filter-provider">
            <option value="">All Providers</option>
            {providers.map((p) => (
              <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>
            ))}
          </Select>
          {isAdmin && (
            <Select value={owner} onChange={(e) => setOwner(e.target.value)} className="w-auto min-w-[140px]" data-testid="filter-owner">
              <option value="">All Owners</option>
              {team.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </Select>
          )}
          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-sm text-[var(--text-muted)] cursor-pointer select-none">
            <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} className="accent-emerald-500" data-testid="filter-mine" />
            Mine only
          </label>
        </div>
      </Card>

      {/* Table-first pipeline */}
      <Card className="overflow-hidden">
        <div className="max-h-[calc(100vh-360px)] overflow-y-auto">
          <Table>
            <THead>
              <TH>Lead</TH>
              <TH>Product</TH>
              <TH align="right">Amount</TH>
              <TH>Provider</TH>
              <TH>Status</TH>
              <TH>Owner</TH>
              <TH>Last activity</TH>
              <TH>Next action</TH>
              <TH>Created</TH>
              <TH align="right">Action</TH>
            </THead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center text-[var(--text-muted)]">
                    <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Loading pipeline…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center text-sm text-[var(--text-faint)]">
                    No deals match these filters.
                  </td>
                </tr>
              ) : (
                rows.map((l) => (
                  <TR key={l.id} onClick={() => setSelected(l)} active={selected?.id === l.id} className="text-[var(--text)]">
                    <TD>
                      <div className="font-medium text-[var(--text)] leading-tight">{l.name}</div>
                      <div className="text-xs text-[var(--text-faint)] truncate max-w-[200px]">
                        {l.company || l.email}
                        {l.referred_by_name && (
                          <span className="ml-1.5 text-emerald-300/80">· ref {l.referred_by_name}</span>
                        )}
                      </div>
                    </TD>
                    <TD className="text-[var(--text-muted)] whitespace-nowrap text-xs">{l.product_line || "—"}</TD>
                    <TD align="right" className="font-medium tabular-nums whitespace-nowrap">
                      {l.amount ? money(l.amount, l.currency) : "—"}
                    </TD>
                    <TD><ProviderTag provider={l.provider} /></TD>
                    <TD><StatusBadge status={l.status} tone={l.status_tone} /></TD>
                    <TD className="text-[var(--text-muted)] whitespace-nowrap text-xs">{l.owner_name || "Unassigned"}</TD>
                    <TD className="text-[var(--text-faint)] whitespace-nowrap text-xs">{timeAgo(l.last_activity || l.updated_at) || "—"}</TD>
                    <TD className="text-[var(--text-muted)] text-xs max-w-[150px] truncate">{l.next_action || "—"}</TD>
                    <TD className="text-[var(--text-faint)] whitespace-nowrap text-xs">{fmtDate(l.created_at)}</TD>
                    <TD align="right">
                      <RowActionButton status={l.status} onClick={(a) => onRowAction(l, a)} />
                    </TD>
                  </TR>
                ))
              )}
            </tbody>
          </Table>
        </div>
        {!loading && rows.length > 0 && (
          <div className="px-4 py-2.5 text-[11px] text-[var(--text-faint)] font-mono border-t border-[var(--border)]">
            Showing {rows.length} of {leads.length} deals
          </div>
        )}
      </Card>

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
