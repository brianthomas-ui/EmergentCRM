import { useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useTabs } from "@/context/TabsContext";
import { PAGE_META } from "@/components/tabs/pages.config";
import { tabToPath } from "@/components/tabs/urls";

// Unified "open" navigation. On desktop it opens browser-style tabs (the active
// tab is kept in sync with the URL by Layout, so every tab is shareable). On
// mobile it falls back to plain route navigation to the same canonical path.
export function useOpen() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const tabs = useTabs();

  const openSpec = (spec) => {
    if (isMobile || !tabs) {
      navigate(tabToPath(spec));
      return;
    }
    tabs.openTab(spec);
  };

  const openPage = (page) => {
    const meta = PAGE_META[page];
    openSpec({ key: `page:${page}`, type: "page", params: { page }, title: meta?.title || page, icon: meta?.icon || "Square" });
  };

  const openLead = (id, title) =>
    openSpec({ key: `lead:${id}`, type: "lead", params: { id }, title: title || "Lead", icon: "User" });

  // spec: { kind?, metric, title }
  const openDrill = (spec) =>
    openSpec({ key: `drill:${spec.kind || "metric"}:${spec.metric}`, type: "drill", params: spec, title: spec.title || "Details", icon: "BarChart3" });

  const openAgent = (id, name) =>
    openSpec({ key: `agent:${id}`, type: "agent", params: { id, name }, title: name || "Agent", icon: "UserCircle" });

  const openPayment = (p) =>
    openSpec({ key: `payment:${p.id}`, type: "payment", params: { payment: p }, title: p.lead_name || p.customer_email || "Payment", icon: "CreditCard" });

  return { isMobile, openPage, openLead, openDrill, openAgent, openPayment };
}
