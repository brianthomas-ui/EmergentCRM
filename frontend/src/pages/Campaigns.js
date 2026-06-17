import { useEffect, useState } from "react";
import { toast } from "sonner";
import client, { apiError } from "@/api";
import { Badge } from "@/components/helpers";
import Modal, { Field, inputCls, btnPrimary, btnSecondary } from "@/components/Modal";
import { Plus, Send, Mail, MousePointerClick, MessageSquare, CalendarCheck } from "lucide-react";

const empty = {
  name: "",
  segment_label: "High spend power users",
  min_spend: 100,
  template_subject: "Ready to scale beyond your current plan?",
  template_body: "Hi {{name}},\n\nWe noticed your team is getting great value from {{plan}}. Let's chat about unlocking higher limits and priority support.\n\nBook 20 minutes here: [Calendly link]\n\nBest,\nEmergent Labs",
};

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState(empty);

  const load = () => client.get("/campaigns").then((r) => setCampaigns(r.data));
  useEffect(() => { load(); }, []);

  const create = async () => {
    try {
      await client.post("/campaigns", { ...form, min_spend: Number(form.min_spend) });
      toast.success("Campaign created");
      setShow(false);
      setForm(empty);
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const send = async (id) => {
    try {
      await client.post(`/campaigns/${id}/send`);
      toast.success("Mail-merge sent via Gmail");
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tighter text-slate-900">Campaigns</h1>
          <p className="text-sm text-slate-500 mt-1">Segmented Gmail mail-merge outreach to existing users</p>
        </div>
        <button className={btnPrimary} onClick={() => setShow(true)} data-testid="new-campaign-btn">
          <Plus className="w-4 h-4 inline mr-1.5 -mt-0.5" /> New Campaign
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {campaigns.map((c) => (
          <div key={c.id} data-testid={`campaign-${c.id}`} className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h3 className="font-heading text-base font-bold text-slate-900">{c.name}</h3>
                <div className="text-xs text-slate-400">{c.segment_label} · spend ≥ ${c.min_spend}</div>
              </div>
              <Badge className={c.status === "sent" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-600 border-slate-200"}>{c.status}</Badge>
            </div>
            <div className="text-sm text-slate-600 mb-3 truncate">{c.template_subject}</div>
            <div className="grid grid-cols-4 gap-2 mb-3">
              <Metric icon={Mail} label="Sent" value={c.sent_count} />
              <Metric icon={MousePointerClick} label="Opened" value={c.opened_count} />
              <Metric icon={MessageSquare} label="Replied" value={c.replied_count} />
              <Metric icon={CalendarCheck} label="Booked" value={c.booked_count} />
            </div>
            {c.status !== "sent" ? (
              <button className={`${btnPrimary} w-full`} onClick={() => send(c.id)} data-testid={`send-campaign-${c.id}`}>
                <Send className="w-4 h-4 inline mr-1.5 -mt-0.5" /> Send to {c.recipient_count} users
              </button>
            ) : (
              <div className="text-xs text-slate-400 text-center">Sent · {c.recipient_count} recipients</div>
            )}
          </div>
        ))}
        {campaigns.length === 0 && (
          <div className="col-span-2 bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 text-sm">
            No campaigns yet. Create your first segment.
          </div>
        )}
      </div>

      <Modal open={show} onClose={() => setShow(false)} title="New Campaign" testid="campaign-modal" wide>
        <Field label="Campaign Name"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="campaign-name" placeholder="Q3 Power User Outreach" /></Field>
        <div className="grid grid-cols-2 gap-x-4">
          <Field label="Segment Label"><input className={inputCls} value={form.segment_label} onChange={(e) => setForm({ ...form, segment_label: e.target.value })} /></Field>
          <Field label="Min Monthly Spend ($)"><input type="number" className={inputCls} value={form.min_spend} onChange={(e) => setForm({ ...form, min_spend: e.target.value })} data-testid="campaign-minspend" /></Field>
        </div>
        <Field label="Email Subject"><input className={inputCls} value={form.template_subject} onChange={(e) => setForm({ ...form, template_subject: e.target.value })} /></Field>
        <Field label="Email Body (supports {{name}}, {{plan}})">
          <textarea className={`${inputCls} min-h-[140px] font-mono text-xs`} value={form.template_body} onChange={(e) => setForm({ ...form, template_body: e.target.value })} />
        </Field>
        <div className="flex justify-end gap-2 mt-2">
          <button className={btnSecondary} onClick={() => setShow(false)}>Cancel</button>
          <button className={btnPrimary} onClick={create} data-testid="save-campaign-btn">Create Campaign</button>
        </div>
      </Modal>
    </div>
  );
}

function Metric({ icon: Icon, label, value }) {
  return (
    <div className="border border-slate-100 rounded-xl p-2 text-center">
      <Icon className="w-3.5 h-3.5 text-slate-400 mx-auto mb-1" />
      <div className="text-sm font-bold text-slate-900 font-mono">{value}</div>
      <div className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">{label}</div>
    </div>
  );
}
