import { LogOut, KeyRound, Compass, Sun, Moon, ArrowLeft } from "lucide-react";
import { AvatarUpload } from "@/components/dark/Avatar";
import { useOpen } from "@/hooks/useOpen";
import { useTabs } from "@/context/TabsContext";
import { PATH_TO_PAGE } from "@/components/tabs/pages.config";

// Sidebar navigation list. On desktop each item drives the browser-style tab
// system (opens/activates a kept-alive page tab); the active highlight follows
// the active tab, not the URL. `items` is already filtered/memoized by the parent.
export function SidebarNav({ items }) {
  const { openPage } = useOpen();
  const tabsApi = useTabs();
  const activeTab = tabsApi?.tabs?.find((t) => t.id === tabsApi.activeId);
  const activePage = activeTab?.type === "page" ? activeTab?.params?.page : null;

  return (
    <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
      {items.map((item, idx) => {
        if (item.divider) {
          return (
            <div
              key={`div-${idx}`}
              className="px-3.5 pt-4 pb-1.5 text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--text-faint)]"
            >
              {item.label}
            </div>
          );
        }
        const Icon = item.icon;
        const page = PATH_TO_PAGE[item.to];
        const isActive = page && page === activePage;
        return (
          <button
            key={item.to}
            type="button"
            onClick={() => openPage(page)}
            data-testid={item.testid}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
              isActive
                ? "bg-emerald-500/10 text-[var(--accent-text)] border border-emerald-500/20"
                : "text-[var(--text-muted)] border border-transparent hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
            }`}
          >
            <Icon className={`w-4 h-4 ${isActive ? "text-[var(--accent-text)]" : ""}`} strokeWidth={2} />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

// Bottom-of-sidebar account card: avatar, logout, password, theme + tour.
export function SidebarUserCard({
  user,
  isAdmin,
  impersonating,
  savingAvatar,
  theme,
  onAvatarUpload,
  onStopImpersonation,
  onLogout,
  onChangePassword,
  onToggleTheme,
  onTakeTour,
}) {
  const action =
    "flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-medium text-[var(--text-muted)] border border-[var(--border)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors";
  return (
    <div className="p-3 border-t border-[var(--border)]">
      {/* Always-reachable exit when viewing-as an agent (belt-and-suspenders with the banner). */}
      {impersonating && (
        <button
          data-testid="sidebar-exit-viewas"
          onClick={onStopImpersonation}
          className="w-full mb-2 inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-400 text-amber-950 hover:bg-amber-300 px-3 py-2 text-xs font-semibold transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Manager
        </button>
      )}
      <div
        data-tour="user-card"
        className="flex items-center gap-3 px-2.5 py-2.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)]"
      >
        <AvatarUpload
          src={user?.avatar_url}
          name={user?.name || user?.email}
          size="md"
          disabled={savingAvatar}
          onUpload={onAvatarUpload}
        />
        <div className="flex-1 min-w-0 leading-tight">
          <div className="text-sm font-semibold text-[var(--text)] truncate" data-testid="current-user-name">
            {user?.name}
          </div>
          <div className="text-[11px] text-[var(--text-faint)] truncate">{user?.email}</div>
        </div>
        <button
          data-testid="logout-btn"
          onClick={onLogout}
          className="text-[var(--text-faint)] hover:text-rose-400 hover:bg-[var(--surface-3)] rounded-md p-1.5 transition-colors"
          title="Log out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <button onClick={onChangePassword} data-testid="change-password-btn" className={action}>
          <KeyRound className="w-3.5 h-3.5" /> Password
        </button>
        <button onClick={onToggleTheme} data-testid="theme-toggle-btn" className={action}>
          {theme === "light" ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
          {theme === "light" ? "Dark" : "Light"}
        </button>
        <button onClick={onTakeTour} data-testid="take-tour-btn" className={action}>
          <Compass className="w-3.5 h-3.5" /> Tour
        </button>
      </div>

      <div className="text-[10px] text-[var(--text-faint)] text-center mt-2 font-mono uppercase tracking-wider">
        {isAdmin ? "Sales Head" : "Agent"}
      </div>
    </div>
  );
}
