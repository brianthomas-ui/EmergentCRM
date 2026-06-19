import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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

const navItems = [
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
  const { user, logout, refreshUser, isAdmin, impersonating } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [runTour, setRunTour] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);

  const visibleNavItems = useMemo(
    () => navItems.filter((i) => i.divider || !i.admin || isAdmin),
    [isAdmin]
  );

  const tourSteps = useMemo(() => getTourSteps(isAdmin), [isAdmin]);

  useEffect(() => {
    if (!user) return;
    let done = false;
    try { done = localStorage.getItem("crm_tour_v2_done") === "1"; } catch (e) { done = true; }
    if (!done) setRunTour(true);
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

  return (
    <div className="relative min-h-screen bg-[var(--bg)]">
      <aside className="w-[272px] bg-[var(--surface-1)] border-r border-[var(--border)] h-screen fixed left-0 top-0 flex flex-col z-20">
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
          savingAvatar={savingAvatar}
          theme={theme}
          onAvatarUpload={onAvatarUpload}
          onLogout={() => {
            logout();
            navigate("/login");
          }}
          onChangePassword={() => setPwOpen(true)}
          onToggleTheme={toggleTheme}
          onTakeTour={() => setRunTour(true)}
        />
      </aside>

      <main className="ml-[272px] min-h-screen relative z-10">
        <ImpersonationBanner />
        <div className="max-w-[1680px] mx-auto px-6 py-6 md:px-8 md:py-8">{children}</div>
      </main>

      <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
      <Tour run={runTour} steps={tourSteps} onClose={() => setRunTour(false)} />
    </div>
  );
}
