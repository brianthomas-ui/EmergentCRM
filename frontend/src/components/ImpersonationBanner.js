import { useState } from "react";
import { Eye, ArrowLeft } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { apiError } from "@/api";
import { toast } from "sonner";

export default function ImpersonationBanner() {
  const { user, stopImpersonation } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!user?.impersonating) return null;

  const back = async () => {
    setBusy(true);
    try {
      await stopImpersonation();
      toast.success("Back to manager view");
    } catch (e) {
      toast.error(apiError(e));
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="impersonation-banner"
      className="sticky top-0 z-30 flex items-center justify-center gap-3 bg-amber-400 text-amber-950 text-sm font-medium px-4 py-2 shadow-sm"
    >
      <Eye className="w-4 h-4 shrink-0" />
      <span>
        Viewing as <b>{user.name}</b>
        {user.impersonator ? <span className="opacity-80"> · impersonated by {user.impersonator.name}</span> : null}
      </span>
      <button
        data-testid="back-to-manager-btn"
        onClick={back}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md bg-amber-950/15 hover:bg-amber-950/25 px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-60"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Manager
      </button>
    </div>
  );
}
