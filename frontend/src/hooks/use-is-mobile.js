import { useEffect, useState } from "react";

// Phone breakpoint mirrors Tailwind's `lg` (1024px), the app's desktop divide.
// Used to mount only ONE branch (card list vs table, day vs week) so phones never
// build a heavy desktop DOM.
const MOBILE_QUERY = "(max-width: 1023.98px)";

function read(query, fallback) {
  if (typeof window === "undefined" || !window.matchMedia) return fallback;
  return window.matchMedia(query).matches;
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => read(MOBILE_QUERY, false));
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mql = window.matchMedia(MOBILE_QUERY);
    const onChange = (e) => setIsMobile(e.matches);
    setIsMobile(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return isMobile;
}

// True when launched from the home screen (installed PWA), so we can adjust insets
// and hide install hints.
export function useIsStandalone() {
  const [standalone, setStandalone] = useState(() =>
    read("(display-mode: standalone)", false) ||
    (typeof window !== "undefined" && window.navigator && window.navigator.standalone === true)
  );
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mql = window.matchMedia("(display-mode: standalone)");
    const onChange = (e) => setStandalone(e.matches || window.navigator.standalone === true);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return standalone;
}

export default useIsMobile;
