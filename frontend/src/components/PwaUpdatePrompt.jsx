import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { registerSW } from "virtual:pwa-register";

export function PwaUpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [updateSW, setUpdateSW] = useState(() => () => {});

  useEffect(() => {
    const update = registerSW({
      immediate: true,
      onNeedRefresh() {
        setNeedRefresh(true);
      }
    });
    setUpdateSW(() => update);
  }, []);

  if (!needRefresh) return null;

  return (
    <div className="fixed inset-x-4 top-20 z-[100] mx-auto flex max-w-lg items-center justify-between gap-3 rounded-xl border border-outline-variant/30 bg-surface-container-high px-4 py-3 shadow-lg">
      <p className="text-sm text-on-surface">A new version of GaariHel is available.</p>
      <button
        type="button"
        onClick={() => updateSW(true)}
        className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-on-primary"
      >
        <RefreshCw size={16} />
        Reload
      </button>
    </div>
  );
}
