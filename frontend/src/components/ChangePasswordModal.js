import { useState } from "react";
import { toast } from "sonner";
import { X, KeyRound } from "lucide-react";
import client, { apiError } from "@/api";

export default function ChangePasswordModal({ open, onClose }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => { setCurrent(""); setNext(""); setConfirm(""); };
  const close = () => { reset(); onClose(); };

  const submit = async () => {
    if (next.length < 8) { toast.error("New password must be at least 8 characters"); return; }
    if (next !== confirm) { toast.error("New passwords do not match"); return; }
    setBusy(true);
    try {
      await client.post("/profile/password", { current_password: current, new_password: next });
      toast.success("Password updated");
      close();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;
  const inputCls =
    "w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-emerald-500/40";

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" data-testid="change-password-modal">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={close} />
      <div className="relative w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] shadow-2xl p-5 animate-fadeIn">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-emerald-400" />
            <h2 className="font-heading text-lg font-semibold text-[var(--text)]">Change password</h2>
          </div>
          <button onClick={close} className="text-[var(--text-faint)] hover:text-[var(--text)]"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-[var(--text-faint)] mb-1.5">Current password</label>
            <input type="password" className={inputCls} value={current} onChange={(e) => setCurrent(e.target.value)} data-testid="cp-current" />
          </div>
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-[var(--text-faint)] mb-1.5">New password</label>
            <input type="password" className={inputCls} value={next} onChange={(e) => setNext(e.target.value)} data-testid="cp-new" />
          </div>
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-[var(--text-faint)] mb-1.5">Confirm new password</label>
            <input type="password" className={inputCls} value={confirm} onChange={(e) => setConfirm(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !busy && submit()} data-testid="cp-confirm" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={close} className="px-3.5 py-2 text-sm rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] transition-colors">Cancel</button>
          <button onClick={submit} disabled={busy} className="px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-500 text-emerald-950 hover:bg-emerald-400 transition-colors disabled:opacity-60" data-testid="cp-submit">
            {busy ? "Saving…" : "Update password"}
          </button>
        </div>
      </div>
    </div>
  );
}
