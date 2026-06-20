import { useEffect, useLayoutEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Spotlight, TourCard, tourCardStyle } from "@/components/tour/TourParts";

const PAD = 8;

// Guided tour that walks the user PAGE BY PAGE. Each step may carry a `pagePath`
// (route to visit) and a `selector` (page-level anchor to spotlight). When a step
// targets a different route, the tour navigates there, then polls until the anchor
// mounts before measuring. Steps without a selector render centered.
export default function Tour({ run, steps, onClose }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const pollRef = useRef(null);

  const step = steps[i];

  // Measure the current step's anchor, retrying until it mounts (the target page
  // may still be rendering right after a route change). Centered steps clear rect.
  const measure = useCallback(() => {
    clearInterval(pollRef.current);
    if (!step) return;
    if (!step.selector) {
      setRect(null);
      return;
    }
    let tries = 0;
    const tick = () => {
      const el = document.querySelector(step.selector);
      if (el) {
        clearInterval(pollRef.current);
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        // Allow the smooth scroll to settle before locking the rect.
        setTimeout(() => setRect(el.getBoundingClientRect()), 180);
        return;
      }
      if (++tries > 40) { // ~4s — give up and center the card
        clearInterval(pollRef.current);
        setRect(null);
      }
    };
    tick();
    pollRef.current = setInterval(tick, 100);
  }, [step]);

  // On step change: navigate if needed, then measure.
  useLayoutEffect(() => {
    if (!run || !step) return;
    if (step.pagePath && step.pagePath !== location.pathname) {
      navigate(step.pagePath);
      // measure() will re-run when `location` updates (dependency below).
      return;
    }
    measure();
    return () => clearInterval(pollRef.current);
  }, [run, i, step, location.pathname, navigate, measure]);

  useEffect(() => {
    if (!run) return;
    const onScrollResize = () => {
      if (step?.selector) {
        const el = document.querySelector(step.selector);
        if (el) setRect(el.getBoundingClientRect());
      }
    };
    window.addEventListener("resize", onScrollResize);
    window.addEventListener("scroll", onScrollResize, true);
    return () => {
      window.removeEventListener("resize", onScrollResize);
      window.removeEventListener("scroll", onScrollResize, true);
    };
  }, [run, step]);

  useEffect(() => {
    if (run) setI(0);
  }, [run]);

  useEffect(() => () => clearInterval(pollRef.current), []);

  if (!run || !step) return null;

  const finish = () => {
    clearInterval(pollRef.current);
    try { localStorage.setItem("crm_tour_v2_done", "1"); } catch (e) { /* storage blocked */ }
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
