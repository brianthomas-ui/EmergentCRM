// Single source of truth for the openable page tabs (title + icon name + route path).
export const PAGE_META = {
  dashboard: { title: "Dashboard", icon: "LayoutDashboard", path: "/" },
  workspace: { title: "My Work", icon: "Briefcase", path: "/workspace" },
  leads: { title: "Leads", icon: "Users", path: "/leads" },
  campaigns: { title: "Campaigns", icon: "Megaphone", path: "/campaigns", admin: true },
  meetings: { title: "Meetings", icon: "CalendarClock", path: "/meetings" },
  deals: { title: "Deals", icon: "Receipt", path: "/deals" },
  team: { title: "Team", icon: "UserCog", path: "/team", admin: true },
  payments: { title: "Payments", icon: "CreditCard", path: "/payments" },
  settings: { title: "Settings", icon: "Settings", path: "/settings" },
  audit: { title: "Audit Log", icon: "ScrollText", path: "/audit", admin: true },
};

export const PATH_TO_PAGE = Object.fromEntries(
  Object.entries(PAGE_META).map(([k, v]) => [v.path, k])
);
