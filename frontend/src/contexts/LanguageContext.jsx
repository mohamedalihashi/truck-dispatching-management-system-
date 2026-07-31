import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { translations } from "../i18n/translations";
import { soPhrases } from "../i18n/soPhrases";

const STORAGE_KEY = "td_lang";
const LanguageContext = createContext(null);

function resolvePath(dict, path) {
  if (!path || typeof path !== "string" || !path.includes(".")) return undefined;
  return path.split(".").reduce((acc, part) => (acc && acc[part] != null ? acc[part] : undefined), dict);
}

function detectInitialLang() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "so") return stored;
  } catch {
    /* ignore */
  }
  const browser = (navigator.language || "").toLowerCase();
  if (browser.startsWith("so")) return "so";
  return "en";
}

function interpolate(template, vars) {
  if (!vars || typeof template !== "string") return template;
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    vars[key] != null ? String(vars[key]) : `{${key}}`
  );
}

/** Translate dynamic titles like "Trip TR-12" / "Bid on CR-9". */
const SO_DYNAMIC_PREFIXES = [
  ["Bids for ", "Bids-ka "],
  ["Confirm booking ", "Xaqiiji booking "],
  ["Decline booking ", "Diid booking "],
  ["Phone Booking ", "Booking Telefoon "],
  ["Shared Trip ", "Safar Shared "],
  ["Assign driver ", "Dooro darawal "],
  ["Select driver — ", "Dooro darawal — "],
  ["Phone booking ", "Booking telefoon "],
  ["Edit bid ", "Wax ka beddel bid "],
  ["Bid on ", "Bid samee "],
  ["Request ", "Codsi "],
  ["Reassign ", "Dib u qoondee "],
  ["Edit ", "Wax ka beddel "],
  ["Book ", "Book "],
  ["Trip ", "Safar "]
];

function softPhraseTranslate(raw) {
  const exact = soPhrases[raw];
  if (exact != null) return exact;
  for (const [en, so] of SO_DYNAMIC_PREFIXES) {
    if (raw.startsWith(en)) return so + raw.slice(en.length);
  }
  return null;
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(detectInitialLang);

  useEffect(() => {
    document.documentElement.lang = lang === "so" ? "so" : "en";
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* ignore */
    }
  }, [lang]);

  const setLang = useCallback((next) => {
    setLangState(next === "so" ? "so" : "en");
  }, []);

  const toggleLang = useCallback(() => {
    setLangState((prev) => (prev === "so" ? "en" : "so"));
  }, []);

  /**
   * Translate a nested key (nav.dashboard) OR an English phrase ("Trips").
   * Optional 2nd arg: fallback string OR vars object for {name} interpolation.
   */
  const t = useCallback(
    (key, fallbackOrVars, maybeVars) => {
      if (key == null || key === "") return "";
      const raw = String(key);
      let vars = null;
      let fallback = null;
      if (fallbackOrVars && typeof fallbackOrVars === "object" && !Array.isArray(fallbackOrVars)) {
        vars = fallbackOrVars;
      } else {
        fallback = fallbackOrVars;
        if (maybeVars && typeof maybeVars === "object") vars = maybeVars;
      }

      const nested =
        resolvePath(translations[lang], raw) ?? resolvePath(translations.en, raw);
      if (nested != null) return interpolate(nested, vars);

      if (lang === "so") {
        const phrase = softPhraseTranslate(raw);
        if (phrase != null) return interpolate(phrase, vars);
      }

      if (fallback != null) return interpolate(String(fallback), vars);
      return interpolate(raw, vars);
    },
    [lang]
  );

  const value = useMemo(
    () => ({ lang, setLang, toggleLang, t, isSomali: lang === "so" }),
    [lang, setLang, toggleLang, t]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
