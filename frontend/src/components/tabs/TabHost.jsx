import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { useTabs } from "@/context/TabsContext";
import { renderTab } from "@/components/tabs/registry";
import TabErrorBoundary from "@/components/tabs/TabErrorBoundary";

// Renders every open tab once and keeps them all mounted (display toggled), so
// each tab preserves its own scroll position, filters and fetched data.
export default function TabHost() {
  const { tabs, activeId } = useTabs();
  return (
    <>
      {tabs.map((t) => (
        <div key={t.id} hidden={t.id !== activeId}>
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-24 text-sm text-[var(--text-muted)] gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
            }
          >
            <TabErrorBoundary>{renderTab(t)}</TabErrorBoundary>
          </Suspense>
        </div>
      ))}
    </>
  );
}
