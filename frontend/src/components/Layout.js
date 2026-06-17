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
} from "lucide-react";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, testid: "nav-dashboard", admin: false },
  { to: "/leads", label: "Leads", icon: Users, testid: "nav-leads", admin: false },
  { to: "/pipeline", label: "Pipeline", icon: KanbanSquare, testid: "nav-pipeline", admin: false },
  { to: "/meetings", label: "Meetings", icon: CalendarClock, testid: "nav-meetings", admin: false },
  { to: "/payments", label: "Payments", icon: CreditCard, testid: "nav-payments", admin: false },
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
      <aside className="w-60 bg-white/80 backdrop-blur-xl border-r border-slate-200 h-screen fixed left-0 top-0 flex flex-col z-20">
        <div className="px-5 h-16 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-brand flex items-center justify-center shadow-sm">
            <span className="text-white font-heading font-bold leading-none">e</span>
          </div>
          <div className="leading-tight">
            <div className="font-heading font-semibold tracking-tight text-sm text-slate-900">Upsell CRM</div>
            <div className="text-[10px] text-slate-400 font-medium">Emergent Labs</div>
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
                    `flex items-center gap-3 px-3.5 py-2.5 rounded-full text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-slate-900 text-white"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`
                  }
                >
                  <Icon className="w-4 h-4" strokeWidth={2} />
                  {item.label}
                </NavLink>
              );
            })}
        </nav>

        <div className="p-3">
          <div className="flex items-center gap-3 px-2 py-2 rounded-2xl bg-slate-50 border border-slate-100">
            <img
              src={user?.avatar_url}
              alt={user?.name}
              className="w-8 h-8 rounded-full object-cover border border-slate-200 bg-slate-100"
            />
            <div className="flex-1 min-w-0 leading-tight">
              <div className="text-sm font-semibold text-slate-900 truncate" data-testid="current-user-name">
                {user?.name}
              </div>
              <div className="text-[10px] text-slate-400 font-medium">
                {isAdmin ? "Sales Head" : "Agent"}
              </div>
            </div>
            <button
              data-testid="logout-btn"
              onClick={() => {
                logout();
                navigate("/login");
              }}
              className="text-slate-400 hover:text-red-600 hover:bg-white rounded-lg p-1.5 transition-colors"
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
