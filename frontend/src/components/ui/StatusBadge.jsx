import { statusTone } from "../../utils/helpers";
import { useLanguage } from "../../contexts/LanguageContext";

const tones = {
  success: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800",
  warn: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800",
  danger: "bg-error-container text-on-error-container border-red-200 dark:border-red-900",
  info: "bg-primary-fixed text-on-primary-fixed border-primary-fixed-dim dark:bg-primary-fixed-dim/40 dark:text-primary-fixed"
};

export function StatusBadge({ status }) {
  const { t } = useLanguage();
  const label = status != null && status !== "" ? t(String(status)) : "";
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tones[statusTone(status)]}`}
    >
      {label}
    </span>
  );
}
