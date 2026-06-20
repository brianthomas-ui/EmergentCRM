import { X } from "lucide-react";

// Dim overlay with a highlighted "hole" around the target (via a huge box-shadow).
export function Spotlight({ rect, pad }) {
  if (!rect) return <div className="absolute inset-0 bg-black/65" />;
  return (
    <div
      className="absolute rounded-xl ring-2 ring-emerald-400 transition-all duration-300 pointer-events-none"
      style={{
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
        boxShadow: "0 0 0 9999px rgba(0,0,0,0.65)",
      }}
    />
  );
}

// The tooltip card: title, body, step counter and Back / Next (or Finish) controls.
export function TourCard({ step, index, total, style, onBack, onNext, onFinish }) {
  const isLast = index >= total - 1;
  return (
    <div
      className="absolute w-[320px] max-w-[90vw] rounded-xl border border-[var(--border)] bg-[var(--surface-1)] shadow-2xl p-4 animate-fadeIn"
      style={style}
      data-testid="tour-card"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-heading text-base font-semibold text-[var(--text)]">{step.title}</h3>
        <button onClick={onFinish} className="text-[var(--text-faint)] hover:text-[var(--text)]" data-testid="tour-skip" title="Skip tour">
          <X className="w-4 h-4" />
        </button>
      </div>
      <p className="text-sm text-[var(--text-muted)] mt-1.5 leading-relaxed">{step.body}</p>

      <div className="flex items-center justify-between mt-4">
        <span className="text-[11px] font-mono text-[var(--text-faint)]">{index + 1} / {total}</span>
        <div className="flex items-center gap-2">
          {index > 0 && (
            <button onClick={onBack} className="px-3 py-1.5 text-xs font-medium rounded-md border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] transition-colors" data-testid="tour-back">
              Back
            </button>
          )}
          <button onClick={onNext} className="px-3.5 py-1.5 text-xs font-semibold rounded-md bg-emerald-500 text-emerald-950 hover:bg-emerald-400 transition-colors" data-testid="tour-next">
            {isLast ? "Finish" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Where to place the tooltip card relative to the spotlighted target.
export function tourCardStyle(rect) {
  if (!rect) return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  const placeBelow = rect.bottom + 16 + 180 < window.innerHeight;
  const top = placeBelow ? rect.bottom + 12 : Math.max(12, rect.top - 12);
  const left = Math.min(Math.max(rect.left, 16), window.innerWidth - 340);
  return { top, left, transform: placeBelow ? "none" : "translateY(-100%)" };
}
