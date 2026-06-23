import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X, Loader2 } from "lucide-react";
import client from "@/api";
import { money } from "@/components/helpers";

// Cross-entity quick search (leads / meetings / payments) backed by GET /api/search.
// `variant="sidebar"` is the always-visible desktop input; `variant="mobile"` is an
// icon that opens a full-screen search overlay.
export default function GlobalSearch({ variant = "sidebar" }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [overlay, setOverlay] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState({ leads: [], meetings: [], payments: [] });
  const boxRef = useRef(null);

  const trimmed = q.trim();
  const hasQuery = trimmed.length >= 2;

  useEffect(() => {
    if (!hasQuery) {
      setResults({ leads: [], meetings: [], payments: [] });
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      client
        .get("/search", { params: { q: trimmed } })
        .then((r) => setResults(r.data || { leads: [], meetings: [], payments: [] }))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [trimmed, hasQuery]);

  useEffect(() => {
    const onDoc = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const total = results.leads.length + results.meetings.length + results.payments.length;

  const go = (path) => {
    setOpen(false);
    setOverlay(false);
    setQ("");
    navigate(path);
  };

  const fmtDate = (iso) => {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    } catch {
      return "";
    }
  };

  const resultsList = useMemo(
    () => (
      <>
        {loading && (
          <div className="px-4 py-3 text-xs text-[var(--text-faint)] flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching…
          </div>
        )}
        {!loading && total === 0 && (
          <div className="px-4 py-4 text-xs text-[var(--text-faint)]" data-testid="search-empty">
            No results for &ldquo;{trimmed}&rdquo;.
          </div>
        )}
        {results.leads.length > 0 && (
          <Group title="Leads">
            {results.leads.map((l) => (
              <ResultRow
                key={l.id}
                testid={`search-lead-${l.id}`}
                title={l.name}
                subtitle={l.company || l.email}
                meta={l.status}
                onClick={() => go(`/leads/${l.id}`)}
              />
            ))}
          </Group>
        )}
        {results.meetings.length > 0 && (
          <Group title="Meetings">
            {results.meetings.map((m) => (
              <ResultRow
                key={m.id}
                testid={`search-meeting-${m.id}`}
                title={m.lead_name}
                subtitle={fmtDate(m.scheduled_at)}
                meta={m.status}
                onClick={() => go(m.lead_id ? `/leads/${m.lead_id}` : "/meetings")}
              />
            ))}
          </Group>
        )}
        {results.payments.length > 0 && (
          <Group title="Payments">
            {results.payments.map((p) => (
              <ResultRow
                key={p.id}
                testid={`search-payment-${p.id}`}
                title={p.lead_name}
                subtitle={money(p.amount_usd || 0, "usd")}
                meta={p.payment_status}
                onClick={() => go(p.lead_id ? `/leads/${p.lead_id}` : "/payments")}
              />
            ))}
          </Group>
        )}
      </>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loading, results, total, trimmed]
  );

  if (variant === "mobile") {
    return (
      <>
        <button
          type="button"
          onClick={() => setOverlay(true)}
          data-testid="mobile-search-btn"
          aria-label="Search"
          className="tap-target rounded-full text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          <Search className="w-5 h-5" />
        </button>
        {overlay && (
          <div className="fixed inset-0 z-[70] bg-[var(--bg)] flex flex-col" data-testid="mobile-search-overlay">
            <div className="pt-safe px-4 py-3 border-b border-[var(--border)] flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-faint)]" />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search leads, meetings, payments…"
                  data-testid="global-search-input"
                  className="w-full bg-[var(--surface-3)] border border-[var(--border)] rounded-lg pl-9 pr-3 py-2.5 text-sm text-[var(--text)] placeholder-[var(--text-faint)] outline-none focus:border-emerald-500/50"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setOverlay(false);
                  setQ("");
                }}
                data-testid="mobile-search-cancel"
                className="text-sm text-[var(--text-muted)] px-1"
              >
                Cancel
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{hasQuery ? resultsList : null}</div>
          </div>
        )}
      </>
    );
  }

  return (
    <div ref={boxRef} className="relative" data-testid="global-search">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-faint)]" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search…"
          data-testid="global-search-input"
          className="w-full bg-[var(--surface-3)] border border-[var(--border)] rounded-lg pl-9 pr-8 py-2 text-sm text-[var(--text)] placeholder-[var(--text-faint)] focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 outline-none transition-colors"
        />
        {q && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              setOpen(false);
            }}
            data-testid="global-search-clear"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)] hover:text-[var(--text)]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {open && hasQuery && (
        <div
          className="absolute left-0 top-full mt-2 w-[360px] max-w-[80vw] max-h-[60vh] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface-1)] shadow-2xl z-50"
          data-testid="global-search-results"
        >
          {resultsList}
        </div>
      )}
    </div>
  );
}

function Group({ title, children }) {
  return (
    <div className="py-1">
      <div className="px-4 pt-2 pb-1 text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--text-faint)]">
        {title}
      </div>
      {children}
    </div>
  );
}

function ResultRow({ title, subtitle, meta, onClick, testid }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      className="w-full text-left px-4 py-2 flex items-center gap-3 hover:bg-[var(--surface-2)] transition-colors"
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-[var(--text)] truncate">{title || "—"}</div>
        {subtitle && <div className="text-[11px] text-[var(--text-faint)] truncate">{subtitle}</div>}
      </div>
      {meta && (
        <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] shrink-0">
          {meta}
        </span>
      )}
    </button>
  );
}
