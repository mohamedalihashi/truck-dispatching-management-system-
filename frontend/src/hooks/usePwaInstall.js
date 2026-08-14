import { useEffect, useState } from "react";
import {
  canShowInstallPrompt,
  dismissPwaPrompt,
  isAndroid,
  isInAppBrowser,
  isIos,
  isPwaDismissed,
  isStandalone,
  openInSystemBrowser
} from "../utils/pwa";

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [dismissed, setDismissed] = useState(isPwaDismissed);
  const [showHelp, setShowHelp] = useState(false);

  const canShow = canShowInstallPrompt() && !dismissed;
  const canNativeInstall = Boolean(deferredPrompt);

  useEffect(() => {
    if (isStandalone() || dismissed) return;

    function onBeforeInstall(event) {
      event.preventDefault();
      setDeferredPrompt(event);
    }

    function onInstalled() {
      setDeferredPrompt(null);
      dismissPwaPrompt();
      setDismissed(true);
      setShowHelp(false);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [dismissed]);

  function dismiss() {
    dismissPwaPrompt();
    setDismissed(true);
    setDeferredPrompt(null);
    setShowHelp(false);
  }

  async function install() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      if (outcome === "accepted") dismiss();
      return outcome === "accepted";
    }

    if (isInAppBrowser()) {
      openInSystemBrowser();
      return false;
    }

    // iOS / browsers without beforeinstallprompt — show manual steps.
    setShowHelp(true);
    return false;
  }

  const helpSteps = isIos()
    ? [
        "Taabo Share (↑) Safari footer-ka",
        "Dooro “Add to Home Screen”",
        "Taabo Add — GaariHel ayaa phone-kaaga ku soo dhici doonta"
      ]
    : isAndroid()
      ? [
          "Chrome menu (⋮) → “Install app” ama “Add to Home screen”",
          "Haddii aadan arkin: fur site-ka Chrome (ha ahayn Facebook/WhatsApp in-app)",
          "Site-ku waa inuu ahaadaa HTTPS ama localhost"
        ]
      : [
          "Chrome/Edge address bar → Install icon (⊕ / computer icon)",
          "Ama menu (⋮) → “Install GaariHel…” / “Apps” → Install",
          "Haddii aadan arkin: hubi Service Worker (Application tab DevTools)"
        ];

  return {
    canShow,
    canNativeInstall,
    showHelp,
    setShowHelp,
    helpSteps,
    dismiss,
    install,
    isIos: isIos(),
    isAndroid: isAndroid()
  };
}
