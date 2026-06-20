import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import client, { apiError } from "@/api";
import {
  LeadContextPanel,
  LeadMeetingsList,
  LeadPaymentsList,
  LeadActivityTimeline,
} from "@/components/lead/LeadPanels";
import { PaymentModal, ReopenModal, MeetingModal } from "@/components/lead/LeadModals";
import {
  NotesPanel,
  TasksPanel,
  OverviewPanel,
  LeadProfileHeader,
} from "@/components/lead/LeadDetailPanels";

const EMPTY_PAY_FORM = {
  provider: "stripe",
  product_line: "Credit Top-Up",
  package_id: "",
  amount: "",
  currency: "usd",
  multiplier: 7.5,
  description: "",
  credits: "",
  boost_credits: "",
};

export default function LeadDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [meta, setMeta] = useState(null);

  const [payModal, setPayModal] = useState(false);
  const [meetModal, setMeetModal] = useState(false);
  const [reopenModal, setReopenModal] = useState(false);
  const [reopenForm, setReopenForm] = useState({ type: "Upsell", reason: "" });
  const [packages, setPackages] = useState({});
  const [payForm, setPayForm] = useState(EMPTY_PAY_FORM);
  const [meetForm, setMeetForm] = useState({ scheduled_at: "", duration: 30, source: "Calendly", booking_driver: "Support" });
  const [fxRate, setFxRate] = useState(85);

  const load = () =>
    client.get(`/leads/${id}`).then((r) => setData(r.data)).catch((e) => toast.error(apiError(e)));

  useEffect(() => {
    load();
    client.get("/meta").then((r) => setMeta(r.data)).catch(() => {});
    client.get("/payments/packages").then((r) => setPackages(r.data)).catch(() => {});
    client.get("/settings").then((r) => setFxRate(r.data.inr_per_usd)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!data) {
    return (
      <div className="flex items-center justify-center py-24 text-[var(--text-faint)] gap-2">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading…
      </div>
    );
  }

  const { lead, activities, meetings, payments } = data;

  const updateField = async (patch, msg) => {
    try {
      await client.put(`/leads/${id}`, patch);
      toast.success(msg || "Updated");
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };
  const updateStage = async (stage) => {
    try {
      await client.put(`/leads/${id}/stage`, { stage });
      toast.success(`Stage → ${stage}`);
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };
  const doReopen = async () => {
    try {
      await client.post(`/leads/${id}/reopen`, reopenForm);
      toast.success(`New ${reopenForm.type} routed to ${lead.owner_name}`);
      setReopenModal(false);
      setReopenForm({ type: "Upsell", reason: "" });
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };
  const createPayment = async () => {
    try {
      const isCredit = (payForm.product_line || "Credit Top-Up") === "Credit Top-Up";
      const body = {
        lead_id: id,
        provider: payForm.provider,
        origin_url: window.location.origin,
        package_id: payForm.package_id || null,
        product_line: payForm.product_line || "Credit Top-Up",
        currency: payForm.currency,
        description: payForm.description || "",
      };
      if (payForm.amount !== "" && payForm.amount != null) body.amount = Number(payForm.amount);
      if (isCredit) {
        const mb = meta?.credit_multiplier || { default: 7.5 };
        const mult = Number(payForm.multiplier) || mb.default;
        body.multiplier = mult;
        if (body.amount) {
          const usd = payForm.currency === "inr" && fxRate ? body.amount / fxRate : body.amount;
          body.credits = Math.round(usd * mult);
        }
      } else {
        if (payForm.credits !== "" && payForm.credits != null) body.credits = Number(payForm.credits);
        if (payForm.boost_credits !== "" && payForm.boost_credits != null) body.boost_credits = Number(payForm.boost_credits);
      }
      const { data: rec } = await client.post("/payments/link", body);
      toast.success("Payment link generated");
      setPayModal(false);
      setPayForm(EMPTY_PAY_FORM);
      load();
      if (rec.payment_link) navigator.clipboard?.writeText(rec.payment_link).catch(() => {});
    } catch (e) {
      toast.error(apiError(e));
    }
  };
  const refreshEmergent = async () => {
    try {
      await client.post(`/leads/${id}/enrich`);
      toast.success("Refreshed from Emergent Users DB");
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };
  const touch = (channel) => client.post(`/leads/${id}/touch`, { channel }).then(load).catch(() => {});
  const emailLead = () => {
    touch("email");
    window.open(`mailto:${lead.email}`, "_blank");
  };
  const whatsappLead = () => {
    const digits = (lead.phone || "").replace(/[^\d]/g, "");
    if (!digits) return;
    touch("whatsapp");
    window.open(`https://wa.me/${digits}`, "_blank");
  };
  const bookMeeting = async () => {
    try {
      await client.post("/meetings", {
        lead_id: id,
        scheduled_at: new Date(meetForm.scheduled_at).toISOString(),
        duration: Number(meetForm.duration),
        source: meetForm.source,
        booking_driver: meetForm.booking_driver,
      });
      toast.success("Meeting booked");
      setMeetModal(false);
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };
  // Won always rides a real paid payment (G5). With an amount, record a Manual
  // payment (received); otherwise open the payment modal to set one.
  const markWon = async () => {
    if (!lead.amount) { setPayModal(true); return; }
    try {
      await client.post(`/payments/link`, {
        lead_id: id, provider: "manual",
        amount: Number(lead.amount), currency: lead.currency || "usd", mark_paid: true,
      });
      toast.success("Payment recorded — deal won");
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const isClosedStage = lead.stage === "Won" || lead.stage === "Lost";
  const statusMeta = meta?.status_meta || {};

  return (
    <div className="flex flex-col gap-4 min-h-0">
      <Link to="/leads" className="inline-flex items-center gap-1.5 text-sm text-[var(--text-faint)] hover:text-[var(--text)] transition-colors w-fit">
        <ArrowLeft className="w-4 h-4" /> Back to Leads
      </Link>

      <LeadProfileHeader
        lead={lead}
        statusMeta={statusMeta}
        isClosedStage={isClosedStage}
        onReopen={() => setReopenModal(true)}
        onEmail={emailLead}
        onWhatsapp={whatsappLead}
        onSchedule={() => setMeetModal(true)}
        onMarkWon={markWon}
        onSendLink={() => setPayModal(true)}
      />

      {/* Body: 3-column grid on large screens */}
      <div className="grid xl:grid-cols-3 gap-4">
        <div className="space-y-4">
          <LeadContextPanel lead={lead} onRefresh={refreshEmergent} />
          <OverviewPanel lead={lead} meta={meta} onUpdate={updateField} onUpdateStage={updateStage} />
        </div>

        <div className="space-y-4">
          <NotesPanel lead={lead} onRefresh={load} />
          <TasksPanel tasks={lead.tasks || []} />
          <LeadMeetingsList meetings={meetings} />
        </div>

        <div className="space-y-4">
          <LeadActivityTimeline activities={activities} />
          <LeadPaymentsList payments={payments} onNewLink={() => setPayModal(true)} />
        </div>
      </div>

      {/* Modals */}
      <PaymentModal
        open={payModal}
        onClose={() => setPayModal(false)}
        payForm={payForm}
        setPayForm={setPayForm}
        packages={packages}
        fxRate={fxRate}
        meta={meta}
        onSubmit={createPayment}
      />
      <ReopenModal
        open={reopenModal}
        onClose={() => setReopenModal(false)}
        ownerName={lead.owner_name}
        reopenForm={reopenForm}
        setReopenForm={setReopenForm}
        onSubmit={doReopen}
      />
      <MeetingModal
        open={meetModal}
        onClose={() => setMeetModal(false)}
        meetForm={meetForm}
        setMeetForm={setMeetForm}
        onSubmit={bookMeeting}
      />
    </div>
  );
}
