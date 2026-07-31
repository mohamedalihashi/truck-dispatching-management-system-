import { useLanguage } from "../contexts/LanguageContext";

/** Inline translate helper for hardcoded English UI text. */
export function T({ children, as: Tag = "span", className = "" }) {
  const { t } = useLanguage();
  const text = typeof children === "string" || typeof children === "number" ? t(String(children)) : children;
  return <Tag className={className}>{text}</Tag>;
}
