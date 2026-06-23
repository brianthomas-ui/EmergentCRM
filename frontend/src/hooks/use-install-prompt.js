import { useCallback, useEffect, useState } from "react";
import { useIsStandalone } from "@/hooks/use-is-mobile";

// iOS Safari does not fire beforeinstallprompt; install is a manual Share -> Add to
// Home Screen step, so we detect iOS to show instructions instead of a one-tap button.
function isIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return (
    /iphone|ipad|ipod/i.test(ua) ||
    // iPadOS reports as Mac with touch points
    (navigator.platform === "MacIntel" && (navigator.maxTouchPoints || 0) > 1)
  );
}

// Surfaces the browser's PWA install affordance:
//  - Android/Chromium: captures `beforeinstallprompt` so we can fire it on a tap.
//  - iOS Safari: no event, so we expose `iosInstructions` to show the Share steps.
//  - Already installed / standalone: nothing to show.
export function useInstallPrompt() {
  const standalone = useIsStandalone();
  const [deferred, setDeferred] = useState(null);
  const [installed, setInstalled] = useState(false);
  const ios = isIOS();

  useEffect(() => {
    const onBIP = (e) => {
      e.preventDefault();
      setDeferred(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferred) return null;
    deferred.prompt();
    const choice = await deferred.userChoice;
    setDeferred(null);
    return choice?.outcome; // "accepted" | "dismissed"
  }, [deferred]);

  const hidden = standalone || installed;
  return {
    // Show any install affordance at all?
    canInstall: !hidden && (!!deferred || ios),
    // Can we fire the native one-tap prompt right now (Android/Chromium)?
    canPrompt: !!deferred,
    // iOS, not yet installed -> show Add-to-Home-Screen instructions.
    iosInstructions: ios && !hidden,
    promptInstall,
    isStandalone: standalone,
  };
}

export default useInstallPrompt;
