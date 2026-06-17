import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import client, { apiError } from "@/api";
import { Badge, fmtDateTime, BOOKING_DRIVERS } from "@/components/helpers";
import Modal, { Field, inputCls, btnPrimary, btnSecondary } from "@/components/Modal";

const statusBadge = {
  scheduled: "bg-indigo-50 text-indigo-700 border-indigo-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  no_show: "bg-red-50 text-red-700 border-red-200",
  cancelled: "bg-slate-50 text-slate-500 border-slate-200",
};

export default function Meetings() {
  const [meetings, setMeetings] = useState([]);
  const [todayOnly, setTodayOnly] = useState(false);
  const [driverFilter, setDriverFilter] = useState("");
  const [outcomeFor, setOutcomeFor] = useState(null);
  const [form, setForm] = useState({ status: "completed", no_show_reason: "", outcome_notes: "", reschedule_status: "" });

  const load = () => {
    const params = {};
    if (todayOnly) params.today = "true";
    if (driverFilter) params.driver = driverFilter;
    client.get("/meetings", { params }).then((r) => setMeetings(r.data));
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayOnly, driverFilter]);

  const saveOutcome = async () => {
    try {
      await client.put(`/meetings/${outcomeFor.id}/outcome`, form);
      toast.success("Outcome recorded");
      setOutcomeFor(null);
      setForm({ status: "completed", no_show_reason: "", outcome_notes: "", reschedule_status: "" });
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tighter text-slate-900">Meetings</h1>
          <p className="text-sm text-slate-500 mt-1">{meetings.length} meetings · Calendly intake + manual</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)} data-testid="driver-filter" className={`${inputCls} w-auto`}>
            <option value="">All hooks</option>
            {BOOKING_DRIVERS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
            <input type="checkbox" checked={todayOnly} onChange={(e) => setTodayOnly(e.target.checked)} data-testid="today-toggle" />
            Today only
          </label>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {["Lead", "When", "Agent", "Source", "Driver", "Status", ""].map((h) => (
                <th key={h} className="text-xs font-semibold text-slate-500 uppercase tracking-widest text-left p-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {meetings.map((m) => (
              <tr key={m.id} data-testid={`meeting-row-${m.id}`} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="p-3">
                  <Link to={`/leads/${m.lead_id}`} className="text-sm font-semibold text-slate-900 hover:underline">{m.lead_name}</Link>
                </td>
                <td className="p-3 text-sm text-slate-700 font-mono">{fmtDateTime(m.scheduled_at)}</td>
                <td className="p-3 text-sm text-slate-700">{m.agent_name}</td>
                <td className="p-3 text-xs text-slate-500">{m.source}</td>
                <td className="p-3">{m.booking_driver ? <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200">{m.booking_driver}</Badge> : <span className="text-xs text-slate-300">—</span>}</td>
                <td className="p-3"><Badge className={statusBadge[m.status]}>{m.status.replace("_", "-")}</Badge></td>
                <td className="p-3 text-right">
                  {m.status === "scheduled" && (
                    <button
                      onClick={() => setOutcomeFor(m)}
                      data-testid={`outcome-btn-${m.id}`}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                    >
                      Record outcome
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {meetings.length === 0 && (
              <tr><td colSpan={7} className="p-12 text-center text-slate-400 text-sm">No meetings.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={!!outcomeFor} onClose={() => setOutcomeFor(null)} title={`Outcome · ${outcomeFor?.lead_name}`} testid="outcome-modal">
        <Field label="Result">
          <select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} data-testid="outcome-status">
            <option value="completed">Completed</option>
            <option value="no_show">No-show</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </Field>
        {form.status === "no_show" && (
          <>
            <Field label="No-show Reason">
              <input className={inputCls} value={form.no_show_reason} onChange={(e) => setForm({ ...form, no_show_reason: e.target.value })} placeholder="Didn't join, no response…" />
            </Field>
            <Field label="Reschedule Status">
              <select className={inputCls} value={form.reschedule_status} onChange={(e) => setForm({ ...form, reschedule_status: e.target.value })}>
                <option value="">—</option>
                <option value="reschedule_requested">Reschedule requested</option>
                <option value="rescheduled">Rescheduled</option>
                <option value="dropped">Dropped</option>
              </select>
            </Field>
          </>
        )}
        <Field label="Notes">
          <textarea className={`${inputCls} min-h-[80px]`} value={form.outcome_notes} onChange={(e) => setForm({ ...form, outcome_notes: e.target.value })} placeholder="Key discussion points, next steps…" />
        </Field>
        <div className="flex justify-end gap-2 mt-2">
          <button className={btnSecondary} onClick={() => setOutcomeFor(null)}>Cancel</button>
          <button className={btnPrimary} onClick={saveOutcome} data-testid="save-outcome-btn">Save Outcome</button>
        </div>
      </Modal>
    </div>
  );
}
