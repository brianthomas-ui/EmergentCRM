import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import client, { apiError } from "@/api";
import { useAuth } from "@/context/AuthContext";
import { money, Badge, stageClass, priorityClass, STAGES, PRIORITIES } from "@/components/helpers";
import Modal, { Field, inputCls, btnPrimary, btnSecondary } from "@/components/Modal";
import { Plus, Upload, Search, Users as UsersIcon, ArrowRight } from "lucide-react";

const empty = {
  name: "",
  email: "",
  company: "",
  phone: "",
  plan: "",
  monthly_spend: 0,
  lifetime_value: 0,
  usage_trend: "stable",
  priority: "None",
  source: "Manual Entry",
};

export default function Leads() {
  const { isAdmin } = useAuth();
  const [leads, setLeads] = useState([]);
  const [team, setTeam] = useState([]);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef();

  const load = () => {
    const params = {};
    if (search) params.search = search;
    if (stageFilter) params.stage = stageFilter;
    if (priorityFilter) params.priority = priorityFilter;
    client.get("/leads", { params }).then((r) => setLeads(r.data));
  };

  useEffect(() => {
    load();
    if (isAdmin) client.get("/team").then((r) => setTeam(r.data.filter((u) => u.role === "agent")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, stageFilter, priorityFilter]);

  const createLead = async () => {
    setSaving(true);
    try {
      await client.post("/leads", { ...form, monthly_spend: Number(form.monthly_spend), lifetime_value: Number(form.lifetime_value) });
      toast.success("Lead created");
      setShowCreate(false);
      setForm(empty);
      load();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const assign = async (leadId, agentId) => {
    try {
      if (agentId === "__rr__") {
        await client.post(`/leads/${leadId}/round-robin`);
        toast.success("Assigned via round-robin");
      } else {
        await client.put(`/leads/${leadId}/assign`, { agent_id: agentId });
        toast.success("Lead assigned");
      }
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
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
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tighter text-slate-900">Leads</h1>
          <p className="text-sm text-slate-500 mt-1">
            {leads.length} accounts {isAdmin ? "across the team" : "assigned to you"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <>
              <input ref={fileRef} type="file" accept=".csv" hidden onChange={importCsv} data-testid="csv-input" />
              <button onClick={() => fileRef.current.click()} className={btnSecondary} data-testid="import-csv-btn">
                <Upload className="w-4 h-4 inline mr-1.5 -mt-0.5" /> Import CSV
              </button>
            </>
          )}
          <button onClick={() => setShowCreate(true)} className={btnPrimary} data-testid="new-lead-btn">
            <Plus className="w-4 h-4 inline mr-1.5 -mt-0.5" /> New Lead
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
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

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {["Account", "Plan / Spend", "Stage", "Priority", "Owner", "Source", ""].map((h) => (
                <th key={h} className="text-xs font-semibold text-slate-500 uppercase tracking-widest text-left p-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id} data-testid={`lead-row-${l.id}`} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                <td className="p-3">
                  <Link to={`/leads/${l.id}`} className="block">
                    <div className="text-sm font-semibold text-slate-900">{l.name}</div>
                    <div className="text-xs text-slate-400">{l.company || l.email}</div>
                  </Link>
                </td>
                <td className="p-3">
                  <div className="text-sm text-slate-700">{l.plan || "—"}</div>
                  <div className="text-xs text-slate-400 font-mono">{money(l.monthly_spend)}/mo</div>
                </td>
                <td className="p-3">
                  <Badge className={stageClass(l.stage)}>{l.stage}</Badge>
                </td>
                <td className="p-3">
                  <Badge className={priorityClass(l.priority)}>{l.priority}</Badge>
                </td>
                <td className="p-3 text-sm text-slate-700">{l.owner_name || <span className="text-slate-400">Unassigned</span>}</td>
                <td className="p-3 text-xs text-slate-500">{l.source}</td>
                <td className="p-3 text-right">
                  {isAdmin ? (
                    <select
                      data-testid={`assign-select-${l.id}`}
                      value=""
                      onChange={(e) => e.target.value && assign(l.id, e.target.value)}
                      className="border border-slate-300 rounded-xl text-xs px-2 py-1 bg-white"
                    >
                      <option value="">Assign…</option>
                      <option value="__rr__">⚡ Round-robin</option>
                      {team.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  ) : (
                    <Link to={`/leads/${l.id}`} className="text-slate-400 hover:text-slate-900">
                      <ArrowRight className="w-4 h-4 inline" />
                    </Link>
                  )}
                </td>
              </tr>
            ))}
            {leads.length === 0 && (
              <tr>
                <td colSpan={7} className="p-12 text-center text-slate-400 text-sm">
                  <UsersIcon className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  No leads found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Lead" testid="create-lead-modal" wide>
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
          <Field label="Source"><input className={inputCls} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} /></Field>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button className={btnSecondary} onClick={() => setShowCreate(false)}>Cancel</button>
          <button className={btnPrimary} onClick={createLead} disabled={saving} data-testid="save-lead-btn">
            {saving ? "Saving…" : "Create Lead"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
