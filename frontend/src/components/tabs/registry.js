import { lazy } from "react";
import { PAGE_META } from "@/components/tabs/pages.config";

const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Workspace = lazy(() => import("@/pages/Workspace"));
const Leads = lazy(() => import("@/pages/Leads"));
const Deals = lazy(() => import("@/pages/Deals"));
const Meetings = lazy(() => import("@/pages/Meetings"));
const Payments = lazy(() => import("@/pages/Payments"));
const Campaigns = lazy(() => import("@/pages/Campaigns"));
const Team = lazy(() => import("@/pages/Team"));
const AuditLog = lazy(() => import("@/pages/AuditLog"));
const Settings = lazy(() => import("@/pages/Settings"));
const LeadDetail = lazy(() => import("@/pages/LeadDetail"));
const DrillView = lazy(() => import("@/pages/DrillView"));
const AgentView = lazy(() => import("@/pages/AgentView"));
const PaymentView = lazy(() => import("@/pages/PaymentView"));

const PAGE_COMPONENTS = {
  dashboard: Dashboard,
  workspace: Workspace,
  leads: Leads,
  deals: Deals,
  meetings: Meetings,
  payments: Payments,
  campaigns: Campaigns,
  team: Team,
  audit: AuditLog,
  settings: Settings,
};

function Missing() {
  return <div className="p-6 text-sm text-[var(--text-faint)]">This view is unavailable.</div>;
}

export function renderTab(tab) {
  if (tab.type === "page") {
    const C = PAGE_COMPONENTS[tab.params?.page];
    return C ? <C /> : <Missing />;
  }
  if (tab.type === "lead") return <LeadDetail leadId={tab.params.id} />;
  if (tab.type === "drill") return <DrillView spec={tab.params} />;
  if (tab.type === "agent") return <AgentView agentId={tab.params.id} name={tab.params.name} />;
  if (tab.type === "payment") return <PaymentView payment={tab.params.payment} />;
  return <Missing />;
}

export { PAGE_META };
