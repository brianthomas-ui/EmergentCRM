import { useLocation } from "react-router-dom";
import Avatar from "@/components/dark/Avatar";

// Map a pathname to the page title shown in the top bar. Falls back to the brand
// name on routes that are not in the nav (deep detail pages keep their own header).
function titleFor(pathname, items) {
  if (pathname === "/") return "Dashboard";
  const hit = items.find((i) => i.to && i.to !== "/" && (pathname === i.to || pathname.startsWith(i.to + "/")));
  return hit ? hit.label : "Emergent CRM";
}

// Slim sticky header for the mobile app shell: brand mark, current page title, and a
// tap target that opens the profile/More sheet. Mounts only under lg via lg:hidden.
export default function MobileTopBar({ navItems, user, onOpenMore, impersonating }) {
  const { pathname } = useLocation();
  const title = titleFor(pathname, navItems);

  return (
    <header
      data-testid="mobile-top-bar"
      className={`lg:hidden sticky ${impersonating ? "top-11" : "top-0"} z-20 pt-safe bg-[var(--surface-1)]/95 backdrop-blur-md border-b border-[var(--border)]`}
    >
      <div className="h-14 px-4 flex items-center gap-3">
        <img
          src="/emergent-logo.jpeg"
          alt="Emergent"
          className="w-8 h-8 rounded-lg object-cover ring-1 ring-[var(--border)] shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="font-heading font-semibold tracking-tight text-[15px] text-[var(--text)] truncate leading-tight">
            {title}
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenMore}
          data-testid="mobile-profile-btn"
          aria-label="Open menu"
          className="tap-target rounded-full"
        >
          <Avatar src={user?.avatar_url} name={user?.name || user?.email} size="sm" />
        </button>
      </div>
    </header>
  );
}
