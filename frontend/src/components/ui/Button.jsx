import { Children } from "react";
import { useLanguage } from "../../contexts/LanguageContext";

function translateChild(child, t) {
  if (typeof child !== "string") return child;
  const trimmed = child.trim();
  if (!trimmed) return child;
  return child.replace(trimmed, t(trimmed));
}

export function Button({ children, variant = "primary", className = "", ...props }) {
  const { t } = useLanguage();
  const variants = {
    primary:
      "bg-secondary-container text-on-secondary shadow-md hover:opacity-90 hover:shadow-lg active:scale-[0.98]",
    secondary:
      "bg-surface-container-lowest text-primary border border-outline-variant hover:bg-surface-container-low",
    ghost: "bg-transparent text-on-surface-variant hover:bg-surface-container-low",
    navy: "bg-primary-container text-white hover:opacity-90",
    danger: "bg-error text-on-error hover:opacity-90"
  };

  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {Children.map(children, (child) => translateChild(child, t))}
    </button>
  );
}
