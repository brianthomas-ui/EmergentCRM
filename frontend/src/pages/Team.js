import { useEffect, useState } from "react";
import { toast } from "sonner";
import client, { apiError } from "@/api";
import { money, Badge } from "@/components/helpers";
import Modal, { Field, inputCls, btnPrimary, btnSecondary } from "@/components/Modal";
import { Plus, Shield, User } from "lucide-react";

const empty = { name: "", email: "", password: "", monthly_target: 25000, weekly_target: 6250 };

export default function Team() {
  const [team, setTeam] = useState([]);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState(empty);

  const load = () => client.get("/team").then((r) => setTeam(r.data));
  useEffect(() => { load(); }, []);

  const create = async () => {
    try {
      await client.post("/team", { ...form, monthly_target: Number(form.monthly_target), weekly_target: Number(form.weekly_target) });
      toast.success("Agent added");
      setShow(false);
      setForm(empty);
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tighter text-zinc-900">Team</h1>
          <p className="text-sm text-zinc-500 mt-1">{team.length} members · manage agents & targets</p>
        </div>
        <button className={btnPrimary} onClick={() => setShow(true)} data-testid="add-agent-btn">
          <Plus className="w-4 h-4 inline mr-1.5 -mt-0.5" /> Add Agent
        </button>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {team.map((m) => (
          <div key={m.id} data-testid={`team-card-${m.id}`} className="bg-white border border-zinc-200 rounded-lg p-5">
            <div className="flex items-center gap-3 mb-3">
              <img src={m.avatar_url} alt="" className="w-12 h-12 rounded-lg object-cover border border-zinc-200 bg-zinc-100" />
              <div>
                <div className="font-heading font-bold text-zinc-900">{m.name}</div>
                <div className="text-xs text-zinc-400">{m.email}</div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Badge className={m.role === "admin" ? "bg-zinc-950 text-white border-zinc-950" : "text-zinc-600 border-zinc-200"}>
                {m.role === "admin" ? <Shield className="w-3 h-3 inline mr-1 -mt-0.5" /> : <User className="w-3 h-3 inline mr-1 -mt-0.5" />}
                {m.role === "admin" ? "Sales Leader" : "Agent"}
              </Badge>
              {m.role === "agent" && (
                <span className="text-xs text-zinc-500 font-mono">Target {money(m.monthly_target)}/mo</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <Modal open={show} onClose={() => setShow(false)} title="Add Agent" testid="agent-modal">
        <Field label="Name"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="agent-name" /></Field>
        <Field label="Email"><input className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="agent-email" /></Field>
        <Field label="Password"><input type="password" className={inputCls} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="agent-password" /></Field>
        <div className="grid grid-cols-2 gap-x-4">
          <Field label="Monthly Target ($)"><input type="number" className={inputCls} value={form.monthly_target} onChange={(e) => setForm({ ...form, monthly_target: e.target.value })} /></Field>
          <Field label="Weekly Target ($)"><input type="number" className={inputCls} value={form.weekly_target} onChange={(e) => setForm({ ...form, weekly_target: e.target.value })} /></Field>
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <button className={btnSecondary} onClick={() => setShow(false)}>Cancel</button>
          <button className={btnPrimary} onClick={create} data-testid="save-agent-btn">Add Agent</button>
        </div>
      </Modal>
    </div>
  );
}
