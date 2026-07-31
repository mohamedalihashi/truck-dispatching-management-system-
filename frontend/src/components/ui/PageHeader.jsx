import { useLanguage } from "../../contexts/LanguageContext";

export function PageHeader({ title, subtitle, actions }) {
  const { t } = useLanguage();
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-[32px] font-bold leading-10 tracking-[-0.02em] text-primary">
          {typeof title === "string" ? t(title) : title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-base text-on-surface-variant">
            {typeof subtitle === "string" ? t(subtitle) : subtitle}
          </p>
        ) : null}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
