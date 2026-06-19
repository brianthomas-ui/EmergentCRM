import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import client from "@/api";
import { money, Badge, priorityClass, STAGES } from "@/components/helpers";

const FALLBACK_COLUMNS = STAGES;

const POLL_MS = 20_000;

export default function Pipeline() {
  const [leads, setLeads] = useState([]);
  const [columns, setColumns] = useState(FALLBACK_COLUMNS);
  const [dragId, setDragId] = useState(null);
  const isDragging = useRef(false);
  const navigate = useNavigate();

  const load = () => client.get("/leads").then((r) => setLeads(r.data));

  // Fetch the backend's canonical stage list and fall back silently if unavailable.
  useEffect(() => {
    client
      .get("/meta")
      .then((r) => {
        if (Array.isArray(r.data?.stages) && r.data.stages.length > 0) {
          setColumns(r.data.stages);
        }
      })
      .catch(() => {});
  }, []);

  // Initial load + 20 s auto-refresh (paused while dragging).
  useEffect(() => {
    load();

    const interval = setInterval(() => {
      if (!isDragging.current) {
        load();
      }
    }, POLL_MS);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDragStart = (id) => {
    isDragging.current = true;
    setDragId(id);
  };

  const onDragEnd = () => {
    isDragging.current = false;
  };

  const onDrop = async (stage) => {
    isDragging.current = false;
    if (!dragId) return;
    const lead = leads.find((l) => l.id === dragId);
    const prevDragId = dragId;
    setDragId(null);
    if (!lead || lead.stage === stage) return;
    setLeads((prev) => prev.map((l) => (l.id === prevDragId ? { ...l, stage } : l)));
    try {
      await client.put(`/leads/${prevDragId}/stage`, { stage });
      toast.success(`${lead.name} → ${stage}`);
    } catch {
      toast.error("Failed to move");
      load();
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tighter text-zinc-900">Pipeline</h1>
        <p className="text-sm text-zinc-500 mt-1">Drag cards across stages. {leads.length} leads in play.</p>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4">
        {columns.map((stage) => {
          const items = leads.filter((l) => l.stage === stage);
          const colValue = items.reduce((s, l) => s + (l.lifetime_value || 0), 0);
          return (
            <div
              key={stage}
              data-testid={`pipeline-col-${stage}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(stage)}
              className="w-72 shrink-0 bg-zinc-100/60 rounded-lg p-3 min-h-[520px] border border-dashed border-zinc-300 flex flex-col gap-2.5"
            >
              <div className="flex items-center justify-between mb-1 px-1">
                <div className="text-xs font-bold text-zinc-700 uppercase tracking-wider">{stage}</div>
                <Badge className="bg-white text-zinc-500 border-zinc-200">{items.length}</Badge>
              </div>
              {colValue > 0 && (
                <div
                  className="text-[10px] text-zinc-500 px-1 -mt-1 font-mono"
                  title="Total lifetime value of the leads in this stage"
                >
                  {`Total LTV in stage - ${money(colValue)}`}
                </div>
              )}
              {items.map((l) => (
                <div
                  key={l.id}
                  data-testid={`kanban-card-${l.id}`}
                  draggable
                  onDragStart={() => onDragStart(l.id)}
                  onDragEnd={onDragEnd}
                  onClick={() => navigate(`/leads/${l.id}`)}
                  className="bg-white border border-zinc-200 rounded-lg p-3 hover:border-zinc-400 hover:shadow-sm transition-all cursor-grab active:cursor-grabbing"
                >
                  <div className="text-sm font-semibold text-zinc-900">{l.name}</div>
                  <div className="text-xs text-zinc-400 mb-2">{l.company}</div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-zinc-600">{money(l.monthly_spend)}/mo</span>
                    {l.priority !== "None" && (
                      <Badge className={priorityClass(l.priority)}>{l.priority}</Badge>
                    )}
                  </div>
                  {l.owner_name && (
                    <div className="text-[10px] text-zinc-400 mt-2 uppercase tracking-wider">{l.owner_name}</div>
                  )}
                </div>
              ))}
              {items.length === 0 && (
                <div className="text-xs text-zinc-300 text-center py-6">Drop here</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
