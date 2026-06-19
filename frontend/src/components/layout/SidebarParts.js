import { NavLink } from "react-router-dom";
import { LogOut, KeyRound, Compass } from "lucide-react";
import { AvatarUpload } from "@/components/dark/Avatar";

// Sidebar navigation list. `items` is already filtered/memoized by the parent.
export function SidebarNav({ items }) {
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
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            data-testid={item.testid}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                  : "text-[var(--text-muted)] border border-transparent hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={`w-4 h-4 ${isActive ? "text-emerald-400" : ""}`} strokeWidth={2} />
                {item.label}
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}

// Bottom-of-sidebar account card: avatar upload, logout, password + tour shortcuts.
export function SidebarUserCard({
  user,
  isAdmin,
  savingAvatar,
  onAvatarUpload,
  onLogout,
  onChangePassword,
  onTakeTour,
}) {
  return (
    <div className="p-3 border-t border-[var(--border)]">
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

      {/* Quick account actions */}
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <button
          onClick={onChangePassword}
          data-testid="change-password-btn"
          className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-medium text-[var(--text-muted)] border border-[var(--border)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors"
        >
          <KeyRound className="w-3.5 h-3.5" /> Password
        </button>
        <button
          onClick={onTakeTour}
          data-testid="take-tour-btn"
          className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-medium text-[var(--text-muted)] border border-[var(--border)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors"
        >
          <Compass className="w-3.5 h-3.5" /> Take a tour
        </button>
      </div>

      <div className="text-[10px] text-[var(--text-faint)] text-center mt-2 font-mono uppercase tracking-wider">
        {isAdmin ? "Sales Head" : "Agent"}
      </div>
    </div>
  );
}
