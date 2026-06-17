import { useEffect, useState } from "react";
import client from "@/api";
import { timeAgo } from "@/components/helpers";
import { ScrollText } from "lucide-react";

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  useEffect(() => { client.get("/audit-logs").then((r) => setLogs(r.data)); }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-3xl font-black tracking-tighter text-slate-900">Audit Log</h1>
        <p className="text-sm text-slate-500 mt-1">Admin actions across the workspace</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {["Action", "Actor", "Target", "Details", "When"].map((h) => (
                <th key={h} className="text-xs font-semibold text-slate-500 uppercase tracking-widest text-left p-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-b border-slate-100">
                <td className="p-3"><span className="text-xs font-mono font-semibold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-sm">{l.action}</span></td>
                <td className="p-3 text-sm text-slate-700">{l.actor}</td>
                <td className="p-3 text-sm text-slate-700">{l.target}</td>
                <td className="p-3 text-xs text-slate-500">{l.details}</td>
                <td className="p-3 text-xs text-slate-400 font-mono">{timeAgo(l.created_at)}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr><td colSpan={5} className="p-12 text-center text-slate-400 text-sm">
                <ScrollText className="w-8 h-8 mx-auto mb-2 text-slate-300" />No actions logged yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
