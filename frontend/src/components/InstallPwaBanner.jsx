import { X } from "lucide-react";
import { usePwaInstall } from "../hooks/usePwaInstall";
import { isInAppBrowser } from "../utils/pwa";
import { APP_NAME, BRAND_LOGO_URL } from "../brand";

export function InstallPwaBanner() {
  const { canShow, canNativeInstall, dismiss, install } = usePwaInstall();

  if (!canShow) return null;

  const inApp = isInAppBrowser();

  return (
    <div className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[100] mx-auto flex max-w-lg items-center gap-3 rounded-2xl border border-outline-variant/30 bg-surface-container-high p-3 shadow-xl md:inset-x-auto md:right-6">
      <img src={BRAND_LOGO_URL} alt="" className="h-10 w-10 rounded-xl bg-white object-contain p-1" />
      <p className="min-w-0 flex-1 font-semibold text-on-surface">Ku rakib {APP_NAME}</p>
      <button
        type="button"
        onClick={install}
        className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary"
      >
        {inApp && !canNativeInstall ? "Fur browser" : "Install"}
      </button>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 rounded-lg p-2 text-on-surface-variant hover:bg-surface-container"
        aria-label="Close"
      >
        <X size={18} />
      </button>
    </div>
  );
}
