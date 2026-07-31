import { Languages } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";

/** Compact EN / SO language switcher. */
export function LanguageToggle({ className = "", compact = false }) {
  const { lang, setLang, t } = useLanguage();

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => setLang(lang === "so" ? "en" : "so")}
        className={`inline-flex h-9 items-center gap-1.5 rounded-lg border border-outline-variant px-2.5 text-xs font-bold text-on-surface-variant transition hover:bg-surface-container-low hover:text-on-surface ${className}`}
        aria-label={t("common.language")}
        title={t("common.language")}
      >
        <Languages size={15} />
        {lang === "so" ? "SO" : "EN"}
      </button>
    );
  }

  return (
    <div
      className={`inline-flex items-center rounded-lg border border-outline-variant p-0.5 text-xs font-bold ${className}`}
      role="group"
      aria-label={t("common.language")}
    >
      <button
        type="button"
        onClick={() => setLang("en")}
        className={`rounded-md px-2.5 py-1.5 transition ${
          lang === "en"
            ? "bg-secondary-container text-on-secondary"
            : "text-on-surface-variant hover:text-on-surface"
        }`}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLang("so")}
        className={`rounded-md px-2.5 py-1.5 transition ${
          lang === "so"
            ? "bg-secondary-container text-on-secondary"
            : "text-on-surface-variant hover:text-on-surface"
        }`}
      >
        SO
      </button>
    </div>
  );
}
