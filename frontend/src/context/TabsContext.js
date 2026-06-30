import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";

// Browser-style multi-tab workspace state. Tabs are kept ALIVE (mounted) so
// scroll/filters persist when switching. Persisted to localStorage PER USER so a
// refresh restores the open set AND demo/real workspaces never inherit each
// other's drill/agent/payment tabs (strict tenant isolation).
const LS_PREFIX = "crm_tabs_v1";
const lsKey = (uid) => `${LS_PREFIX}:${uid || "anon"}`;

const HOME = {
  id: "home",
  key: "page:dashboard",
  type: "page",
  params: { page: "dashboard" },
  title: "Dashboard",
  icon: "LayoutDashboard",
  pinned: true,
};

let _seq = 1;
const newId = () => `t${Date.now().toString(36)}${(_seq++).toString(36)}`;

function load(uid) {
  try {
    const raw = JSON.parse(localStorage.getItem(lsKey(uid)));
    if (raw && Array.isArray(raw.tabs) && raw.tabs.length) {
      const tabs = raw.tabs.some((t) => t.pinned) ? raw.tabs : [HOME, ...raw.tabs];
      const activeId = raw.activeId && tabs.find((t) => t.id === raw.activeId) ? raw.activeId : tabs[0].id;
      return { tabs, activeId };
    }
  } catch (e) {
    console.warn("tabs load failed:", e);
  }
  return { tabs: [HOME], activeId: HOME.id };
}

const TabsContext = createContext(null);

export function TabsProvider({ children }) {
  const { user } = useAuth();
  const uid = user?.id || null;
  const [state, setState] = useState(() => load(null));
  const { tabs, activeId } = state;

  // When the signed-in identity changes (login / logout / impersonate), swap to
  // that user's persisted tab set so workspaces stay isolated.
  const uidRef = useRef(undefined);
  useEffect(() => {
    if (uidRef.current === uid) return;
    uidRef.current = uid;
    setState(load(uid));
  }, [uid]);

  useEffect(() => {
    try {
      localStorage.setItem(lsKey(uid), JSON.stringify(state));
    } catch (e) {
      console.warn("tabs persist failed:", e);
    }
  }, [state, uid]);

  // spec: { key, type, params, title, icon, activate? }
  const openTab = useCallback((spec) => {
    setState((s) => {
      const existing = s.tabs.find((t) => t.key === spec.key);
      if (existing) {
        // refresh title/params (e.g. lead renamed) and activate
        const tabs = s.tabs.map((t) =>
          t.id === existing.id ? { ...t, title: spec.title || t.title, params: spec.params || t.params } : t
        );
        return { tabs, activeId: spec.activate === false ? s.activeId : existing.id };
      }
      const tab = { id: newId(), pinned: false, ...spec };
      return { tabs: [...s.tabs, tab], activeId: spec.activate === false ? s.activeId : tab.id };
    });
  }, []);

  const closeTab = useCallback((id) => {
    setState((s) => {
      const tab = s.tabs.find((t) => t.id === id);
      if (!tab || tab.pinned) return s;
      const idx = s.tabs.findIndex((t) => t.id === id);
      const tabs = s.tabs.filter((t) => t.id !== id);
      let activeId = s.activeId;
      if (s.activeId === id) {
        const neighbor = tabs[idx] || tabs[idx - 1] || tabs[0];
        activeId = neighbor ? neighbor.id : null;
      }
      return { tabs, activeId };
    });
  }, []);

  const setActive = useCallback((id) => setState((s) => ({ ...s, activeId: id })), []);

  const reorder = useCallback((fromId, toId) => {
    setState((s) => {
      const from = s.tabs.findIndex((t) => t.id === fromId);
      const to = s.tabs.findIndex((t) => t.id === toId);
      if (from < 0 || to < 0 || from === to) return s;
      const tabs = [...s.tabs];
      const [moved] = tabs.splice(from, 1);
      tabs.splice(to, 0, moved);
      return { ...s, tabs };
    });
  }, []);

  const value = useMemo(
    () => ({ tabs, activeId, openTab, closeTab, setActive, reorder }),
    [tabs, activeId, openTab, closeTab, setActive, reorder]
  );
  return <TabsContext.Provider value={value}>{children}</TabsContext.Provider>;
}

export const useTabs = () => useContext(TabsContext);
