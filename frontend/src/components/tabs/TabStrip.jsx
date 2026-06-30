import { useRef, useState } from "react";
import { X, Plus } from "lucide-react";
import { useTabs } from "@/context/TabsContext";
import { ICONS } from "@/components/tabs/icons";

// Desktop/tablet browser-style tab strip. Reorder by drag, close per tab, and a
// "+" launcher to open any page in a new tab.
export default function TabStrip({ launchPages = [], topPx = 0 }) {
  const { tabs, activeId, setActive, closeTab, reorder } = useTabs();
  const dragId = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="sticky z-30 flex items-stretch h-10 bg-[var(--surface-1)] border-b border-[var(--border)]" style={{ top: topPx }}>
      <div className="flex items-stretch overflow-x-auto no-scrollbar">
        {tabs.map((t) => {
          const Icon = ICONS[t.icon] || ICONS.Square;
          const active = t.id === activeId;
          return (
            <div
              key={t.id}
              draggable
              onDragStart={() => (dragId.current = t.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragId.current) reorder(dragId.current, t.id);
                dragId.current = null;
              }}
              onClick={() => setActive(t.id)}
              onAuxClick={(e) => {
                // middle-click closes (browser convention)
                if (e.button === 1 && !t.pinned) {
                  e.preventDefault();
                  closeTab(t.id);
                }
              }}
              data-testid={`tab-${t.key}`}
              title={t.title}
              className={`group flex items-center gap-2 pl-3 pr-2 min-w-[130px] max-w-[210px] border-r border-[var(--border)] cursor-pointer select-none transition-colors ${
                active
                  ? "bg-[var(--bg)] text-[var(--text)] border-t-2 border-t-emerald-500"
                  : "bg-[var(--surface-1)] text-[var(--text-muted)] border-t-2 border-t-transparent hover:bg-[var(--surface-2)]"
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="text-xs truncate flex-1">{t.title}</span>
              {!t.pinned && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(t.id);
                  }}
                  data-testid={`tab-close-${t.key}`}
                  className="shrink-0 rounded p-0.5 text-[var(--text-faint)] opacity-0 group-hover:opacity-100 hover:text-rose-400 hover:bg-[var(--surface-3)] transition-all"
                  title="Close tab"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="relative flex items-center">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          data-testid="tab-new-btn"
          className="h-full px-3 text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors"
          title="Open a view in a new tab"
        >
          <Plus className="w-4 h-4" />
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            <div
              className="absolute left-0 top-10 z-50 w-48 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] shadow-xl py-1"
              data-testid="tab-new-menu"
            >
              {launchPages.map((p) => {
                const Icon = ICONS[p.icon] || ICONS.Square;
                return (
                  <button
                    key={p.page}
                    onClick={() => {
                      p.open();
                      setMenuOpen(false);
                    }}
                    data-testid={`tab-new-${p.page}`}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors"
                  >
                    <Icon className="w-4 h-4" /> {p.title}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
