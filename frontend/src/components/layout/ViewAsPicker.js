import { useEffect, useState } from "react";
import { Eye } from "lucide-react";
import client, { apiError } from "@/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

// Admin-only "view as agent" picker. Selecting an agent swaps the session to
// that agent so the manager sees the CRM exactly as that rep does.
export function ViewAsPicker() {
  const { startImpersonation } = useAuth();
  const [agents, setAgents] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    client
      .get("/team")
      .then((r) => setAgents((r.data || []).filter((u) => u.role === "agent")))
      .catch(() => {});
  }, []);

  const onPick = async (e) => {
    const id = e.target.value;
    if (!id) return;
    setBusy(true);
    try {
      await startImpersonation(id);
      toast.success("Now viewing as agent");
    } catch (err) {
      toast.error(apiError(err));
      setBusy(false);
    }
  };

  return (
    <div data-tour="view-as" className="px-3 pb-3">
      <label className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--text-faint)] mb-1.5">
        <Eye className="w-3 h-3" /> View as agent
      </label>
      <select
        data-testid="view-as-select"
        disabled={busy}
        defaultValue=""
        onChange={onPick}
        className="w-full text-xs rounded-md border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] px-2.5 py-2 outline-none focus:border-emerald-500/40 transition-colors"
      >
        <option value="">Manager view (you)</option>
        {agents.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>
    </div>
  );
}
