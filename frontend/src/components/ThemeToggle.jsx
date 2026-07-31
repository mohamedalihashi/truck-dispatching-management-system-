import { Check, Laptop, Moon, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "../contexts/ThemeContext";
import { useLanguage } from "../contexts/LanguageContext";

export function ThemeToggle({ className = "" }) {
  const { dark, mode, setMode } = useTheme();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const options = [
    { value: "light", label: t("common.light"), icon: Sun },
    { value: "dark", label: t("common.dark"), icon: Moon },
    { value: "system", label: t("common.system"), icon: Laptop }
  ];

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-on-surface-variant transition hover:border-outline-variant hover:bg-surface-container-low hover:text-on-surface"
        aria-label={t("common.appearance")}
        aria-expanded={open}
        title={`${t("common.appearance")}: ${mode}`}
      >
        {dark ? <Moon size={19} /> : <Sun size={19} />}
      </button>

      {open ? (
        <div className="absolute right-0 top-11 z-[70] w-44 overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest p-1.5 shadow-xl">
          <p className="px-2.5 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
            {t("common.appearance")}
          </p>
          {options.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setMode(value);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition ${
                mode === value
                  ? "bg-secondary-fixed text-on-secondary-fixed"
                  : "text-on-surface hover:bg-surface-container-low"
              }`}
            >
              <Icon size={16} />
              <span className="flex-1 text-left">{label}</span>
              {mode === value ? <Check size={15} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
