import { Suspense, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
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
import MobileTopBar from "@/components/layout/MobileTopBar";
import MobileTabBar from "@/components/layout/MobileTabBar";
import MoreSheet from "@/components/layout/MoreSheet";

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
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [runTour, setRunTour] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const visibleNavItems = useMemo(
    () => navItems.filter((i) => i.divider || !i.admin || isAdmin),
    [isAdmin]
  );

  const tourSteps = useMemo(() => getTourSteps(isAdmin), [isAdmin]);

  useEffect(() => {
    if (!user) return;
    // Auto-launch the guided tour on first visit (per browser) OR whenever a one-shot
    // "force" flag is set - Demo View sets it so every showcase visitor gets walked through,
    // even on a browser that has already seen the tour.
    let done = false, force = false;
    try {
      force = sessionStorage.getItem("crm_force_tour") === "1";
      done = localStorage.getItem("crm_tour_v2_done") === "1";
    } catch (e) { done = true; }
    if (force || !done) setRunTour(true);
    try { sessionStorage.removeItem("crm_force_tour"); } catch (e) { /* storage blocked */ }
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

  return (
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

      {/* Rendered at root (not inside <main>) and fixed, so the exit control always sits
          above page chrome and is reachable at any scroll position / on any page. */}
      <ImpersonationBanner />

      <main className="lg:ml-[272px] min-h-screen relative z-10">
        {impersonating && <div aria-hidden className="h-11" />}

        {/* Mobile-only app chrome: slim top bar in flow, fixed tab bar below. */}
        <MobileTopBar
          navItems={visibleNavItems}
          user={user}
          onOpenMore={() => setMoreOpen(true)}
          impersonating={impersonating}
        />

        <div className="max-w-[1680px] mx-auto px-4 pt-5 sm:px-6 lg:px-8 lg:pt-8 pb-nav lg:pb-8">
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
        </div>
      </main>

      <MobileTabBar onOpenMore={() => setMoreOpen(true)} />
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

      <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
      <Tour run={runTour} steps={tourSteps} onClose={() => setRunTour(false)} />
    </div>
  );
}
