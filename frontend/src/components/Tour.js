import { useEffect, useLayoutEffect, useState, useCallback } from "react";
import { Spotlight, TourCard, tourCardStyle } from "@/components/tour/TourParts";

const PAD = 8;

// Lightweight, dependency-free guided tour. Each step optionally targets a DOM
// element via a CSS selector; steps without a selector render centered.
export default function Tour({ run, steps, onClose }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);

  const step = steps[i];

  const measure = useCallback(() => {
    if (!step || !step.selector) {
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

  return (
    <div className="fixed inset-0 z-[100]" data-testid="tour-overlay">
      <Spotlight rect={rect} pad={PAD} />
      <TourCard
        step={step}
        index={i}
        total={steps.length}
        style={tourCardStyle(rect)}
        onBack={back}
        onNext={next}
        onFinish={finish}
      />
    </div>
  );
}
