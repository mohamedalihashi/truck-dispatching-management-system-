import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";

/** Somalia-route trucks for the landing hero carousel. */
export const HERO_TRUCKS = [
  {
    src: "/hero/somalia-truck-mogadishu.png",
    alt: "Gaadhi xamuul ah oo ku socda jidka Muqdisho",
    route: "Muqdisho → Baydhabo",
    eta: "5 saac"
  },
  {
    src: "/hero/somalia-truck-berbera.png",
    alt: "Gaadhi xamuul ah dekadda Berbera",
    route: "Berbera → Hargeysa",
    eta: "4 saac"
  },
  {
    src: "/hero/somalia-truck-hargeisa.png",
    alt: "Gaadiid xamuul ah oo u socda Hargeysa",
    route: "Hargeysa → Burco",
    eta: "3 saac"
  },
  {
    src: "/hero/somalia-truck-kismayo.png",
    alt: "Gaadhi xamuul ah jidka Kismaayo",
    route: "Kismaayo → Baydhabo",
    eta: "7 saac"
  },
  {
    src: "/hero/somalia-truck-market.png",
    alt: "Gaadhi xamuul ah oo lagu rarayo suuqa",
    route: "Muqdisho → Marka",
    eta: "2 saac"
  }
];

const INTERVAL_MS = 4500;

export function HeroTruckCarousel({ className = "" }) {
  const { t } = useLanguage();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const active = HERO_TRUCKS[index];

  useEffect(() => {
    HERO_TRUCKS.forEach((truck) => {
      const img = new Image();
      img.src = truck.src;
    });
  }, []);

  useEffect(() => {
    if (paused) return undefined;
    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % HERO_TRUCKS.length);
    }, INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [paused]);

  return (
    <div
      className={`relative ${className}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="relative z-10 aspect-[16/11] overflow-hidden rounded-3xl border border-white/10 shadow-2xl sm:aspect-[4/3]">
        {HERO_TRUCKS.map((truck, i) => (
          <img
            key={truck.src}
            src={truck.src}
            alt={truck.alt}
            className={`absolute inset-0 h-full w-full object-cover transition-all duration-700 ease-out ${
              i === index ? "scale-100 opacity-100" : "scale-105 opacity-0"
            }`}
          />
        ))}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0d1c32]/75 via-transparent to-transparent" />

        <div className="glass-effect absolute bottom-5 left-5 right-5 flex items-center justify-between rounded-2xl p-5">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-secondary-container/20 text-secondary-container">
              <MapPin />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-on-surface-variant">{t("Live Tracking")}</p>
              <p
                key={active.route}
                className="animate-[fadeSlide_0.45s_ease-out] truncate text-sm font-semibold text-primary"
              >
                {active.route}
              </p>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs text-on-surface-variant">ETA</p>
            <p key={active.eta} className="animate-[fadeSlide_0.45s_ease-out] text-sm font-semibold text-secondary">
              {active.eta}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-center gap-2">
        {HERO_TRUCKS.map((truck, i) => (
          <button
            key={truck.src}
            type="button"
            aria-label={`Show truck ${i + 1}`}
            onClick={() => setIndex(i)}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === index ? "w-8 bg-secondary-container" : "w-2.5 bg-white/35 hover:bg-white/55"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
