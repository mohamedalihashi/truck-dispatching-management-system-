import { X } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";

export function Modal({ title, onClose, children, wide = false }) {
  const { t } = useLanguage();
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm dark:bg-black/60">
      <div
        className={`relative z-[2001] max-h-[90vh] w-full overflow-x-hidden overflow-y-auto rounded-2xl border border-outline-variant/40 bg-surface-container-lowest shadow-[0px_8px_24px_rgba(0,0,0,0.1)] ${
          wide ? "max-w-3xl" : "max-w-lg"
        }`}
      >
        <div className="sticky top-0 z-[2002] flex items-center justify-between border-b border-outline-variant/40 bg-surface-container-lowest px-5 py-4">
          <h2 className="text-lg font-bold text-primary">
            {typeof title === "string" ? t(title) : title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-low"
            aria-label={t("Close")}
          >
            <X size={18} />
          </button>
        </div>
        <div className="relative z-[2002] overflow-x-hidden p-5">{children}</div>
      </div>
    </div>
  );
}
