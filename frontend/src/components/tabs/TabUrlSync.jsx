import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useTabs } from "@/context/TabsContext";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { tabToPath, specFromLocation } from "@/components/tabs/urls";

// Keeps the desktop tab system and the address bar in sync, in BOTH directions,
// so every open tab has a shareable URL and a pasted/deep link reconstructs the
// matching tab. Mounted ONCE as a sibling of <Routes> (it never remounts on route
// changes), so its refs stay stable and the sync can't oscillate.
//
// "What changed" detection (URL vs active tab) decides direction:
//   - URL changed  -> URL wins: open/activate the tab the URL points to.
//   - active tab changed (no URL change) -> push the active tab's URL.
// Also hosts the browser-style keyboard shortcuts.
export default function TabUrlSync() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();
  const tabsApi = useTabs();
  const { tabs, activeId, ready, openTab, setActive, closeTab, reopenLast } = tabsApi || {};

  const authed = !!user && user !== false;
  const isBare = location.pathname === "/login" || location.pathname.startsWith("/payment-return");
  const enabled = authed && ready && !isMobile && !isBare && !!openTab;

  const tabsRef = useRef(tabs);
  const activeRef = useRef(activeId);
  tabsRef.current = tabs;
  activeRef.current = activeId;

  // prevLoc starts as a sentinel (null) so the FIRST enabled run treats the URL as
  // changed and honors a deep link. We intentionally do NOT touch the prevs while
  // disabled, so re-enabling (after auth/bare route) still sees the URL as changed.
  const prevLoc = useRef(null);
  const prevActive = useRef(null);

  useEffect(() => {
    if (!enabled) return;
    const loc = location.pathname + location.search;
    const locChanged = loc !== prevLoc.current;
    const activeChanged = activeId !== prevActive.current;
    prevLoc.current = loc;
    prevActive.current = activeId;

    if (locChanged) {
      // URL -> tab (URL is authoritative on any navigation / deep link)
      const spec = specFromLocation(location.pathname, location.search);
      if (!spec) return;
      const existing = (tabsRef.current || []).find((t) => t.key === spec.key);
      if (existing) {
        if (activeRef.current !== existing.id) setActive(existing.id);
      } else {
        openTab(spec);
      }
      return;
    }
    if (activeChanged) {
      // tab -> URL (user switched/opened a tab without a URL change)
      const active = (tabsRef.current || []).find((t) => t.id === activeId);
      if (!active) return;
      const cur = specFromLocation(location.pathname, location.search);
      if (cur && cur.key === active.key) return; // URL already matches
      navigate(tabToPath(active));
    }
  }, [enabled, location.pathname, location.search, activeId, openTab, setActive, navigate]);

  // Browser-style shortcuts: Ctrl/Cmd+W closes the active tab, Ctrl/Cmd+Shift+T
  // reopens the last-closed tab. (Ctrl+W is reserved by some browsers — best effort.)
  useEffect(() => {
    if (isMobile) return;
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "w") {
        const active = (tabsRef.current || []).find((t) => t.id === activeRef.current);
        if (active && !active.pinned) {
          e.preventDefault();
          closeTab?.(active.id);
        }
      } else if (k === "t" && e.shiftKey) {
        e.preventDefault();
        reopenLast?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isMobile, closeTab, reopenLast]);

  return null;
}
