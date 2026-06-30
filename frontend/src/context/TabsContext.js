import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

// Browser-style multi-tab workspace state. Tabs are kept ALIVE (mounted) so
// scroll/filters persist when switching. Persisted to localStorage so a refresh
// restores the open set.
const LS_KEY = "crm_tabs_v1";

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

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY));
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
  const [state, setState] = useState(load);
  const { tabs, activeId } = state;

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("tabs persist failed:", e);
    }
  }, [state]);

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
