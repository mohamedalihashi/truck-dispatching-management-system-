import { useLanguage } from "../../contexts/LanguageContext";

export function MetricCard({ icon: Icon, label, value, hint, tone = "orange" }) {
  const { t } = useLanguage();
  const tones = {
    orange: "bg-secondary/10 text-secondary",
    amber: "bg-secondary/10 text-secondary",
    blue: "bg-tertiary-container/10 text-on-tertiary-container",
    navy: "bg-surface-tint/10 text-surface-tint",
    green: "bg-secondary-container/10 text-secondary-container",
    soft: "bg-secondary-fixed text-on-secondary-fixed",
    warn: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
  };

  return (
    <article className="flex items-center gap-3 rounded-lg border border-outline-variant/60 bg-surface-container-lowest px-3.5 py-3 shadow-sm transition hover:shadow-md">
      {Icon ? (
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tones[tone] || tones.orange}`}>
          <Icon size={18} />
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">
          {typeof label === "string" ? t(label) : label}
        </h3>
        <p className="text-xl font-bold leading-tight text-on-surface">{value}</p>
      </div>
      {hint ? (
        <span className="hidden shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 sm:inline dark:bg-emerald-950/50 dark:text-emerald-300">
          {typeof hint === "string" ? t(hint) : hint}
        </span>
      ) : null}
    </article>
  );
}
