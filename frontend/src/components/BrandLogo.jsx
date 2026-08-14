import { Link } from "react-router-dom";
import { APP_NAME, APP_TAGLINE, BRAND_ICON_URL } from "../brand";

const sizeMap = {
  xs: {
    icon: "h-8 w-auto max-w-[3.75rem]",
    pad: "rounded-xl px-2 py-1.5",
    text: "text-base",
    gap: "gap-1.5"
  },
  sm: {
    icon: "h-9 w-auto max-w-[4.5rem]",
    pad: "rounded-xl px-2.5 py-1.5",
    text: "text-lg",
    gap: "gap-2"
  },
  md: {
    icon: "h-12 w-auto max-w-[6rem]",
    pad: "rounded-2xl px-3 py-2",
    text: "text-2xl",
    gap: "gap-2"
  },
  lg: {
    icon: "h-14 w-auto max-w-[7rem]",
    pad: "rounded-2xl px-3.5 py-2.5",
    text: "text-3xl",
    gap: "gap-2.5"
  },
  xl: {
    icon: "h-16 w-auto max-w-[8.5rem]",
    pad: "rounded-2xl px-4 py-3",
    text: "text-4xl",
    gap: "gap-3"
  }
};

/**
 * GaariHel brand: original truck+location icon on a light pad (colors stay visible),
 * large name below or beside.
 */
export function BrandLogo({
  size = "md",
  layout = "stack",
  showName = true,
  showTagline = false,
  linkToHome = true,
  tone = "default",
  className = ""
}) {
  const s = sizeMap[size] || sizeMap.md;
  const stacked = layout === "stack";
  const onDark = tone === "light" || tone === "onDark";

  const nameEl = showName ? (
    <span className={`min-w-0 ${stacked ? "text-center" : ""}`}>
      <span
        className={`block font-extrabold tracking-tight ${s.text} ${
          stacked ? "leading-none" : "leading-tight"
        }`}
      >
        <span className={onDark ? "text-white" : "text-[#00224D] dark:text-white"}>Gaari</span>
        <span className="text-[#F27405]">Hel</span>
      </span>
      {showTagline ? (
        <span
          className={`mt-1 block text-[10px] font-semibold uppercase tracking-[0.14em] ${
            onDark ? "text-white/75" : "text-on-surface-variant"
          }`}
        >
          {APP_TAGLINE}
        </span>
      ) : null}
    </span>
  ) : null;

  const content = (
    <span
      className={`inline-flex min-w-0 ${
        stacked ? `flex-col items-center ${s.gap}` : `flex-row items-center ${s.gap}`
      } ${className}`}
    >
      <span
        className={`inline-flex items-center justify-center bg-white shadow-md ring-1 ring-black/5 ${s.pad}`}
      >
        <img
          src={BRAND_ICON_URL}
          alt=""
          aria-hidden={showName}
          className={`${s.icon} shrink-0 object-contain`}
          decoding="async"
        />
      </span>
      {nameEl}
    </span>
  );

  if (!linkToHome) {
    return (
      <span className="inline-flex min-w-0" aria-label={APP_NAME}>
        {content}
      </span>
    );
  }

  return (
    <Link to="/" className="inline-flex min-w-0 items-center" aria-label={APP_NAME}>
      {content}
    </Link>
  );
}
