import { Download, X } from "lucide-react";
import { usePwaInstall } from "../hooks/usePwaInstall";
import { isInAppBrowser } from "../utils/pwa";
import { APP_NAME, BRAND_LOGO_URL } from "../brand";

export function InstallPwaBanner() {
  const {
    canShow,
    canNativeInstall,
    showHelp,
    setShowHelp,
    helpSteps,
    dismiss,
    install
  } = usePwaInstall();

  if (!canShow) return null;

  const inApp = isInAppBrowser();

  return (
    <div className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[100] mx-auto max-w-lg md:inset-x-auto md:right-6">
      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-high p-3 shadow-xl">
        <div className="flex items-center gap-3">
          <img
            src={BRAND_LOGO_URL}
            alt=""
            className="h-10 w-10 rounded-xl bg-white object-contain p-1"
          />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-on-surface">Ku rakib {APP_NAME}</p>
            <p className="text-xs text-on-surface-variant">
              {canNativeInstall
                ? "Ku dar home screen / desktop"
                : "Raac tilmaamaha si aad u rakibto app-ka"}
            </p>
          </div>
          <button
            type="button"
            onClick={install}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary"
          >
            <Download size={16} />
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

        {(showHelp || (!canNativeInstall && !inApp)) && (
          <div className="mt-3 rounded-xl bg-surface-container-low px-3 py-2 text-sm text-on-surface">
            <p className="mb-1 font-semibold">Sida loo rakibo:</p>
            <ol className="list-decimal space-y-1 pl-4 text-on-surface-variant">
              {helpSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            {showHelp ? (
              <button
                type="button"
                className="mt-2 text-xs font-semibold text-secondary-container"
                onClick={() => setShowHelp(false)}
              >
                Qari
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
