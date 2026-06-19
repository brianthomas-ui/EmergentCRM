import { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
  LayoutDashboard,
  Users,
  Megaphone,
  CalendarClock,
  Receipt,
  UserCog,
  CreditCard,
  ScrollText,
  LogOut,
  KeyRound,
  Compass,
} from "lucide-react";
import { toast } from "sonner";
import client, { apiError } from "@/api";
import { AvatarUpload } from "@/components/dark/Avatar";
import Tour from "@/components/Tour";
import ChangePasswordModal from "@/components/ChangePasswordModal";

// Order matches the dark mockup: Dashboard, Leads, Campaigns, Meetings, Deals,
// Team, then secondary (Payments, Audit) lower in the list. The Meetings tab
// now contains the calendar, so there is no separate Calendar item, and
// Coverage has been removed from the nav.
const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, testid: "nav-dashboard", admin: false },
  { to: "/leads", label: "Leads", icon: Users, testid: "nav-leads", admin: false },
  { to: "/campaigns", label: "Campaigns", icon: Megaphone, testid: "nav-campaigns", admin: true },
  { to: "/meetings", label: "Meetings", icon: CalendarClock, testid: "nav-meetings", admin: false },
  { to: "/deals", label: "Deals", icon: Receipt, testid: "nav-deals", admin: false },
  { to: "/team", label: "Team", icon: UserCog, testid: "nav-team", admin: true },
  { divider: true, label: "Workspace" },
  { to: "/payments", label: "Payments", icon: CreditCard, testid: "nav-payments", admin: false },
  { to: "/audit", label: "Audit Log", icon: ScrollText, testid: "nav-audit", admin: true },
];

export default function Layout({ children }) {
  const { user, logout, refreshUser, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [runTour, setRunTour] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);

  // Guided tour steps. Targets reference the always-present sidebar nav (by test id).
  const tourSteps = useMemo(() => {
    const steps = [
      { title: "Welcome to Emergent CRM 👋", body: "Here's a quick 60-second tour of everything you can do. You can replay it any time from the sidebar." },
      { selector: '[data-testid="nav-dashboard"]', title: "Dashboard", body: "Your revenue, pipeline health and team performance at a glance — filterable by time period." },
      { selector: '[data-testid="nav-leads"]', title: "Leads", body: "Capture and qualify prospects. Open any lead for full details, notes, tasks and activity history." },
      { selector: '[data-testid="nav-meetings"]', title: "Meetings", body: "A calendar of every booking. Open a meeting to mark it as Show / No-Show, reschedule it, or jump to the lead." },
      { selector: '[data-testid="nav-deals"]', title: "Deals", body: "Your pipeline as a fast, filterable table. Open a deal to move its status and send payment links." },
    ];
    if (isAdmin) {
      steps.push({ selector: '[data-testid="nav-campaigns"]', title: "Campaigns", body: "Build outreach segments, track performance, and send mail-merge campaigns." });
      steps.push({ selector: '[data-testid="nav-team"]', title: "Team", body: "Manage agents, targets and the leaderboard. Reset avatars and review workload." });
    }
    steps.push({ selector: '[data-testid="nav-payments"]', title: "Payments", body: "Every payment link and all revenue in USD. Hit 'New Payment Link' to create a custom link for any lead." });
    steps.push({ selector: '[data-tour="user-card"]', title: "Your profile", body: "Update your photo, change your password, or replay this tour any time from here." });
    steps.push({ title: "You're all set 🎉", body: "That's the whole CRM. Jump in — and remember you can restart this tour from the sidebar whenever you need it." });
    return steps;
  }, [isAdmin]);

  // Auto-start the tour once per browser for first-time users.
  useEffect(() => {
    if (!user) return;
    let done = false;
    try { done = localStorage.getItem("crm_tour_v1_done") === "1"; } catch (e) { done = true; }
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
      {/* Sidebar */}
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

        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {navItems
            .filter((i) => i.divider || !i.admin || isAdmin)
            .map((item, idx) => {
              if (item.divider) {
                return (
                  <div
                    key={`div-${idx}`}
                    className="px-3.5 pt-4 pb-1.5 text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--text-faint)]"
                  >
                    {item.label}
                  </div>
                );
              }
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  data-testid={item.testid}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                        : "text-[var(--text-muted)] border border-transparent hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon className={`w-4 h-4 ${isActive ? "text-emerald-400" : ""}`} strokeWidth={2} />
                      {item.label}
                    </>
                  )}
                </NavLink>
              );
            })}
        </nav>

        <div className="p-3 border-t border-[var(--border)]">
          <div data-tour="user-card" className="flex items-center gap-3 px-2.5 py-2.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)]">
            <AvatarUpload
              src={user?.avatar_url}
              name={user?.name || user?.email}
              size="md"
              disabled={savingAvatar}
              onUpload={onAvatarUpload}
            />
            <div className="flex-1 min-w-0 leading-tight">
              <div className="text-sm font-semibold text-[var(--text)] truncate" data-testid="current-user-name">
                {user?.name}
              </div>
              <div className="text-[11px] text-[var(--text-faint)] truncate">{user?.email}</div>
            </div>
            <button
              data-testid="logout-btn"
              onClick={() => {
                logout();
                navigate("/login");
              }}
              className="text-[var(--text-faint)] hover:text-rose-400 hover:bg-[var(--surface-3)] rounded-md p-1.5 transition-colors"
              title="Log out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          {/* Quick account actions */}
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <button
              onClick={() => setPwOpen(true)}
              data-testid="change-password-btn"
              className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-medium text-[var(--text-muted)] border border-[var(--border)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors"
            >
              <KeyRound className="w-3.5 h-3.5" /> Password
            </button>
            <button
              onClick={() => setRunTour(true)}
              data-testid="take-tour-btn"
              className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-medium text-[var(--text-muted)] border border-[var(--border)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors"
            >
              <Compass className="w-3.5 h-3.5" /> Take a tour
            </button>
          </div>

          <div className="text-[10px] text-[var(--text-faint)] text-center mt-2 font-mono uppercase tracking-wider">
            {isAdmin ? "Sales Head" : "Agent"}
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="ml-[272px] min-h-screen relative z-10">
        <div className="max-w-[1680px] mx-auto px-6 py-6 md:px-8 md:py-8">{children}</div>
      </main>

      <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
      <Tour run={runTour} steps={tourSteps} onClose={() => setRunTour(false)} />
    </div>
  );
}
