import { useEffect, useLayoutEffect, useState, useCallback } from "react";
import { X } from "lucide-react";

const PAD = 8;

// Lightweight, dependency-free guided tour. Each step optionally targets a DOM
// element via a CSS selector; steps without a selector render centered.
export default function Tour({ run, steps, onClose }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);

  const step = steps[i];

  const measure = useCallback(() => {
    if (!step) return;
    if (!step.selector) {
      setRect(null);
      return;
    }
    const el = document.querySelector(step.selector);
    if (!el) {
      setRect(null);
      return;
    }
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    setRect(el.getBoundingClientRect());
  }, [step]);

  useLayoutEffect(() => {
    if (!run) return;
    measure();
  }, [run, i, measure]);

  useEffect(() => {
    if (!run) return;
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [run, measure]);

  useEffect(() => {
    if (run) setI(0);
  }, [run]);

  if (!run || !step) return null;

  const finish = () => {
    try { localStorage.setItem("crm_tour_v1_done", "1"); } catch (e) { /* storage blocked */ }
    onClose?.();
  };
  const next = () => (i >= steps.length - 1 ? finish() : setI(i + 1));
  const back = () => setI(Math.max(0, i - 1));

  // Tooltip position: below the target if there is room, else above; centered when no target.
  let cardStyle = { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  if (rect) {
    const below = rect.bottom + 16;
    const placeBelow = below + 180 < window.innerHeight;
    const top = placeBelow ? rect.bottom + 12 : Math.max(12, rect.top - 12);
    const left = Math.min(Math.max(rect.left, 16), window.innerWidth - 340);
    cardStyle = { top, left, transform: placeBelow ? "none" : "translateY(-100%)" };
  }

  return (
    <div className="fixed inset-0 z-[100]" data-testid="tour-overlay">
      {/* Dim overlay with a "hole" around the target via box-shadow */}
      {rect ? (
        <div
          className="absolute rounded-xl ring-2 ring-emerald-400 transition-all duration-300 pointer-events-none"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.65)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/65" />
      )}

      {/* Tooltip card */}
      <div
        className="absolute w-[320px] max-w-[90vw] rounded-xl border border-[var(--border)] bg-[var(--surface-1)] shadow-2xl p-4 animate-fadeIn"
        style={cardStyle}
        data-testid="tour-card"
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-heading text-base font-semibold text-[var(--text)]">{step.title}</h3>
          <button onClick={finish} className="text-[var(--text-faint)] hover:text-[var(--text)]" data-testid="tour-skip" title="Skip tour">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-[var(--text-muted)] mt-1.5 leading-relaxed">{step.body}</p>

        <div className="flex items-center justify-between mt-4">
          <span className="text-[11px] font-mono text-[var(--text-faint)]">{i + 1} / {steps.length}</span>
          <div className="flex items-center gap-2">
            {i > 0 && (
              <button onClick={back} className="px-3 py-1.5 text-xs font-medium rounded-md border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] transition-colors" data-testid="tour-back">
                Back
              </button>
            )}
            <button onClick={next} className="px-3.5 py-1.5 text-xs font-semibold rounded-md bg-emerald-500 text-emerald-950 hover:bg-emerald-400 transition-colors" data-testid="tour-next">
              {i >= steps.length - 1 ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
