import { toast } from "sonner";
import {
  money,
  Badge,
  paymentStatusClass,
  fmtDateTime,
  timeAgo,
} from "@/components/helpers";
import { TrendingUp, TrendingDown, Minus, Activity, Copy } from "lucide-react";

const trendIcon = { rising: TrendingUp, declining: TrendingDown, stable: Minus };

export function LeadContextPanel({ lead }) {
  const TrendIco = trendIcon[lead.usage_trend] || Minus;
  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-5" data-testid="account-context-panel">
      <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-4">Account Context</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-400 font-semibold">Plan</div>
          <div className="text-sm font-semibold text-zinc-900 mt-0.5">{lead.plan || "-"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-400 font-semibold">Monthly Spend</div>
          <div className="text-sm font-semibold text-zinc-900 mt-0.5 font-mono">{money(lead.monthly_spend)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-400 font-semibold">Lifetime Value</div>
          <div className="text-sm font-semibold text-zinc-900 mt-0.5 font-mono">{money(lead.lifetime_value)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-400 font-semibold">Usage Trend</div>
          <div className="text-sm font-semibold text-zinc-900 mt-0.5 flex items-center gap-1 capitalize">
            <TrendIco className="w-3.5 h-3.5" /> {lead.usage_trend}
          </div>
        </div>
      </div>
      <div className="mt-4 pt-4 border-t border-zinc-100">
        <div className="text-[10px] uppercase tracking-widest text-zinc-400 font-semibold mb-2">Product History</div>
        <div className="flex flex-wrap gap-1.5">
          {(lead.product_history || []).length ? (
            lead.product_history.map((p) => (
              <Badge key={p} className="bg-zinc-50 text-zinc-600 border-zinc-200">{p}</Badge>
            ))
          ) : (
            <span className="text-xs text-zinc-400">No history</span>
          )}
        </div>
      </div>
      <div className="mt-4 pt-4 border-t border-zinc-100 flex items-center justify-between text-xs">
        <span className="text-zinc-400">Region: <span className="text-zinc-600 font-medium">{lead.region || "-"}</span></span>
        <span className="text-zinc-400">Source: <span className="text-zinc-600 font-medium">{lead.source}</span></span>
      </div>
      {(lead.total_revenue_usd > 0 || lead.deals_won > 0) && (
        <div className="mt-3 rounded-lg bg-emerald-50 border border-emerald-100 p-3 flex items-center justify-between" data-testid="lifetime-revenue">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-emerald-700 font-semibold">Lifetime Revenue</div>
            <div className="text-lg font-bold text-emerald-700 font-mono">{money(lead.total_revenue_usd)}</div>
          </div>
          <div className="text-right text-[11px] text-emerald-700">
            <div>{lead.deals_won || 0} deal{(lead.deals_won || 0) === 1 ? "" : "s"} won</div>
            <div>{lead.upsell_cycles || 0} upsell cycle{(lead.upsell_cycles || 0) === 1 ? "" : "s"}</div>
          </div>
        </div>
      )}
    </div>
  );
}

export function LeadMeetingsList({ meetings }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-5">
      <h3 className="font-heading text-base font-bold tracking-tight text-zinc-900 mb-3">Meetings</h3>
      {meetings.length === 0 ? (
        <div className="text-xs text-zinc-400">No meetings yet.</div>
      ) : (
        <div className="space-y-2">
          {meetings.map((m) => (
            <div key={m.id} className="flex items-center justify-between border border-zinc-100 rounded-lg p-3">
              <div>
                <div className="text-sm text-zinc-900 font-medium">{fmtDateTime(m.scheduled_at)}</div>
                <div className="text-xs text-zinc-400">{m.source} · {m.agent_name}{m.booking_driver ? ` · hook: ${m.booking_driver}` : ""}</div>
              </div>
              <Badge className={
                m.status === "completed" ? "text-emerald-600 border-emerald-200" :
                m.status === "no_show" ? "text-rose-600 border-rose-200" :
                "text-blue-600 border-blue-200"
              }>{m.status.replace("_", "-")}</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function LeadPaymentsList({ payments }) {
  const copy = (link) => {
    navigator.clipboard?.writeText(link);
    toast.success("Link copied");
  };
  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-5">
      <h3 className="font-heading text-base font-bold tracking-tight text-zinc-900 mb-3">Payment Links</h3>
      {payments.length === 0 ? (
        <div className="text-xs text-zinc-400">No payment links sent.</div>
      ) : (
        <div className="space-y-2">
          {payments.map((p) => (
            <div key={p.id} className="flex items-center justify-between border border-zinc-100 rounded-lg p-3" data-testid={`payment-row-${p.id}`}>
              <div>
                <div className="text-sm font-semibold text-zinc-900 font-mono">{money(p.amount, p.currency)} · {p.provider}</div>
                <div className="text-xs text-zinc-400">{p.description}</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={paymentStatusClass(p.payment_status)}>{p.payment_status}</Badge>
                {p.payment_link && (
                  <button onClick={() => copy(p.payment_link)} className="text-zinc-400 hover:text-zinc-900" title="Copy link">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function LeadActivityTimeline({ activities }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-5">
      <h3 className="font-heading text-base font-bold tracking-tight text-zinc-900 mb-3 flex items-center gap-2">
        <Activity className="w-4 h-4 text-zinc-400" /> Activity Timeline
      </h3>
      <div className="space-y-3 max-h-72 overflow-y-auto">
        {activities.map((a) => (
          <div key={a.id} className="flex gap-3">
            <div className="w-1.5 h-1.5 rounded-full bg-zinc-900 mt-1.5 shrink-0" />
            <div className="flex-1">
              <div className="text-sm text-zinc-700">{a.description}</div>
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider">{a.actor} · {timeAgo(a.created_at)}</div>
            </div>
          </div>
        ))}
        {activities.length === 0 && <div className="text-xs text-zinc-400">No activity yet.</div>}
      </div>
    </div>
  );
}
