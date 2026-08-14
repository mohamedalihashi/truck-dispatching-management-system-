import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { registerSW } from "virtual:pwa-register";

export function PwaUpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [updateSW, setUpdateSW] = useState(() => () => {});

  useEffect(() => {
    // Register in both prod and PWA-enabled dev so Install / offline work.
    if (import.meta.env.DEV && import.meta.env.VITE_PWA_DEV === "false") return;

    const update = registerSW({
      immediate: true,
      onNeedRefresh() {
        setNeedRefresh(true);
      },
      onOfflineReady() {
        setOfflineReady(true);
        window.setTimeout(() => setOfflineReady(false), 4000);
      }
    });
    setUpdateSW(() => update);
  }, []);

  if (!needRefresh && !offlineReady) return null;

  return (
    <div className="fixed inset-x-4 top-20 z-[100] mx-auto flex max-w-lg items-center justify-between gap-3 rounded-xl border border-outline-variant/30 bg-surface-container-high px-4 py-3 shadow-lg">
      {needRefresh ? (
        <>
          <p className="text-sm text-on-surface">A new version of GaariHel is available.</p>
          <button
            type="button"
            onClick={() => updateSW(true)}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-on-primary"
          >
            <RefreshCw size={16} />
            Reload
          </button>
        </>
      ) : (
        <p className="text-sm text-on-surface">GaariHel waa diyaar — waxaad ku rakibi kartaa device-kaaga.</p>
      )}
    </div>
  );
}
