import { useEffect, useState } from "react";
import { toast } from "sonner";
import client, { apiError } from "@/api";
import { timeAgo } from "@/components/helpers";
import { ScrollText } from "lucide-react";

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  useEffect(() => {
    client.get("/audit-logs").then((r) => setLogs(r.data || [])).catch((e) => toast.error(apiError(e)));
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tighter text-zinc-900">Audit Log</h1>
        <p className="text-sm text-zinc-500 mt-1">Admin actions across the workspace</p>
      </div>

      <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-zinc-50 border-b border-zinc-200">
              {["Action", "Actor", "Target", "Details", "When"].map((h) => (
                <th key={h} className="text-xs font-semibold text-zinc-500 uppercase tracking-widest text-left p-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-b border-zinc-100">
                <td className="p-3"><span className="text-xs font-mono font-semibold text-zinc-900 bg-zinc-100 px-2 py-0.5 rounded-lg">{l.action}</span></td>
                <td className="p-3 text-sm text-zinc-700">{l.actor}</td>
                <td className="p-3 text-sm text-zinc-700">{l.target}</td>
                <td className="p-3 text-xs text-zinc-500">{l.details}</td>
                <td className="p-3 text-xs text-zinc-400 font-mono">{timeAgo(l.created_at)}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr><td colSpan={5} className="p-12 text-center text-zinc-400 text-sm">
                <ScrollText className="w-8 h-8 mx-auto mb-2 text-zinc-300" />No actions logged yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
