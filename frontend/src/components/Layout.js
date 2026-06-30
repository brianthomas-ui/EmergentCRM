import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useTabs } from "@/context/TabsContext";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useOpen } from "@/hooks/useOpen";
import TabStrip from "@/components/tabs/TabStrip";
import TabHost from "@/components/tabs/TabHost";
import { PAGE_META } from "@/components/tabs/pages.config";
import { tabToPath, specFromLocation } from "@/components/tabs/urls";
import {
  LayoutDashboard,
  Briefcase,
  Users,
  Megaphone,
  CalendarClock,
  Receipt,
  UserCog,
  CreditCard,
  Settings as SettingsIcon,
  ScrollText,
} from "lucide-react";
import { toast } from "sonner";
import client, { apiError } from "@/api";
import Tour from "@/components/Tour";
import { getTourSteps } from "@/components/tour/tourSteps";
import ChangePasswordModal from "@/components/ChangePasswordModal";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import { SidebarNav, SidebarUserCard } from "@/components/layout/SidebarParts";
import { ViewAsPicker } from "@/components/layout/ViewAsPicker";
import GlobalSearch from "@/components/layout/GlobalSearch";
import NotificationBell from "@/components/layout/NotificationBell";
import MobileTopBar from "@/components/layout/MobileTopBar";
import MobileTabBar from "@/components/layout/MobileTabBar";
import MoreSheet from "@/components/layout/MoreSheet";
import { InstallBanner } from "@/components/layout/InstallApp";

export const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, testid: "nav-dashboard", admin: false },
  { to: "/workspace", label: "My Work", icon: Briefcase, testid: "nav-workspace", admin: false },
  { to: "/leads", label: "Leads", icon: Users, testid: "nav-leads", admin: false },
  { to: "/campaigns", label: "Campaigns", icon: Megaphone, testid: "nav-campaigns", admin: true },
  { to: "/meetings", label: "Meetings", icon: CalendarClock, testid: "nav-meetings", admin: false },
  { to: "/deals", label: "Deals", icon: Receipt, testid: "nav-deals", admin: false },
  { to: "/team", label: "Team", icon: UserCog, testid: "nav-team", admin: true },
  { divider: true, label: "Workspace" },
  { to: "/payments", label: "Payments", icon: CreditCard, testid: "nav-payments", admin: false },
  { to: "/settings", label: "Settings", icon: SettingsIcon, testid: "nav-settings", admin: false },
  { to: "/audit", label: "Audit Log", icon: ScrollText, testid: "nav-audit", admin: true },
];

