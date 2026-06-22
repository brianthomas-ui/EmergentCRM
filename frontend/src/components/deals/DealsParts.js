import { Loader2, ChevronUp, ChevronDown } from "lucide-react";
import { money, fmtDate, timeAgo } from "@/components/helpers";
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
} from "@/components/dark/Primitives";
import { MobileCard, CardList, CardGroupHeader } from "@/components/dark/MobileCard";
import { useIsMobile } from "@/hooks/use-is-mobile";

export function DealsSummary({ products, productStats, statuses, stageStats, statusMeta, product, setProduct, status, setStatus }) {
  return (
    <>
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
    </>
  );
}

export function DealsFilters({
  product, setProduct, status, setStatus,
  provider, setProvider, owner, setOwner, mine, setMine,
  products, statuses, providers, team, isAdmin,
}) {
  return (
    <Card className="p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-[var(--text-faint)] mr-1">Filter</span>
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
  );
}

function DealRow({ lead, selected, setSelected, onRowAction }) {
  const l = lead;
  return (
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
      <TD className="text-[var(--text-muted)] whitespace-nowrap text-xs">{l.product_line || "-"}</TD>
      <TD align="right" className="font-medium tabular-nums whitespace-nowrap">
        {l.amount ? money(l.amount, l.currency) : "-"}
      </TD>
      <TD><ProviderTag provider={l.provider} /></TD>
      <TD><StatusBadge status={l.status} tone={l.status_tone} /></TD>
      <TD className="text-[var(--text-muted)] whitespace-nowrap text-xs">{l.owner_name || "Unassigned"}</TD>
      <TD className="text-[var(--text-faint)] whitespace-nowrap text-xs">{timeAgo(l.last_activity || l.updated_at) || "-"}</TD>
      <TD className="text-[var(--text-muted)] text-xs max-w-[150px] truncate">{l.next_action || "-"}</TD>
      <TD className="text-[var(--text-faint)] whitespace-nowrap text-xs">{fmtDate(l.created_at)}</TD>
      <TD align="right">
        <RowActionButton status={l.status} onClick={(a) => onRowAction(l, a)} />
      </TD>
    </TR>
  );
}

// A clickable, sortable column header. `sortable` keys map to Deals.js sort state.
function SortTH({ label, sortKey, currentKey, dir, onSort, align }) {
  const active = currentKey === sortKey;
  return (
    <TH align={align}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        data-testid={`deals-sort-${sortKey}`}
        className={`inline-flex items-center gap-1 ${align === "right" ? "flex-row-reverse" : ""} ${active ? "text-[var(--text)]" : "hover:text-[var(--text-muted)]"} transition-colors`}
      >
        {label}
        {active && (dir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
      </button>
    </TH>
  );
}

// Mobile: the same recency-grouped pipeline as a stack of cards instead of a 10-col table.
function DealsCardList({ loading, sections, rowCount, leads, selected, setSelected, onRowAction }) {
  if (loading) {
    return (
      <div className="py-16 text-center text-[var(--text-muted)]">
        <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Loading pipeline…
      </div>
    );
  }
  if (!sections || sections.length === 0) {
    return <div className="py-16 text-center text-sm text-[var(--text-faint)]">No deals match these filters.</div>;
  }
  return (
    <div className="space-y-5">
      {sections.map((sec) => {
        const total = sec.rows.reduce((s, l) => s + Number(l.amount || 0), 0);
        return (
          <div key={sec.key} className="space-y-2.5" data-testid={`deals-group-${sec.key}`}>
            <CardGroupHeader label={sec.label} count={sec.rows.length} right={money(total)} />
            <CardList>
              {sec.rows.map((l) => (
                <MobileCard
                  key={l.id}
                  testid="deal-card"
                  onClick={() => setSelected(l)}
                  active={selected?.id === l.id}
                  title={l.name}
                  subtitle={l.company || l.email}
                  trailingTop={l.amount ? money(l.amount, l.currency) : "-"}
                  trailingBottom={<StatusBadge status={l.status} tone={l.status_tone} />}
                  meta={[
                    { label: "Product", value: l.product_line || "-" },
                    { label: "Owner", value: l.owner_name || "Unassigned" },
                    { label: "Provider", value: <ProviderTag provider={l.provider} /> },
                    { label: "Last activity", value: timeAgo(l.last_activity || l.updated_at) || "-" },
                  ]}
                  footer={<RowActionButton status={l.status} onClick={(a) => onRowAction(l, a)} />}
                />
              ))}
            </CardList>
          </div>
        );
      })}
      {rowCount > 0 && (
        <div className="text-[11px] text-[var(--text-faint)] font-mono text-center pt-1">
          Showing {rowCount} of {leads.length} deals
        </div>
      )}
    </div>
  );
}

export function DealsTable(props) {
  const isMobile = useIsMobile();
  if (isMobile) return <DealsCardList {...props} />;
  return <DealsTableDesktop {...props} />;
}

function DealsTableDesktop({ loading, sections, rowCount, leads, selected, setSelected, onRowAction, sortKey, sortDir, onSort }) {
  return (
    <Card className="overflow-hidden">
      <div className="max-h-[calc(100vh-420px)] overflow-y-auto">
        <Table>
          <THead>
            <TH>Lead</TH>
            <TH>Product</TH>
            <SortTH label="Amount" sortKey="amount" currentKey={sortKey} dir={sortDir} onSort={onSort} align="right" />
            <TH>Provider</TH>
            <TH>Status</TH>
            <SortTH label="Owner" sortKey="owner" currentKey={sortKey} dir={sortDir} onSort={onSort} />
            <SortTH label="Last activity" sortKey="activity" currentKey={sortKey} dir={sortDir} onSort={onSort} />
            <TH>Next action</TH>
            <SortTH label="Created" sortKey="created" currentKey={sortKey} dir={sortDir} onSort={onSort} />
            <TH align="right">Action</TH>
          </THead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} className="py-16 text-center text-[var(--text-muted)]">
                  <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Loading pipeline…
                </td>
              </tr>
            ) : !sections || sections.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-16 text-center text-sm text-[var(--text-faint)]">
                  No deals match these filters.
                </td>
              </tr>
            ) : (
              sections.map((sec) => (
                <SectionGroup key={sec.key} sec={sec} selected={selected} setSelected={setSelected} onRowAction={onRowAction} />
              ))
            )}
          </tbody>
        </Table>
      </div>
      {!loading && rowCount > 0 && (
        <div className="px-4 py-2.5 text-[11px] text-[var(--text-faint)] font-mono border-t border-[var(--border)]">
          Showing {rowCount} of {leads.length} deals
        </div>
      )}
    </Card>
  );
}

function SectionGroup({ sec, selected, setSelected, onRowAction }) {
  const total = sec.rows.reduce((s, l) => s + Number(l.amount || 0), 0);
  return (
    <>
      <tr className="bg-[var(--surface-2)]" data-testid={`deals-group-${sec.key}`}>
        <td colSpan={10} className="px-4 py-2 border-y border-[var(--border)]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              {sec.label} <span className="text-[var(--text-faint)] font-mono ml-1">({sec.rows.length})</span>
            </span>
            <span className="text-[11px] font-mono text-[var(--text-faint)]">{money(total)}</span>
          </div>
        </td>
      </tr>
      {sec.rows.map((l) => (
        <DealRow key={l.id} lead={l} selected={selected} setSelected={setSelected} onRowAction={onRowAction} />
      ))}
    </>
  );
}
