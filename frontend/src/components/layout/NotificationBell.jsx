import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Clock, CalendarX } from "lucide-react";
import client from "@/api";
import { timeAgo } from "@/components/helpers";

// Derived alerts for the signed-in user (follow-ups due + no-shows to reschedule)
// from GET /api/notifications. `variant` only controls dropdown anchoring.
export default function NotificationBell({ variant = "sidebar" }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ count: 0, items: [] });
  const boxRef = useRef(null);

  useEffect(() => {
    const load = () =>
      client
        .get("/notifications")
        .then((r) => setData(r.data || { count: 0, items: [] }))
        .catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onDoc = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const go = (item) => {
    setOpen(false);
    if (item.lead_id) navigate(`/leads/${item.lead_id}`);
  };

  const anchor = variant === "mobile" ? "right-0" : "left-0";

  return (
    <div ref={boxRef} className="relative shrink-0" data-testid="notification-bell">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        data-testid="notification-bell-btn"
        aria-label="Notifications"
        className="relative tap-target lg:tap-auto rounded-lg p-2 text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors"
      >
        <Bell className="w-5 h-5" />
        {data.count > 0 && (
          <span
            data-testid="notification-count"
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-emerald-500 text-emerald-950 text-[10px] font-bold leading-4 text-center"
          >
            {data.count > 9 ? "9+" : data.count}
          </span>
        )}
      </button>
      {open && (
        <div
          className={`absolute ${anchor} top-full mt-2 w-[320px] max-w-[88vw] max-h-[60vh] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface-1)] shadow-2xl z-50`}
          data-testid="notification-panel"
        >
          <div className="px-4 py-2.5 border-b border-[var(--border)] flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Notifications
            </span>
            <span className="text-[11px] text-[var(--text-faint)]">{data.count} active</span>
          </div>
          {data.items.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-[var(--text-faint)]" data-testid="notification-empty">
              You&rsquo;re all caught up.
            </div>
          ) : (
            data.items.map((n, i) => {
              const Icon = n.type === "no_show" ? CalendarX : Clock;
              const tone = n.type === "no_show" ? "text-rose-400" : "text-amber-400";
              return (
                <button
                  type="button"
                  key={`${n.type}-${n.lead_id}-${i}`}
                  onClick={() => go(n)}
                  data-testid={`notification-item-${i}`}
                  className="w-full text-left px-4 py-2.5 flex items-start gap-3 hover:bg-[var(--surface-2)] transition-colors border-b border-[var(--border)] last:border-0"
                >
                  <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${tone}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-[var(--text)] truncate">{n.title}</div>
                    {n.subtitle && <div className="text-[11px] text-[var(--text-faint)] truncate">{n.subtitle}</div>}
                  </div>
                  {n.at && <span className="text-[10px] text-[var(--text-faint)] shrink-0">{timeAgo(n.at)}</span>}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