export default function Layout({ children }) {
  const { user, logout, refreshUser, isAdmin, impersonating, stopImpersonation } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const reduce = useReducedMotion();
  const isMobile = useIsMobile();
  const tabsApi = useTabs();
  const openTab = tabsApi?.openTab;
  const setActive = tabsApi?.setActive;
  const closeTab = tabsApi?.closeTab;
  const reopenLast = tabsApi?.reopenLast;
  const { openPage } = useOpen();
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [runTour, setRunTour] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  // Live refs so the sync effects below can read current tabs without re-running
  // on every tab change (which would create a URL<->tab feedback loop).
  const tabsRef = useRef(tabsApi?.tabs);
  const activeIdRef = useRef(tabsApi?.activeId);
  const didTabUrlSync = useRef(false); // skip the first tab->URL run so a deep link wins on load
  tabsRef.current = tabsApi?.tabs;
  activeIdRef.current = tabsApi?.activeId;

  const isBareRoute = location.pathname === "/login" || location.pathname.startsWith("/payment-return");

  // (1) URL -> TAB. A shared/pasted link (or any <Link>/back-button) opens or
  // activates the matching kept-alive tab. Runs only when the URL changes.
  useEffect(() => {
    if (isMobile || !openTab || !setActive) return;
    const spec = specFromLocation(location.pathname, location.search);
    if (!spec) return;
    const existing = (tabsRef.current || []).find((t) => t.key === spec.key);
    if (existing) {
      if (activeIdRef.current !== existing.id) setActive(existing.id);
    } else {
      openTab(spec);
    }
  }, [location.pathname, location.search, isMobile, openTab, setActive]);

  // (2) ACTIVE TAB -> URL. Keep the address bar pointing at the active tab so it
  // is always shareable. Compares by tab KEY (not raw string) so query-param
  // encoding never causes a navigate loop, and never fights effect (1)/bare routes.
  useEffect(() => {
    if (isMobile || isBareRoute) return;
    // On the very first run the URL is authoritative (a shared/deep link must win
    // over the persisted active tab); effect (1) handles it. Skip one tab->URL pass.
    if (!didTabUrlSync.current) {
      didTabUrlSync.current = true;
      return;
    }
    const active = (tabsRef.current || []).find((t) => t.id === tabsApi?.activeId);
    if (!active) return;
    const currentSpec = specFromLocation(location.pathname, location.search);
    if (currentSpec && currentSpec.key === active.key) return; // URL already shows the active tab
    navigate(tabToPath(active));
  }, [tabsApi?.activeId, isMobile, isBareRoute, location.pathname, location.search, navigate]);

  // Keyboard shortcuts (desktop): Ctrl/Cmd+W closes the active tab, Ctrl/Cmd+Shift+T
  // reopens the last closed one. (Some browsers reserve Ctrl+W; best effort.)
  useEffect(() => {
    if (isMobile) return;
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "w") {
        const active = (tabsRef.current || []).find((t) => t.id === activeIdRef.current);
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

  const visibleNavItems = useMemo(
    () => navItems.filter((i) => i.divider || !i.admin || isAdmin),
    [isAdmin]
  );

  const tourSteps = useMemo(() => getTourSteps(isAdmin), [isAdmin]);

  // Pages offered by the tab-strip "+" launcher (admin-aware).
  const launchPages = useMemo(
    () =>
      Object.entries(PAGE_META)
        .filter(([, m]) => !m.admin || isAdmin)
        .map(([page, m]) => ({ page, title: m.title, icon: m.icon, open: () => openPage(page) })),
    [isAdmin, openPage]
  );

  useEffect(() => {
    if (!user) return;
    // Auto-launch the guided tour on first visit (per browser) OR whenever a one-shot
    // "force" flag is set - Demo View sets it so every showcase visitor gets walked through,
    // even on a browser that has already seen the tour.
    let done = false, force = false;
    try {
      force = sessionStorage.getItem("crm_force_tour") === "1";
      done = localStorage.getItem("crm_tour_v2_done") === "1";
    } catch (e) { console.warn("Tour flags read failed:", e); done = true; }
    if (force || !done) setRunTour(true);
    try { sessionStorage.removeItem("crm_force_tour"); } catch (e) { console.warn("Tour flag clear failed:", e); }
  }, [user]);

  const onAvatarUpload = async (dataUrl) => {
    setSavingAvatar(true);
    try {
      if (dataUrl) {
        await client.post("/profile/avatar", { data_url: dataUrl });
      } else {
        await client.delete("/profile/avatar");
      }
      await refreshUser?.();
      toast.success(dataUrl ? "Picture updated" : "Picture removed");
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSavingAvatar(false);
    }
  };

  // Shared profile actions, used by both the desktop sidebar card and the mobile More sheet.
  const onStopImpersonation = async () => {
    try {
      await stopImpersonation();
      toast.success("Back to manager view");
      navigate("/");
    } catch (e) {
      toast.error(apiError(e));
    }
  };
  const onLogout = () => {
    logout();
    navigate("/login");
  };

  // The routed page, with its enter transition. Shared by both shells.
  const page = (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24 text-sm text-[var(--text-muted)]">Loading…</div>
      }
    >
      {/* Keyed remount per route replays the enter transition (app-like page change).
          No AnimatePresence/exit, so it stays robust with react-router and lazy chunks. */}
      <motion.div
        key={location.pathname}
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </motion.div>
    </Suspense>
  );

  // Overlays live outside the shell so the shell's overflow clipping never affects them.
  const overlays = (
    <>
      <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
      <Tour run={runTour} steps={tourSteps} onClose={() => setRunTour(false)} />
    </>
  );

  // ---- Mobile: a fixed-height app shell. Top bar and tab bar are frozen flex
  // siblings; ONLY the middle scrolls, so the bars never move or get hidden, and
  // there is no fixed-over-body-scroll fighting the browser chrome. ----
  if (isMobile) {
    return (
      <>
        <div
          className="flex flex-col h-screen overflow-hidden bg-[var(--bg)]"
          style={{ height: "100dvh" }}
        >
          {/* in-flow on mobile (a frozen row); self-hides when not impersonating */}
          <ImpersonationBanner />

          <MobileTopBar navItems={visibleNavItems} user={user} onOpenMore={() => setMoreOpen(true)} />

          <InstallBanner />

          <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain">
            <div className="px-4 py-5">{page}</div>
          </main>

          <MobileTabBar onOpenMore={() => setMoreOpen(true)} />
        </div>

        <MoreSheet
          open={moreOpen}
          onOpenChange={setMoreOpen}
          navItems={visibleNavItems}
          user={user}
          isAdmin={isAdmin}
          impersonating={impersonating}
          theme={theme}
          onLogout={onLogout}
          onChangePassword={() => setPwOpen(true)}
          onToggleTheme={toggleTheme}
          onTakeTour={() => setRunTour(true)}
          onStopImpersonation={onStopImpersonation}
        />
        {overlays}
      </>
    );
  }

  // ---- Desktop: unchanged. Fixed sidebar + body scroll. ----
  return (
    <>
      <div className="relative min-h-screen bg-[var(--bg)]">
        <aside className="hidden lg:flex w-[272px] bg-[var(--surface-1)] border-r border-[var(--border)] h-screen fixed left-0 top-0 flex-col z-20">
          <div className="px-5 h-16 flex items-center gap-3 border-b border-[var(--border)]">
            <img
              src="/emergent-logo.jpeg"
              alt="Emergent"
              className="w-9 h-9 rounded-lg object-cover ring-1 ring-[var(--border)]"
            />
            <div className="leading-tight">
              <div className="font-heading font-semibold tracking-tight text-sm text-[var(--text)]">Emergent CRM</div>
              <div className="label-mono text-[10px] text-emerald-400/80">Inside Sales</div>
            </div>
          </div>

          <div className="px-3 pt-3 pb-1 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <GlobalSearch />
            </div>
            <NotificationBell />
          </div>

          <SidebarNav items={visibleNavItems} />

          {isAdmin && !impersonating && <ViewAsPicker />}
          <SidebarUserCard
            user={user}
            isAdmin={isAdmin}
            impersonating={impersonating}
            savingAvatar={savingAvatar}
            theme={theme}
            onAvatarUpload={onAvatarUpload}
            onStopImpersonation={onStopImpersonation}
            onLogout={onLogout}
            onChangePassword={() => setPwOpen(true)}
            onToggleTheme={toggleTheme}
            onTakeTour={() => setRunTour(true)}
          />
        </aside>

        <ImpersonationBanner />

        <main className="lg:ml-[272px] min-h-screen relative z-10">
          {impersonating && <div aria-hidden className="h-11" />}
          {location.pathname.startsWith("/payment-return") ? (
            <div className="max-w-[1680px] mx-auto px-5 lg:px-6 py-5 lg:py-6">{page}</div>
          ) : (
            <>
              <TabStrip launchPages={launchPages} topPx={impersonating ? 44 : 0} />
              <div className="max-w-[1680px] mx-auto px-5 lg:px-6 py-5 lg:py-6">
                <TabHost />
              </div>
            </>
          )}
        </main>
      </div>
      {overlays}
    </>
  );
}
