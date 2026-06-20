import { useEffect, useState } from "react";
import { toast } from "sonner";
import client, { apiError } from "@/api";
import { useAuth } from "@/context/AuthContext";
import { Select, btnGhost } from "@/components/dark/Primitives";

// Admin-only owner reassignment + round-robin (C2). Endpoints existed but had no UI.
export default function AssignControl({ lead, onAssigned }) {
  const { isAdmin } = useAuth();
  const [team, setTeam] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isAdmin) {
      client
        .get("/team")
        .then((r) => setTeam((r.data || []).filter((m) => m.role === "agent")))
        .catch(() => {});
    }
  }, [isAdmin]);

  if (!isAdmin) return null;

  const assign = async (agentId) => {
    if (!agentId || agentId === lead.owner_id) return;
    setBusy(true);
    try {
      await client.put(`/leads/${lead.id}/assign`, { agent_id: agentId });
      toast.success("Lead reassigned");
      onAssigned?.();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const roundRobin = async () => {
    setBusy(true);
    try {
      await client.post(`/leads/${lead.id}/round-robin`);
      toast.success("Round-robin assigned");
      onAssigned?.();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2" data-testid="assign-control">
      <Select
        value={lead.owner_id || ""}
        disabled={busy}
        onChange={(e) => assign(e.target.value)}
        data-testid="assign-owner-select"
      >
        <option value="">Unassigned</option>
        {team.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </Select>
      <button
        className={btnGhost}
        disabled={busy || lead.owner_locked}
        onClick={roundRobin}
        data-testid="assign-round-robin"
        title={lead.owner_locked ? "Locked to owner — reassign via the dropdown" : "Round-robin to the next agent"}
      >
        ↻ RR
      </button>
    </div>
  );
}
