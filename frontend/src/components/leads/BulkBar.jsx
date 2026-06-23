import { useState } from "react";
import { toast } from "sonner";
import { X, Trash2 } from "lucide-react";
import client, { apiError } from "@/api";
import { Select, btnDanger, btnGhost } from "@/components/dark/Primitives";

// Sticky action bar shown when one or more leads are selected in the Leads table.
// Posts to /api/leads/bulk (assign | status | delete). Assign/Delete are admin-only.
export default function BulkBar({ count, ids, statuses, agents, isAdmin, onClear, onDone }) {
  const [busy, setBusy] = useState(false);

  const run = async (action, value) => {
    setBusy(true);
    try {
      const { data } = await client.post("/leads/bulk", { ids, action, value });
      toast.success(
        `${data.updated} lead${data.updated === 1 ? "" : "s"} ${action === "delete" ? "deleted" : "updated"}`
      );
      onDone();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const del = () => {
    if (window.confirm(`Delete ${count} lead${count === 1 ? "" : "s"}? This cannot be undone.`)) run("delete");
  };

  return (
    <div
      className="flex items-center gap-3 flex-wrap rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] px-3 py-2"
      data-testid="bulk-bar"
    >
      <span className="text-sm font-medium text-[var(--text)]" data-testid="bulk-count">
        {count} selected
      </span>
      <div className="h-4 w-px bg-[var(--border)]" />

      {isAdmin && (
        <div className="w-44">
          <Select
            value=""
            disabled={busy}
            onChange={(e) => e.target.value && run("assign", e.target.value)}
            data-testid="bulk-assign"
          >
            <option value="">Assign to…</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>
      )}

      <div className="w-44">
        <Select
          value=""
          disabled={busy}
          onChange={(e) => e.target.value && run("status", e.target.value)}
          data-testid="bulk-status"
        >
          <option value="">Set status…</option>
          {statuses
            .filter((s) => s !== "Payment Link Paid")
            .map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
        </Select>
      </div>

      {isAdmin && (
        <button onClick={del} disabled={busy} className={btnDanger} data-testid="bulk-delete">
          <Trash2 className="w-4 h-4" /> Delete
        </button>
      )}

      <button onClick={onClear} className={`${btnGhost} ml-auto`} data-testid="bulk-clear">
        <X className="w-4 h-4" /> Clear
      </button>
    </div>
  );
}
