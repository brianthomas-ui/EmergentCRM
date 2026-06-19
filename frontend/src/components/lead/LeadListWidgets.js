import { Link } from "react-router-dom";
import { useState } from "react";
import { money, Badge, stageClass, priorityClass, STAGES, PRIORITIES, REGIONS } from "@/components/helpers";
import Modal, { Field, inputCls, btnPrimary, btnSecondary } from "@/components/Modal";
import { Search, Users as UsersIcon, ArrowRight } from "lucide-react";

export function LeadFilters({ search, setSearch, stageFilter, setStageFilter, priorityFilter, setPriorityFilter }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="relative flex-1 min-w-[220px]">
        <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          data-testid="lead-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email, company…"
          className={`${inputCls} pl-9`}
        />
      </div>
      <select data-testid="filter-stage" value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className={`${inputCls} w-auto`}>
        <option value="">All stages</option>
        {STAGES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      <select data-testid="filter-priority" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className={`${inputCls} w-auto`}>
        <option value="">All priorities</option>
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>
    </div>
  );
}

export function LeadTable({ leads, isAdmin, team, onAssign }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-zinc-50 border-b border-zinc-200">
            {["Account", "Plan / Spend", "Stage", "Priority", "Owner", "Source", ""].map((h) => (
              <th key={h} className="text-xs font-semibold text-zinc-500 uppercase tracking-widest text-left p-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => (
            <tr key={l.id} data-testid={`lead-row-${l.id}`} className="border-b border-zinc-100 hover:bg-zinc-50 transition-colors">
              <td className="p-3">
                <Link to={`/leads/${l.id}`} className="block">
                  <div className="text-sm font-semibold text-zinc-900">{l.name}</div>
                  <div className="text-xs text-zinc-400">{l.company || l.email}</div>
                </Link>
              </td>
              <td className="p-3">
                <div className="text-sm text-zinc-700">{l.plan || "-"}</div>
                <div className="text-xs text-zinc-400 font-mono">{money(l.monthly_spend)}/mo</div>
              </td>
              <td className="p-3">
                <Badge className={stageClass(l.stage)}>{l.stage}</Badge>
              </td>
              <td className="p-3">
                <Badge className={priorityClass(l.priority)}>{l.priority}</Badge>
              </td>
              <td className="p-3 text-sm text-zinc-700">{l.owner_name || <span className="text-zinc-400">Unassigned</span>}</td>
              <td className="p-3 text-xs text-zinc-500">
                <div>{l.source}</div>
                {l.referred_by_name && (
                  <div className="text-zinc-400 mt-0.5" data-testid={`referral-by-${l.id}`}>
                    via {l.referred_by_name}
                  </div>
                )}
              </td>
              <td className="p-3 text-right">
                {isAdmin ? (
                  <select
                    data-testid={`assign-select-${l.id}`}
                    value=""
                    onChange={(e) => e.target.value && onAssign(l.id, e.target.value)}
                    className="border border-zinc-300 rounded-lg text-xs px-2 py-1 bg-white"
                  >
                    <option value="">Assign…</option>
                    <option value="__rr__">⚡ Round-robin</option>
                    {team.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                ) : (
                  <Link to={`/leads/${l.id}`} className="text-zinc-400 hover:text-zinc-900">
                    <ArrowRight className="w-4 h-4 inline" />
                  </Link>
                )}
              </td>
            </tr>
          ))}
          {leads.length === 0 && (
            <tr>
              <td colSpan={7} className="p-12 text-center text-zinc-400 text-sm">
                <UsersIcon className="w-8 h-8 mx-auto mb-2 text-zinc-300" />
                No leads found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// Searchable referral picker over a flat customer list.
function ReferralPicker({ customers, value, onChange }) {
  const [q, setQ] = useState("");
  const filtered = q.trim()
    ? customers.filter((c) =>
        `${c.name} ${c.company || ""} ${c.email || ""}`.toLowerCase().includes(q.toLowerCase())
      )
    : customers;

  return (
    <div className="space-y-1.5" data-testid="referral-picker">
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          className={`${inputCls} pl-8 py-2 text-xs`}
          placeholder="Filter customers..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          data-testid="referral-search"
        />
      </div>
      <select
        className={`${inputCls} text-sm`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        size={Math.min(filtered.length + 1, 5)}
        data-testid="referral-select"
      >
        <option value="">None (not a referral)</option>
        {filtered.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}{c.company ? ` - ${c.company}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

export function CreateLeadModal({ open, onClose, form, setForm, onSave, saving, customers = [] }) {
  return (
    <Modal open={open} onClose={onClose} title="New Lead" testid="create-lead-modal" wide>
      <div className="grid grid-cols-2 gap-x-4">
        <Field label="Name"><input data-testid="lead-name" className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Email"><input data-testid="lead-email" className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Company"><input className={inputCls} value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></Field>
        <Field label="Phone"><input className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
        <Field label="Current Plan"><input className={inputCls} placeholder="Pro $99/mo" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} /></Field>
        <Field label="Monthly Spend ($)"><input type="number" className={inputCls} value={form.monthly_spend} onChange={(e) => setForm({ ...form, monthly_spend: e.target.value })} /></Field>
        <Field label="Lifetime Value ($)"><input type="number" className={inputCls} value={form.lifetime_value} onChange={(e) => setForm({ ...form, lifetime_value: e.target.value })} /></Field>
        <Field label="Usage Trend">
          <select className={inputCls} value={form.usage_trend} onChange={(e) => setForm({ ...form, usage_trend: e.target.value })}>
            <option value="rising">Rising</option>
            <option value="stable">Stable</option>
            <option value="declining">Declining</option>
          </select>
        </Field>
        <Field label="Priority">
          <select className={inputCls} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Region">
          <select className={inputCls} value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} data-testid="lead-region">
            {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="Source"><input className={inputCls} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} /></Field>
      </div>
      {/* Referral picker spans full width below the 2-col grid. */}
      <div className="mt-1 border-t border-zinc-100 pt-4">
        <Field label="Referred by (existing customer) - optional">
          <ReferralPicker
            customers={customers}
            value={form.referred_by_lead_id || ""}
            onChange={(id) => {
              const match = customers.find((c) => String(c.id) === String(id));
              setForm({
                ...form,
                referred_by_lead_id: id || null,
                referred_by_name: match ? match.name : null,
              });
            }}
          />
          {form.referred_by_lead_id && (
            <p className="text-[11px] text-zinc-500 mt-1.5" data-testid="referral-preview">
              Source will be set to <span className="font-semibold text-zinc-700">Referral</span> - referred by{" "}
              <span className="font-semibold text-zinc-700">{form.referred_by_name}</span>
            </p>
          )}
        </Field>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button type="button" className={btnSecondary} onClick={onClose}>Cancel</button>
        <button type="button" className={btnPrimary} onClick={onSave} disabled={saving} data-testid="save-lead-btn">
          {saving ? "Saving..." : "Create Lead"}
        </button>
      </div>
    </Modal>
  );
}
