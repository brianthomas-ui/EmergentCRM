import { PAGE_META, PATH_TO_PAGE } from "@/components/tabs/pages.config";

// Canonical, shareable URL for a tab. The active tab is kept in sync with the
// address bar so a pasted/shared link reopens the exact same view (subject to the
// viewer's own access). Reverse of specFromLocation().
export function tabToPath(tab) {
  if (!tab) return "/";
  if (tab.type === "page") return PAGE_META[tab.params?.page]?.path || "/";
  if (tab.type === "lead") return `/leads/${tab.params?.id}`;
  if (tab.type === "agent") {
    const name = tab.params?.name;
    return `/agent/${tab.params?.id}${name ? `?name=${encodeURIComponent(name)}` : ""}`;
  }
  if (tab.type === "payment") return `/payment/${tab.params?.payment?.id || tab.params?.id}`;
  if (tab.type === "drill") {
    const p = tab.params || {};
    const qs = new URLSearchParams();
    qs.set("kind", p.kind || "metric");
    qs.set("metric", p.metric || "");
    if (p.title) qs.set("title", p.title);
    return `/drill?${qs.toString()}`;
  }
  return "/";
}

// Parse a location into a tab spec (or null for non-tab routes like /login and
// /payment-return). Reverse of tabToPath().
export function specFromLocation(pathname, search = "") {
  if (!pathname || pathname === "/login" || pathname.startsWith("/payment-return")) return null;

  const lead = pathname.match(/^\/leads\/([^/]+)$/);
  if (lead) return { key: `lead:${lead[1]}`, type: "lead", params: { id: lead[1] }, title: "Lead", icon: "User" };

  const agent = pathname.match(/^\/agent\/([^/]+)$/);
  if (agent) {
    const name = new URLSearchParams(search).get("name") || "Agent";
    return { key: `agent:${agent[1]}`, type: "agent", params: { id: agent[1], name }, title: name, icon: "UserCircle" };
  }

  const pay = pathname.match(/^\/payment\/([^/]+)$/);
  if (pay) return { key: `payment:${pay[1]}`, type: "payment", params: { id: pay[1] }, title: "Payment", icon: "CreditCard" };

  if (pathname === "/drill") {
    const q = new URLSearchParams(search);
    const kind = q.get("kind") || "metric";
    const metric = q.get("metric") || "";
    const title = q.get("title") || "Details";
    return { key: `drill:${kind}:${metric}`, type: "drill", params: { kind, metric, title }, title, icon: "BarChart3" };
  }

  const page = PATH_TO_PAGE[pathname];
  if (page) return { key: `page:${page}`, type: "page", params: { page }, title: PAGE_META[page].title, icon: PAGE_META[page].icon };

  return null;
}
