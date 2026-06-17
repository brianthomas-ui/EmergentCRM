import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import client from "@/api";
import { money, Badge, priorityClass, STAGES } from "@/components/helpers";

const COLUMNS = STAGES.filter((s) => s !== "Lost").concat(["Lost"]);

export default function Pipeline() {
  const [leads, setLeads] = useState([]);
  const [dragId, setDragId] = useState(null);
  const navigate = useNavigate();

  const load = () => client.get("/leads").then((r) => setLeads(r.data));
  useEffect(() => { load(); }, []);

  const onDrop = async (stage) => {
    if (!dragId) return;
    const lead = leads.find((l) => l.id === dragId);
    setDragId(null);
    if (!lead || lead.stage === stage) return;
    setLeads((prev) => prev.map((l) => (l.id === dragId ? { ...l, stage } : l)));
    try {
      await client.put(`/leads/${dragId}/stage`, { stage });
      toast.success(`${lead.name} → ${stage}`);
    } catch {
      toast.error("Failed to move");
      load();
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-3xl font-black tracking-tighter text-slate-900">Pipeline</h1>
        <p className="text-sm text-slate-500 mt-1">Drag cards across stages. {leads.length} leads in play.</p>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4">
        {COLUMNS.map((stage) => {
          const items = leads.filter((l) => l.stage === stage);
          const colValue = items.reduce((s, l) => s + (l.lifetime_value || 0), 0);
          return (
            <div
              key={stage}
              data-testid={`pipeline-col-${stage}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(stage)}
              className="w-72 shrink-0 bg-slate-100/60 rounded-sm p-3 min-h-[520px] border border-dashed border-slate-300 flex flex-col gap-2.5"
            >
              <div className="flex items-center justify-between mb-1 px-1">
                <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">{stage}</div>
                <Badge className="bg-white text-slate-500 border-slate-200">{items.length}</Badge>
              </div>
              {colValue > 0 && (
                <div className="text-[10px] text-slate-400 px-1 -mt-1 font-mono">{money(colValue)} LTV</div>
              )}
              {items.map((l) => (
                <div
                  key={l.id}
                  data-testid={`kanban-card-${l.id}`}
                  draggable
                  onDragStart={() => setDragId(l.id)}
                  onClick={() => navigate(`/leads/${l.id}`)}
                  className="bg-white border border-slate-200 rounded-sm p-3 hover:border-slate-400 hover:shadow-sm transition-all cursor-grab active:cursor-grabbing"
                >
                  <div className="text-sm font-semibold text-slate-900">{l.name}</div>
                  <div className="text-xs text-slate-400 mb-2">{l.company}</div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-slate-600">{money(l.monthly_spend)}/mo</span>
                    {l.priority !== "None" && (
                      <Badge className={priorityClass(l.priority)}>{l.priority}</Badge>
                    )}
                  </div>
                  {l.owner_name && (
                    <div className="text-[10px] text-slate-400 mt-2 uppercase tracking-wider">{l.owner_name}</div>
                  )}
                </div>
              ))}
              {items.length === 0 && (
                <div className="text-xs text-slate-300 text-center py-6">Drop here</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
