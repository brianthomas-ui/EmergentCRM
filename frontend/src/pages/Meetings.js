import { useEffect, useState } from "react";
import { toast } from "sonner";
import client, { apiError } from "@/api";
import { MeetingsToolbar, MeetingsTable, OutcomeModal } from "@/components/meetings/MeetingsWidgets";

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
          <h1 className="font-heading text-3xl font-bold tracking-tighter text-zinc-900">Meetings</h1>
          <p className="text-sm text-zinc-500 mt-1">{meetings.length} meetings · Calendly intake + manual</p>
        </div>
        <MeetingsToolbar
          driverFilter={driverFilter}
          setDriverFilter={setDriverFilter}
          todayOnly={todayOnly}
          setTodayOnly={setTodayOnly}
        />
      </div>

      <MeetingsTable meetings={meetings} onRecordOutcome={setOutcomeFor} />

      <OutcomeModal
        meeting={outcomeFor}
        onClose={() => setOutcomeFor(null)}
        form={form}
        setForm={setForm}
        onSave={saveOutcome}
      />
    </div>
  );
}
