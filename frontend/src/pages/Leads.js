import { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import client, { apiError } from "@/api";
import { useAuth } from "@/context/AuthContext";
import { btnPrimary, btnSecondary } from "@/components/Modal";
import { LeadFilters, LeadTable, CreateLeadModal } from "@/components/lead/LeadListWidgets";
import { Plus, Upload } from "lucide-react";

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
  region: "Other",
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
          <h1 className="font-heading text-3xl font-bold tracking-tighter text-zinc-900">Leads</h1>
          <p className="text-sm text-zinc-500 mt-1">
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

      <LeadFilters
        search={search}
        setSearch={setSearch}
        stageFilter={stageFilter}
        setStageFilter={setStageFilter}
        priorityFilter={priorityFilter}
        setPriorityFilter={setPriorityFilter}
      />

      <LeadTable leads={leads} isAdmin={isAdmin} team={team} onAssign={assign} />

      <CreateLeadModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        form={form}
        setForm={setForm}
        onSave={createLead}
        saving={saving}
      />
    </div>
  );
}
