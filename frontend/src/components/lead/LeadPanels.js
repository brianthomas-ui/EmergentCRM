// Dark-themed lead panels for LeadDetail page.
import { toast } from "sonner";
import {
  money,
  paymentStatusClass,
  fmtDateTime,
  fmtDate,
  timeAgo,
} from "@/components/helpers";
import {
  Card,
  Table,
  THead,
  TH,
  TR,
  TD,
  StatusBadge,
  ProviderTag,
} from "@/components/dark/Primitives";
import Avatar from "@/components/dark/Avatar";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  Copy,
  RefreshCw,
  CreditCard,
  CalendarDays,
  Gift,
  MessageSquare,
  Phone,
  Mail,
  Video,
  ExternalLink,
  Clock,
} from "lucide-react";

const trendIcon = { rising: TrendingUp, declining: TrendingDown, stable: Minus, steady: Minus };

// ---------------------------------------------------------------------------
// Section heading
// ---------------------------------------------------------------------------
function SectionHead({ children, action }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <span className="text-[11px] font-mono font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]">
        {children}
      </span>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DataRow - icon + label + value
// ---------------------------------------------------------------------------
function DataRow({ icon: Icon, label, value, valueClass = "" }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex items-center gap-2.5 py-1.5 border-b border-[var(--border)] last:border-0">
      <Icon className="w-4 h-4 text-[var(--text-faint)] shrink-0" />
      <span className="text-xs text-[var(--text-faint)] w-24 shrink-0">{label}</span>
      <span className={`text-sm text-[var(--text)] flex-1 truncate ${valueClass}`}>{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Account context panel (dark)
// ---------------------------------------------------------------------------
export function LeadContextPanel({ lead, onRefresh }) {
  const TrendIco = trendIcon[lead.usage_trend] || Minus;
  return (
    <Card className="p-4" data-testid="account-context-panel">
      <SectionHead
        action={
          onRefresh && (
            <button
              onClick={onRefresh}
              data-testid="refresh-emergent-btn"
              className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)] hover:text-emerald-300 transition-colors"
            >
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
          )
        }
      >
        Account Context
      </SectionHead>

      <div className="grid grid-cols-2 gap-3 mb-3">
        {[
          { label: "Plan", value: lead.plan || "-" },
          {
            label: "Monthly Spend",
            value: money(lead.monthly_spend),
            mono: true,
          },
          {
            label: "Lifetime Value",
            value: money(lead.lifetime_value),
            mono: true,
          },
          {
            label: "Usage Trend",
            value: (
              <span className="flex items-center gap-1 capitalize">
                <TrendIco className="w-3.5 h-3.5" />
                {lead.usage_trend || "-"}
              </span>
            ),
          },
        ].map(({ label, value, mono }) => (
          <div key={label}>
            <div className="text-[10px] uppercase tracking-widest text-[var(--text-faint)] font-semibold mb-0.5">
              {label}
            </div>
            <div className={`text-sm font-semibold text-[var(--text)] ${mono ? "font-mono" : ""}`}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {(lead.product_history || []).length > 0 && (
        <div className="border-t border-[var(--border)] pt-3 mb-3">
          <div className="text-[10px] uppercase tracking-widest text-[var(--text-faint)] font-semibold mb-1.5">
            Product History
          </div>
          <div className="flex flex-wrap gap-1.5">
            {lead.product_history.map((p) => (
              <span
                key={p}
                className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-[var(--surface-3)] text-[var(--text-muted)] border border-[var(--border)]"
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-[var(--border)] pt-3 flex items-center justify-between text-xs">
        <span className="text-[var(--text-faint)]">
          Region:{" "}
          <span className="text-[var(--text-muted)] font-medium">{lead.region || "-"}</span>
        </span>
        <span className="text-[var(--text-faint)]">
          Source:{" "}
          <span className="text-[var(--text-muted)] font-medium">{lead.source || "-"}</span>
        </span>
      </div>

      {(lead.total_revenue_usd > 0 || lead.deals_won > 0) && (
        <div
          className="mt-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 flex items-center justify-between"
          data-testid="lifetime-revenue"
        >
          <div>
            <div className="text-[10px] uppercase tracking-widest text-emerald-400 font-semibold">
              Lifetime Revenue
            </div>
            <div className="text-lg font-bold text-emerald-300 font-mono">
              {money(lead.total_revenue_usd)}
            </div>
          </div>
          <div className="text-right text-[11px] text-emerald-400">
            <div>{lead.deals_won || 0} deal{(lead.deals_won || 0) === 1 ? "" : "s"} won</div>
            <div>{lead.upsell_cycles || 0} upsell cycle{(lead.upsell_cycles || 0) === 1 ? "" : "s"}</div>
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Meetings list (dark)
// ---------------------------------------------------------------------------
export function LeadMeetingsList({ meetings }) {
  const statusTone = (s) => {
    if (s === "completed") return "text-emerald-300 border-emerald-500/30 bg-emerald-500/10";
    if (s === "no_show") return "text-rose-300 border-rose-500/30 bg-rose-500/10";
    return "text-sky-300 border-sky-500/30 bg-sky-500/10";
  };
  return (
    <Card className="p-4">
      <SectionHead>Meetings</SectionHead>
      {meetings.length === 0 ? (
        <p className="text-xs text-[var(--text-faint)] py-1">No meetings yet.</p>
      ) : (
        <div className="space-y-2">
          {meetings.map((m) => (
            <div
              key={m.id}
              className="flex items-start justify-between gap-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] p-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-[var(--text)]">
                  {fmtDateTime(m.scheduled_at)}
                </div>
                <div className="text-[11px] text-[var(--text-faint)] mt-0.5">
                  {m.source} · {m.agent_name}
                  {m.booking_driver ? ` · ${m.booking_driver}` : ""}
                </div>
                {m.join_url && (
                  <a
                    href={m.join_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-emerald-300 hover:text-emerald-200 mt-0.5"
                  >
                    <ExternalLink className="w-3 h-3" /> Join
                  </a>
                )}
              </div>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap ${statusTone(
                  m.status
                )}`}
              >
                {(m.status || "").replace("_", "-")}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Payment links table (dark)
// ---------------------------------------------------------------------------
export function LeadPaymentsList({ payments, onNewLink }) {
  const copy = (link) => {
    navigator.clipboard?.writeText(link);
    toast.success("Link copied");
  };
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <span className="text-[11px] font-mono font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]">
          Payment Links
        </span>
        {onNewLink && (
          <button
            onClick={onNewLink}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-300 hover:text-emerald-200 transition-colors"
          >
            <CreditCard className="w-3.5 h-3.5" /> Send Link
          </button>
        )}
      </div>
      {payments.length === 0 ? (
        <p className="text-xs text-[var(--text-faint)] px-4 pb-4">No payment links sent.</p>
      ) : (
        <Table>
          <THead>
            <TH>Amount</TH>
            <TH>Provider</TH>
            <TH>Description</TH>
            <TH>Sent</TH>
            <TH>Status</TH>
            <TH className="w-8" />
          </THead>
          <tbody>
            {payments.map((p) => (
              <TR key={p.id} data-testid={`payment-row-${p.id}`}>
                <TD>
                  <span className="font-mono font-semibold text-[var(--text)]">
                    {money(p.amount, p.currency)}
                  </span>
                </TD>
                <TD>
                  <ProviderTag provider={p.provider} />
                </TD>
                <TD>
                  <span className="text-xs text-[var(--text-muted)] truncate max-w-[180px] block">
                    {p.description || "-"}
                  </span>
                </TD>
                <TD>
                  <span className="text-xs text-[var(--text-faint)]">{fmtDate(p.created_at)}</span>
                </TD>
                <TD>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${paymentStatusClass(
                      p.payment_status
                    )}`}
                  >
                    {p.payment_status}
                  </span>
                </TD>
                <TD align="right">
                  {p.payment_link && (
                    <button
                      onClick={() => copy(p.payment_link)}
                      className="text-[var(--text-faint)] hover:text-[var(--text)] transition-colors"
                      title="Copy link"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  )}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Activity timeline (dark) - including Circleback recordings
// ---------------------------------------------------------------------------
function activityIcon(type) {
  const t = (type || "").toLowerCase();
  if (t.includes("payment")) return CreditCard;
  if (t.includes("meeting") || t.includes("recording") || t.includes("circleback")) return Video;
  if (t.includes("email")) return Mail;
  if (t.includes("call") || t.includes("phone")) return Phone;
  if (t.includes("note")) return MessageSquare;
  if (t.includes("referral")) return Gift;
  if (t.includes("follow")) return Clock;
  return Activity;
}

function activityAccent(type) {
  const t = (type || "").toLowerCase();
  if (t.includes("payment") && t.includes("paid")) return "bg-emerald-400";
  if (t.includes("meeting") || t.includes("recording") || t.includes("circleback"))
    return "bg-sky-400";
  if (t.includes("email")) return "bg-violet-400";
  if (t.includes("call") || t.includes("phone")) return "bg-amber-400";
  if (t.includes("note")) return "bg-slate-400";
  return "bg-slate-500";
}

export function LeadActivityTimeline({ activities }) {
  return (
    <Card className="p-4">
      <SectionHead>Activity Timeline</SectionHead>
      {activities.length === 0 ? (
        <p className="text-xs text-[var(--text-faint)] py-1">No activity yet.</p>
      ) : (
        <div className="relative">
          {/* Vertical rail */}
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-[var(--border)]" />
          <div className="space-y-0">
            {activities.map((a) => {
              const Icon = activityIcon(a.type);
              const dot = activityAccent(a.type);
              const isCircleback =
                (a.type || "").toLowerCase().includes("circleback") ||
                (a.description || "").toLowerCase().includes("circleback");
              return (
                <div key={a.id} className="flex gap-3 pb-4 last:pb-0">
                  <div className="relative shrink-0 flex items-start pt-0.5">
                    <span
                      className={`w-3.5 h-3.5 rounded-full border-2 border-[var(--surface-1)] ${dot} flex items-center justify-center shrink-0`}
                    />
                  </div>
                  <div className="flex-1 min-w-0 pt-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Icon className="w-3.5 h-3.5 text-[var(--text-faint)] shrink-0" />
                        <span className="text-sm text-[var(--text)] leading-snug">
                          {a.description}
                          {isCircleback && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-sky-500/15 text-sky-300 border border-sky-500/25">
                              Circleback
                            </span>
                          )}
                        </span>
                      </div>
                      <span className="text-[10px] text-[var(--text-faint)] whitespace-nowrap shrink-0">
                        {timeAgo(a.created_at)}
                      </span>
                    </div>
                    {a.actor && (
                      <div className="text-[10px] text-[var(--text-faint)] mt-0.5 uppercase tracking-wider">
                        {a.actor}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
