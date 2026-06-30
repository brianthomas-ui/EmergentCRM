import { useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useTabs } from "@/context/TabsContext";
import { PAGE_META } from "@/components/tabs/pages.config";

// Unified "open" navigation. On desktop it opens browser-style tabs; on mobile
// it falls back to plain route navigation (single-view).
export function useOpen() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const tabs = useTabs();

  const openPage = (page) => {
    const meta = PAGE_META[page];
    if (isMobile || !tabs) {
      navigate(meta?.path || "/");
      return;
    }
    tabs.openTab({ key: `page:${page}`, type: "page", params: { page }, title: meta?.title || page, icon: meta?.icon || "Square" });
    navigate(meta?.path || "/");
  };

  const openLead = (id, title) => {
    if (isMobile || !tabs) {
      navigate(`/leads/${id}`);
      return;
    }
    tabs.openTab({ key: `lead:${id}`, type: "lead", params: { id }, title: title || "Lead", icon: "User" });
  };

  // spec: { kind?, metric, title }
  const openDrill = (spec) => {
    if (isMobile || !tabs) {
      const kind = spec.kind || "metric";
      navigate(kind === "payments" ? "/payments" : kind === "teamstat" ? "/team" : "/leads");
      return;
    }
    tabs.openTab({
      key: `drill:${spec.kind || "metric"}:${spec.metric}`,
      type: "drill",
      params: spec,
      title: spec.title || "Details",
      icon: "BarChart3",
    });
  };

  const openAgent = (id, name) => {
    if (isMobile || !tabs) {
      navigate("/team");
      return;
    }
    tabs.openTab({ key: `agent:${id}`, type: "agent", params: { id, name }, title: name || "Agent", icon: "UserCircle" });
  };

  const openPayment = (p) => {
    if (isMobile || !tabs) {
      navigate(p?.lead_id ? `/leads/${p.lead_id}` : "/payments");
      return;
    }
    tabs.openTab({
      key: `payment:${p.id}`,
      type: "payment",
      params: { payment: p },
      title: p.lead_name || p.customer_email || "Payment",
      icon: "CreditCard",
    });
  };

  return { isMobile, openPage, openLead, openDrill, openAgent, openPayment };
}
