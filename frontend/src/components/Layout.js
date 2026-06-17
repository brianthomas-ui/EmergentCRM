import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import BackgroundTexture from "@/components/BackgroundTexture";
import {
  LayoutDashboard,
  Users,
  KanbanSquare,
  CalendarClock,
  CreditCard,
  Megaphone,
  UserCog,
  ScrollText,
  LogOut,
  Target,
} from "lucide-react";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, testid: "nav-dashboard", admin: false },
  { to: "/leads", label: "Leads", icon: Users, testid: "nav-leads", admin: false },
  { to: "/pipeline", label: "Pipeline", icon: KanbanSquare, testid: "nav-pipeline", admin: false },
  { to: "/meetings", label: "Meetings", icon: CalendarClock, testid: "nav-meetings", admin: false },
  { to: "/payments", label: "Payments", icon: CreditCard, testid: "nav-payments", admin: false },
  { to: "/coverage", label: "Coverage", icon: Target, testid: "nav-coverage", admin: true },
  { to: "/campaigns", label: "Campaigns", icon: Megaphone, testid: "nav-campaigns", admin: true },
  { to: "/team", label: "Team", icon: UserCog, testid: "nav-team", admin: true },
  { to: "/audit", label: "Audit Log", icon: ScrollText, testid: "nav-audit", admin: true },
];

export default function Layout({ children }) {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen">
      <BackgroundTexture />

      {/* Sidebar */}
      <aside className="w-60 bg-zinc-50/70 backdrop-blur-xl border-r border-zinc-200 h-screen fixed left-0 top-0 flex flex-col z-20">
        <div className="px-5 h-16 flex items-center gap-2.5 border-b border-zinc-200/70">
          <div className="w-8 h-8 rounded-md bg-zinc-950 flex items-center justify-center">
            <span className="text-white font-heading font-bold leading-none">e</span>
          </div>
          <div className="leading-tight">
            <div className="font-heading font-semibold tracking-tight text-sm text-zinc-950">Upsell CRM</div>
            <div className="label-mono text-[10px] text-zinc-400">Emergent Labs</div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
          {navItems
            .filter((i) => !i.admin || isAdmin)
            .map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  data-testid={item.testid}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3.5 py-2.5 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-white border border-zinc-200 text-zinc-950 shadow-sm"
                        : "text-zinc-600 hover:bg-zinc-100/80 hover:text-zinc-950"
                    }`
                  }
                >
                  <Icon className="w-4 h-4" strokeWidth={2} />
                  {item.label}
                </NavLink>
              );
            })}
        </nav>

        <div className="p-3 border-t border-zinc-200/70">
          <div className="flex items-center gap-3 px-2 py-2 rounded-md bg-white border border-zinc-200">
            <img
              src={user?.avatar_url}
              alt={user?.name}
              className="w-8 h-8 rounded-md object-cover border border-zinc-200 bg-zinc-100"
            />
            <div className="flex-1 min-w-0 leading-tight">
              <div className="text-sm font-semibold text-zinc-950 truncate" data-testid="current-user-name">
                {user?.name}
              </div>
              <div className="label-mono text-[10px] text-zinc-400">
                {isAdmin ? "Sales Head" : "Agent"}
              </div>
            </div>
            <button
              data-testid="logout-btn"
              onClick={() => {
                logout();
                navigate("/login");
              }}
              className="text-zinc-400 hover:text-rose-600 hover:bg-zinc-50 rounded-md p-1.5 transition-colors"
              title="Log out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="ml-60 min-h-screen relative z-10">
        <div className="max-w-[1600px] mx-auto p-6 md:p-8">{children}</div>
      </main>
    </div>
  );
}
