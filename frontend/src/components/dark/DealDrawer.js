import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Phone,
  Mail,
  Building2,
  Globe,
  Gauge,
  Gift,
  PlayCircle,
  CreditCard,
  CalendarClock,
  ArrowUpRight,
} from "lucide-react";
import client, { apiError } from "@/api";
import {
  money,
  fmtDateTime,
  fmtDate,
  statusAction,
  VISIBLE_STATUSES,
} from "@/components/helpers";
import { Drawer, StatusBadge, ProviderTag, Select, btnEmerald, btnGhost } from "@/components/dark/Primitives";

function Row({ icon: Icon, label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <Icon className="w-4 h-4 text-[var(--text-faint)] shrink-0" />
      <span className="text-xs text-[var(--text-faint)] w-20 shrink-0">{label}</span>
      <span className="text-sm text-[var(--text)] truncate">{value}</span>
    </div>
  );
}

function activityIcon(type) {
  if (type === "payment" || type === "payment_link") return CreditCard;
  if (type === "meeting" || type === "recording") return PlayCircle;
  if (type === "referral") return Gift;
  return CalendarClock;
}

export default function DealDrawer({ leadId, open, onClose, meta, onChanged, onSendLink, onViewLead }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !leadId) {
      setDetail(null);
      return;
    }
    setLoading(true);
    client
      .get(`/leads/${leadId}`)
      .then((r) => setDetail(r.data))
      .catch((e) => toast.error(apiError(e)))
      .finally(() => setLoading(false));
  }, [open, leadId]);

  const lead = detail?.lead;
  const statuses = meta?.statuses || VISIBLE_STATUSES;
  const action = lead ? statusAction(lead.status) : null;

  const refresh = () =>
    client.get(`/leads/${leadId}`).then((r) => setDetail(r.data)).catch(() => {});

  const patch = async (payload, msg) => {
    setBusy(true);
    try {
      await client.put(`/leads/${leadId}`, payload);
      toast.success(msg || "Updated");
      await refresh();
      onChanged?.();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  // Opens the PaymentModal (hosted by the parent) pre-filled with the lead's
  // product line + provider so the rep can set amount + multiplier before sending.
  const sendLink = () => {
    if (onSendLink) {
      onSendLink(lead);
      return;
    }
    onClose?.();
  };

  // Build a unified timeline: activities + payment events + meeting recordings.
  const timeline = [];
  (detail?.activities || []).forEach((a) =>
    timeline.push({ at: a.created_at, type: a.type, text: a.description, actor: a.actor })
  );
  (detail?.payments || []).forEach((p) =>
    timeline.push({
      at: p.created_at,
      type: "payment",
      text: `${p.provider ? p.provider[0].toUpperCase() + p.provider.slice(1) : "Payment"} · ${money(
        p.amount,
        p.currency
      )} · ${p.payment_status}`,
    })
  );
  (detail?.meetings || []).forEach((m) => {
    if (m.summary || m.recording_url) {
      timeline.push({
        at: m.completed_at || m.scheduled_at,
        type: "recording",
        text: m.summary ? `Circleback: ${m.summary}` : "Circleback recording available",
        link: m.recording_url,
      });
    }
  });
  timeline.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));

  return (
    <Drawer
      open={open}
      onClose={onClose}
      testid="deal-drawer"
      title={lead?.name || "Deal"}
      subtitle={lead ? `${lead.company || ""}${lead.product_line ? " · " + lead.product_line : ""}` : ""}
      footer={
        lead && (
          <div className="flex items-center gap-2">
            {action?.kind === "send_link" && (
              <button className={btnEmerald} onClick={sendLink} disabled={busy}>
                {action.label}
              </button>
            )}
            {action?.kind === "mark_paid" && (
              <button className={btnEmerald} onClick={() => patch({ payment_status: "Paid" }, "Marked paid")} disabled={busy}>
                Mark Paid
              </button>
            )}
            {action?.kind === "view_customer" && onViewLead && (
              <button className={btnEmerald} onClick={() => onViewLead(lead.id)}>
                View Customer
              </button>
            )}
            {onViewLead && action?.kind !== "view_customer" && (
              <button className={btnGhost} onClick={() => onViewLead(lead.id)}>
                Open full lead <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )
      }
    >
      {loading || !lead ? (
        <div className="flex items-center justify-center py-16 text-[var(--text-muted)]">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
        </div>
      ) : (
        <div className="space-y-5">
          {/* Status + amount */}
          <div className="flex items-center justify-between">
            <StatusBadge status={lead.status} tone={lead.status_tone} />
            <div className="text-right">
              <div className="text-lg font-semibold text-[var(--text)] tabular-nums">
                {lead.amount ? money(lead.amount, lead.currency) : "—"}
              </div>
              <ProviderTag provider={lead.provider} />
            </div>
          </div>

          {/* Suggested next best action */}
          {action && (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-3.5 py-3">
              <div className="text-[10px] font-mono uppercase tracking-wider text-emerald-300/80 mb-0.5">
                Suggested next action
              </div>
              <div className="text-sm text-[var(--text)]">{lead.next_action || action.label}</div>
            </div>
          )}

          {/* Profile */}
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-2.5">
            <Row icon={Mail} label="Email" value={lead.email} />
            <Row icon={Phone} label="Phone" value={lead.phone} />
            <Row icon={Building2} label="Company" value={lead.company} />
            <Row icon={Globe} label="Region" value={lead.region} />
            <Row icon={Gauge} label="Usage" value={lead.plan || (lead.monthly_spend ? `$${lead.monthly_spend}/mo` : null)} />
            {lead.referred_by_name && <Row icon={Gift} label="Referred by" value={lead.referred_by_name} />}
          </div>

          {/* Stage / outcome / payment (the three-part model) */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] py-2">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-faint)]">Stage</div>
              <div className="text-xs text-[var(--text)] mt-1">{lead.sales_stage || "—"}</div>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] py-2">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-faint)]">Outcome</div>
              <div className="text-xs text-[var(--text)] mt-1">{lead.outcome || "—"}</div>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] py-2">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-faint)]">Payment</div>
              <div className="text-xs text-[var(--text)] mt-1">{lead.payment_state || "—"}</div>
            </div>
          </div>

          {/* Quick status change (inline-editable) */}
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-faint)] mb-1.5">
              Move status
            </div>
            <Select
              value={lead.status}
              onChange={(e) => patch({ stage: e.target.value, payment_status: e.target.value }, `Status → ${e.target.value}`)}
              data-testid="drawer-status-select"
            >
              {statuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          </div>

          {/* Activity timeline */}
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-faint)] mb-2">
              Activity
            </div>
            {timeline.length === 0 ? (
              <div className="text-sm text-[var(--text-faint)] py-2">No activity yet.</div>
            ) : (
              <ol className="relative border-l border-[var(--border)] ml-2 space-y-3">
                {timeline.slice(0, 20).map((t, i) => {
                  const Icon = activityIcon(t.type);
                  return (
                    <li key={i} className="ml-4">
                      <span className="absolute -left-[7px] mt-1 w-3 h-3 rounded-full bg-[var(--surface-3)] border border-[var(--border)] flex items-center justify-center">
                        <Icon className="w-2 h-2 text-[var(--text-faint)]" />
                      </span>
                      <div className="text-sm text-[var(--text)] leading-snug">{t.text}</div>
                      <div className="text-[11px] text-[var(--text-faint)] mt-0.5">
                        {fmtDateTime(t.at)}
                        {t.actor ? ` · ${t.actor}` : ""}
                        {t.link && (
                          <a href={t.link} target="_blank" rel="noreferrer" className="text-emerald-300/80 ml-2 hover:underline">
                            recording
                          </a>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}
