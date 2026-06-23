import { NavLink, useLocation } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { LayoutDashboard, Briefcase, Users, Receipt, Menu } from "lucide-react";

// The five primary destinations that live on the bottom bar. Everything else
// (Payments, Meetings, Team, Campaigns, Settings, Audit) lives behind "More".
const TABS = [
  { to: "/", label: "Home", icon: LayoutDashboard, testid: "tab-home", end: true },
  { to: "/workspace", label: "My Work", icon: Briefcase, testid: "tab-workspace" },
  { to: "/leads", label: "Leads", icon: Users, testid: "tab-leads" },
  { to: "/deals", label: "Deals", icon: Receipt, testid: "tab-deals" },
];

// Routes that should light up the "More" tab when active (they live in the sheet).
const MORE_ROUTES = ["/payments", "/meetings", "/team", "/campaigns", "/settings", "/audit"];

function TabButton({ active, label, icon: Icon, reduce, testid, onClick, to, end }) {
  const inner = (
    <motion.span
      whileTap={reduce ? undefined : { scale: 0.88 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className="flex flex-col items-center justify-center gap-1 w-full h-full"
    >
      <Icon
        className={`w-[22px] h-[22px] ${active ? "text-[var(--accent-text)]" : "text-[var(--text-faint)]"}`}
        strokeWidth={active ? 2.4 : 2}
      />
      <span
        className={`text-[10px] font-medium leading-none ${
          active ? "text-[var(--accent-text)]" : "text-[var(--text-faint)]"
        }`}
      >
        {label}
      </span>
    </motion.span>
  );

  const cls = "relative flex-1 tap-target flex-col rounded-lg";
  if (onClick) {
    return (
      <button type="button" onClick={onClick} data-testid={testid} className={cls} aria-label={label}>
        {inner}
      </button>
    );
  }
  return (
    <NavLink to={to} end={end} data-testid={testid} className={cls} aria-label={label}>
      {inner}
    </NavLink>
  );
}

// Bottom navigation that replaces the desktop sidebar on phones. Rendered as a
// frozen flex row by the Layout app-shell (shrink-0), below the scroll region, so
// it is always visible and never overlaps content. pb-safe clears the home bar.
export default function MobileTabBar({ onOpenMore }) {
  const reduce = useReducedMotion();
  const { pathname } = useLocation();
  const moreActive = MORE_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"));

  return (
    <nav
      data-testid="mobile-tab-bar"
      data-tour="mobile-tabs"
      className="shrink-0 pb-safe bg-[var(--surface-1)] border-t border-[var(--border)]"
    >
      <div className="flex items-stretch h-[var(--bottom-nav-h)] px-1">
        {TABS.map((t) => (
          <TabRoute key={t.to} tab={t} pathname={pathname} reduce={reduce} />
        ))}
        <TabButton
          active={moreActive}
          label="More"
          icon={Menu}
          reduce={reduce}
          testid="tab-more"
          onClick={onOpenMore}
        />
      </div>
    </nav>
  );
}

// NavLink can't tell us "active" from outside, so resolve it here against pathname.
function TabRoute({ tab, pathname, reduce }) {
  const active = tab.end ? pathname === "/" : pathname === tab.to || pathname.startsWith(tab.to + "/");
  return (
    <TabButton
      active={active}
      label={tab.label}
      icon={tab.icon}
      reduce={reduce}
      testid={tab.testid}
      to={tab.to}
      end={tab.end}
    />
  );
}
