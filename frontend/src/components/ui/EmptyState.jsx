import { useLanguage } from "../../contexts/LanguageContext";

export function EmptyState({ title, text, action }) {
  const { t } = useLanguage();
  return (
    <div className="rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest px-6 py-12 text-center">
      <h3 className="text-lg font-bold text-primary">{typeof title === "string" ? t(title) : title}</h3>
      <p className="mt-2 text-sm text-on-surface-variant">{typeof text === "string" ? t(text) : text}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
