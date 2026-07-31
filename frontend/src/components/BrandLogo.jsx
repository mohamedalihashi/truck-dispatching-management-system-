import { Link } from "react-router-dom";
import { APP_NAME, APP_TAGLINE, BRAND_LOGO_URL } from "../brand";

const sizeMap = {
  xs: { img: "h-7 w-auto", text: "text-base", gap: "gap-1.5" },
  sm: { img: "h-8 w-auto", text: "text-lg", gap: "gap-2" },
  md: { img: "h-10 w-auto", text: "text-xl", gap: "gap-2.5" },
  lg: { img: "h-12 w-auto", text: "text-2xl", gap: "gap-3" },
  xl: { img: "h-14 w-auto", text: "text-3xl", gap: "gap-3" }
};

/**
 * GaariHel wordmark + logo mark.
 * @param {"xs"|"sm"|"md"|"lg"|"xl"} size
 * @param {boolean} showName — show "GaariHel" text beside logo (logo already includes name; default false for mark-only, true when using cropped look)
 * @param {boolean} showTagline
 * @param {boolean} linkToHome
 * @param {"default"|"light"|"onDark"} tone
 */
export function BrandLogo({
  size = "md",
  showName = false,
  showTagline = false,
  linkToHome = true,
  tone = "default",
  className = "",
  markOnly = false
}) {
  const s = sizeMap[size] || sizeMap.md;
  const nameClass =
    tone === "light" || tone === "onDark"
      ? "text-white"
      : "text-primary";
  const tagClass =
    tone === "light" || tone === "onDark"
      ? "text-white/75"
      : "text-on-surface-variant";

  const content = (
    <span className={`inline-flex min-w-0 items-center ${s.gap} ${className}`}>
      <img
        src={BRAND_LOGO_URL}
        alt={APP_NAME}
        className={`${s.img} max-w-[min(100%,220px)] object-contain object-left ${markOnly ? "max-h-10" : ""}`}
        decoding="async"
      />
      {showName ? (
        <span className="min-w-0">
          <span className={`block font-bold tracking-tight ${s.text} ${nameClass}`}>
            <span className="text-[#00224D] dark:text-white">Gaari</span>
            <span className="text-[#F27405]">Hel</span>
          </span>
          {showTagline ? (
            <span className={`mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.12em] ${tagClass}`}>
              {APP_TAGLINE}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );

  if (!linkToHome) return content;
  return (
    <Link to="/" className="inline-flex min-w-0 items-center" aria-label={APP_NAME}>
      {content}
    </Link>
  );
}
