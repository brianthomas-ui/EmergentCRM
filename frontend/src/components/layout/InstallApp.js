import { useState } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";
import Modal from "@/components/Modal";
import { useInstallPrompt } from "@/hooks/use-install-prompt";

const DISMISS_KEY = "crm_install_banner_dismissed";

// iOS Add-to-Home-Screen instructions (Safari can't trigger install programmatically).
function IosInstallModal({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title="Install Emergent CRM" testid="ios-install-modal">
      <p className="text-sm text-zinc-600 mb-4">
        Add Emergent CRM to your home screen for a fullscreen, app-like experience with no browser bar.
      </p>
      <ol className="space-y-3">
        <li className="flex items-center gap-3 text-sm text-zinc-800">
          <span className="tap-target shrink-0 rounded-lg bg-zinc-100 text-zinc-700"><Share className="w-5 h-5" /></span>
          Tap the <b>Share</b> icon in the Safari toolbar.
        </li>
        <li className="flex items-center gap-3 text-sm text-zinc-800">
          <span className="tap-target shrink-0 rounded-lg bg-zinc-100 text-zinc-700"><SquarePlus className="w-5 h-5" /></span>
          Choose <b>Add to Home Screen</b>.
        </li>
        <li className="flex items-center gap-3 text-sm text-zinc-800">
          <span className="tap-target shrink-0 rounded-lg bg-emerald-100 text-emerald-700 font-semibold text-sm">Add</span>
          Tap <b>Add</b>, the icon lands on your home screen.
        </li>
      </ol>
    </Modal>
  );
}

// Full-width button for the More sheet. One tap installs on Android/Chromium; opens
// the iOS instructions on iPhone/iPad. Renders nothing when already installed.
export function InstallAppButton() {
  const { canInstall, canPrompt, iosInstructions, promptInstall } = useInstallPrompt();
  const [iosOpen, setIosOpen] = useState(false);
  if (!canInstall) return null;

  const onClick = () => {
    if (canPrompt) promptInstall();
    else if (iosInstructions) setIosOpen(true);
  };

  return (
    <>
      <button
        onClick={onClick}
        data-testid="install-app-btn"
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-[13px] font-semibold text-emerald-950 bg-emerald-500 active:bg-emerald-400 transition-colors tap-target"
      >
        <Download className="w-4 h-4" /> Install app
      </button>
      <IosInstallModal open={iosOpen} onClose={() => setIosOpen(false)} />
    </>
  );
}

// Slim, one-time dismissible banner for the mobile app shell. Self-hides when
// installed, dismissed, or unavailable.
export function InstallBanner() {
  const { canInstall, canPrompt, iosInstructions, promptInstall } = useInstallPrompt();
  const [iosOpen, setIosOpen] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch (e) { console.warn("Install banner read failed:", e); return false; }
  });

  if (!canInstall || dismissed) return null;

  const install = () => {
    if (canPrompt) promptInstall();
    else if (iosInstructions) setIosOpen(true);
  };
  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch (e) { console.warn("Install banner persist failed:", e); }
  };

  return (
    <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-emerald-500/12 border-b border-emerald-500/25">
      <Download className="w-4 h-4 text-[var(--accent-text)] shrink-0" />
      <button onClick={install} data-testid="install-banner-btn" className="flex-1 text-left text-[12px] leading-tight text-[var(--text)] min-w-0">
        <span className="font-semibold">Install this app</span>
        <span className="text-[var(--text-muted)]"> for a fullscreen experience</span>
      </button>
      <button onClick={dismiss} aria-label="Dismiss" className="tap-target shrink-0 text-[var(--text-faint)] hover:text-[var(--text)]">
        <X className="w-4 h-4" />
      </button>
      <IosInstallModal open={iosOpen} onClose={() => setIosOpen(false)} />
    </div>
  );
}
