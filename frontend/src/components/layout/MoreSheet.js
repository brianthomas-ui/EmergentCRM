import { useNavigate } from "react-router-dom";
import { LogOut, KeyRound, Compass, Sun, Moon, ArrowLeft } from "lucide-react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import Avatar from "@/components/dark/Avatar";
import { ViewAsPicker } from "@/components/layout/ViewAsPicker";
import { InstallAppButton } from "@/components/layout/InstallApp";

// Routes that already live on the bottom tab bar; we don't repeat them in the sheet.
const PRIMARY = new Set(["/", "/workspace", "/leads", "/deals"]);

// Bottom sheet opened from the "More" tab / profile avatar. Holds the secondary nav
// (admin-gated via the already-filtered visibleNavItems) plus every profile action
// from the desktop SidebarUserCard, so phones reach everything the sidebar offers.
export default function MoreSheet({
  open,
  onOpenChange,
  navItems,
  user,
  isAdmin,
  impersonating,
  theme,
  onLogout,
  onChangePassword,
  onToggleTheme,
  onTakeTour,
  onStopImpersonation,
}) {
  const navigate = useNavigate();
  const close = () => onOpenChange(false);

  const go = (to) => {
    close();
    navigate(to);
  };

  const secondary = navItems.filter((i) => !i.divider && i.to && !PRIMARY.has(i.to));

  const action =
    "flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-[13px] font-medium text-[var(--text-muted)] bg-[var(--surface-2)] border border-[var(--border)] active:bg-[var(--surface-3)] transition-colors tap-target";

  return (
    <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerContent
        data-testid="more-sheet"
        className="bg-[var(--surface-1)] border-[var(--border)] text-[var(--text)] max-h-[92vh] max-w-[100vw] overflow-x-hidden focus:outline-none"
      >
        <DrawerTitle className="sr-only">Menu</DrawerTitle>

        <div className="px-4 pb-[max(env(safe-area-inset-bottom),16px)] overflow-y-auto overflow-x-hidden">
          {/* identity */}
          <div className="flex items-center gap-3 px-1 pt-1 pb-4">
            <Avatar src={user?.avatar_url} name={user?.name || user?.email} size="md" />
            <div className="min-w-0 leading-tight">
              <div className="text-sm font-semibold text-[var(--text)] truncate">{user?.name}</div>
              <div className="text-[11px] text-[var(--text-faint)] truncate">{user?.email}</div>
            </div>
            <span className="ml-auto text-[10px] text-[var(--text-faint)] font-mono uppercase tracking-wider shrink-0">
              {isAdmin ? "Sales Head" : "Agent"}
            </span>
          </div>

          {/* Back to manager, always reachable while viewing as an agent */}
          {impersonating && (
            <button
              data-testid="more-exit-viewas"
              onClick={() => {
                close();
                onStopImpersonation();
              }}
              className="w-full mb-4 inline-flex items-center justify-center gap-2 rounded-xl bg-amber-400 text-amber-950 active:bg-amber-300 px-3 py-3 text-sm font-semibold transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Manager
            </button>
          )}

          {/* secondary destinations */}
          {secondary.length > 0 && (
            <div className="grid grid-cols-3 gap-2.5 mb-4">
              {secondary.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.to}
                    data-testid={`more-${item.testid}`}
                    onClick={() => go(item.to)}
                    className="flex flex-col items-center justify-center gap-1.5 py-3.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] active:bg-[var(--surface-3)] transition-colors"
                  >
                    {Icon && <Icon className="w-5 h-5 text-[var(--text-muted)]" strokeWidth={2} />}
                    <span className="text-[11px] font-medium text-[var(--text)] text-center leading-tight px-1">
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* admin: view as agent */}
          {isAdmin && !impersonating && (
            <div className="-mx-1 mb-2">
              <ViewAsPicker />
            </div>
          )}

          {/* install as app (hidden when already installed) */}
          <div className="mb-2.5">
            <InstallAppButton />
          </div>

          {/* profile actions */}
          <div className="grid grid-cols-3 gap-2.5">
            <button onClick={() => { close(); onChangePassword(); }} data-testid="more-change-password" className={action}>
              <KeyRound className="w-4 h-4" /> Password
            </button>
            <button onClick={onToggleTheme} data-testid="more-theme-toggle" className={action}>
              {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              {theme === "light" ? "Dark" : "Light"}
            </button>
            <button onClick={() => { close(); onTakeTour(); }} data-testid="more-take-tour" className={action}>
              <Compass className="w-4 h-4" /> Tour
            </button>
          </div>

          {/* logout */}
          <button
            onClick={() => { close(); onLogout(); }}
            data-testid="more-logout"
            className="w-full mt-2.5 inline-flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-[13px] font-medium text-rose-400 bg-[var(--surface-2)] border border-[var(--border)] active:bg-[var(--surface-3)] transition-colors tap-target"
          >
            <LogOut className="w-4 h-4" /> Log out
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
