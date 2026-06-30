import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { Copy, ExternalLink, Loader2 } from "lucide-react";
import client from "@/api";
import { Card } from "@/components/dark/Primitives";
import { money, Badge, paymentStatusClass, fmtDateTime } from "@/components/helpers";
import { useOpen } from "@/hooks/useOpen";

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-[var(--border)] last:border-0">
      <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-faint)] pt-0.5 shrink-0">{label}</span>
      <span className="text-sm text-[var(--text)] text-right break-words">{children}</span>
    </div>
  );
}

export default function PaymentView({ payment, paymentId }) {
  const params = useParams();
  const id = paymentId || payment?.id || params.id;
  const { openLead } = useOpen();
  const [fetched, setFetched] = useState(null); // null=loading, false=not found, obj=loaded
  const p = payment || fetched;

  useEffect(() => {
    if (payment || !id) return;
    let live = true;
    setFetched(null);
    client
      .get(`/payments/id/${id}`)
      .then((r) => live && setFetched(r.data))
      .catch(() => live && setFetched(false));
    return () => {
      live = false;
    };
  }, [id, payment]);

  if (!payment && fetched === null) {
    return (
      <div className="flex items-center gap-2 text-[var(--text-faint)] text-sm py-16 justify-center" data-testid="payment-view">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading payment…
      </div>
    );
  }
  if (!p) {
    return <div className="p-8 text-sm text-[var(--text-faint)]" data-testid="payment-view">This payment is no longer available, or you don't have access to it.</div>;
  }
  const paid = p.payment_status === "paid";
  const paidAt = p.paid_at || (paid ? p.updated_at : null);

  return (
    <div className="flex flex-col gap-5" data-testid="payment-view">
      <div>
        <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-emerald-400/80">Payment</div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-[var(--text)] mt-0.5">
          {p.lead_name || p.customer_email || "Standalone payment"}
        </h1>
      </div>

      <Card className="p-5 flex flex-col gap-5 max-w-3xl">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-3xl font-semibold tracking-tight text-[var(--text)] font-mono tabular-nums">{money(p.amount, p.currency)}</div>
            {p.currency !== "usd" && <div className="text-xs text-[var(--text-faint)] font-mono">≈ {money(p.amount_usd ?? p.amount)}</div>}
          </div>
          <Badge className={paymentStatusClass(p.payment_status)}>{p.payment_status}</Badge>
        </div>

        {p.payment_link && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
            <div className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-faint)] mb-1.5">Payment link</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs text-[var(--text-muted)] truncate">{p.payment_link}</code>
              <button
                onClick={() => { navigator.clipboard?.writeText(p.payment_link); toast.success("Copied"); }}
                data-testid="payment-copy-link"
                className="text-[var(--text-faint)] hover:text-[var(--text)] shrink-0"
                title="Copy link"
              >
                <Copy className="w-4 h-4" />
              </button>
              <a href={p.payment_link} target="_blank" rel="noreferrer" className="text-[var(--text-faint)] hover:text-[var(--text)] shrink-0" title="Open link">
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-x-8">
          <div>
            <Row label="Provider"><span className="capitalize">{p.provider}</span></Row>
            <Row label="Product">{p.product_line || "-"}</Row>
            <Row label="Description">{p.description || "-"}</Row>
            <Row label="Customer">
              {p.lead_id ? (
                <button onClick={() => openLead(p.lead_id, p.lead_name)} className="text-emerald-300 hover:text-emerald-200 transition-colors">
                  {p.lead_name || "View lead"}
                </button>
              ) : (
                p.customer_email || p.lead_name || "Standalone"
              )}
            </Row>
          </div>
          <div>
            <Row label="Sent">{fmtDateTime(p.created_at)}</Row>
            <Row label="Paid">{paid ? fmtDateTime(paidAt) : <span className="text-[var(--text-faint)]">Not yet</span>}</Row>
            <Row label="Agent">{p.agent_name || "-"}</Row>
            <Row label="Session"><code className="text-xs text-[var(--text-faint)]">{p.session_id || "-"}</code></Row>
          </div>
        </div>
      </Card>
    </div>
  );
}
