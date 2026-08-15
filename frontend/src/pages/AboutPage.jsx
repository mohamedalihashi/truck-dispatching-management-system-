import { Link } from "react-router-dom";
import { ArrowRight, MapPin, Shield, Truck, Users } from "lucide-react";
import { PublicSiteHeader } from "../components/PublicSiteHeader";
import { BrandLogo } from "../components/BrandLogo";
import { APP_NAME, APP_TAGLINE } from "../brand";
import { useLanguage } from "../contexts/LanguageContext";

const VALUES = [
  {
    icon: Shield,
    titleEn: "Trusted drivers",
    titleSo: "Darawalo lagu kalsoon yahay",
    textEn: "Drivers and trucks are registered by admin with documents on file.",
    textSo: "Darawalka iyo gaariga waxaa diiwaangeliya admin oo dukumentiyada ku kaydsan yihiin.",
  },
  {
    icon: Truck,
    titleEn: "FTL & Shared",
    titleSo: "FTL & Shared",
    textEn: "Book a full truck or share capacity across Somalia routes.",
    textSo: "Buuxi gaari oo dhan ama la wadaag awoodda waddooyinka Soomaaliya.",
  },
  {
    icon: MapPin,
    titleEn: "Live trip status",
    titleSo: "Xaaladda safarka",
    textEn: "Follow pickup, in transit, and delivery updates in real time.",
    textSo: "Raac qaadis, socdaal, iyo gaarsiin waqti-dhab ah.",
  },
  {
    icon: Users,
    titleEn: "Admin dispatch",
    titleSo: "Admin ayaa qoondeeya",
    textEn: "Customers request; admins assign; drivers deliver — clear accountability.",
    textSo: "Macmiilku wuu codsadaa; admin ayaa qoondeeya; darawalku wuu geeyaa.",
  },
];

export function AboutPage() {
  const { language, t } = useLanguage();
  const so = language === "so";

  return (
    <div className="min-h-screen bg-background text-on-surface">
      <PublicSiteHeader variant="public" />

      <main className="pt-[calc(4rem+env(safe-area-inset-top))] sm:pt-20">
        <section className="hero-gradient relative overflow-hidden px-6 py-16 text-white sm:py-20">
          <div className="pointer-events-none absolute inset-0 opacity-15">
            <div className="absolute right-[-10%] top-10 h-[400px] w-[400px] rounded-full bg-secondary-container blur-[100px]" />
          </div>
          <div className="relative z-10 mx-auto flex max-w-5xl flex-col items-start gap-8 sm:flex-row sm:items-center sm:gap-12">
            <div className="shrink-0 rounded-2xl bg-white/95 p-4 shadow-lg sm:p-5">
              <BrandLogo size="lg" layout="stack" linkToHome showTagline tone="default" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary-fixed">
                {so ? "Shirkadda" : "Company"}
              </p>
              <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">
                {so ? `Ku saabsan ${APP_NAME}` : `About ${APP_NAME}`}
              </h1>
              <p className="mt-4 max-w-2xl text-lg text-on-primary-container">
                {so
                  ? `${APP_TAGLINE}. Platform dispatch oo Soomaaliya u gaar ah — macmiil, admin, iyo darawal.`
                  : `${APP_TAGLINE}. A Somalia-focused truck dispatch platform connecting customers, admins, and drivers.`}
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-6 py-14">
          <div className="mt-0 space-y-5 text-base leading-relaxed text-on-surface-variant">
            <p>
              {so
                ? `${APP_NAME} waa nidaam maamul oo xamuul iyo gaadiid ah. Macaamiishu waxay gudbiyaan codsiyada; adminku wuxuu darawalka u qoondeeyaa; darawalku wuxuu safarka fuliyaa.`
                : `${APP_NAME} is a truck and cargo management system. Customers submit cargo requests; admins assign drivers; drivers run the trips.`}
            </p>
            <p>
              {so
                ? "Gudbi codsi, sug qoondaynta admin, raac xaaladda safarka, xaqiiji gaarsiinta, ka dibna bixi 100% WaafiPay (EVC / ZAAD)."
                : "Submit a request, wait for admin assignment, follow trip status, confirm delivery, then pay 100% with WaafiPay (EVC / ZAAD)."}
            </p>
            <p>
              {so
                ? "Kaliya macaamiishu ayaa is-diiwaangelin kara. Darawalada waxaa abuura admin (hal darawal = hal gaari) si mas'uuliyaddu u caddaato."
                : "Only customers self-register. Drivers are created by an admin (one driver = one truck) so assignment and accountability stay clear."}
            </p>
          </div>
        </section>

        <section className="border-y border-outline-variant bg-surface-container-lowest px-6 py-14">
          <div className="mx-auto max-w-7xl">
            <h2 className="text-center text-2xl font-bold text-primary">
              {so ? "Maxaan u jirnaa" : "What we stand for"}
            </h2>
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {VALUES.map(({ icon: Icon, titleEn, titleSo, textEn, textSo }) => (
                <article
                  key={titleEn}
                  className="rounded-2xl border border-outline-variant/40 bg-background p-5"
                >
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-secondary-fixed text-secondary">
                    <Icon size={22} />
                  </div>
                  <h3 className="font-semibold text-primary">{so ? titleSo : titleEn}</h3>
                  <p className="mt-2 text-sm text-on-surface-variant">{so ? textSo : textEn}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-6 py-14 text-center">
          <h2 className="text-2xl font-bold text-primary">
            {so ? "Diyaar ma tahay?" : "Ready to get started?"}
          </h2>
          <p className="mt-3 text-on-surface-variant">
            {so
              ? "Samee akoon macmiil ama nala soo xiriir haddii aad tahay darawal."
              : "Create a customer account, or contact us if you are a driver."}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/register"
              className="inline-flex items-center gap-2 rounded-xl bg-secondary-container px-6 py-3 text-sm font-semibold text-on-secondary"
            >
              {t("public.register")} <ArrowRight size={16} />
            </Link>
            <Link
              to="/contact"
              className="rounded-xl border border-outline-variant px-6 py-3 text-sm font-semibold text-primary"
            >
              {t("public.contact")}
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-outline-variant px-6 py-8 text-center text-sm text-on-surface-variant">
        © {new Date().getFullYear()} {APP_NAME}.{" "}
        <Link to="/" className="font-semibold text-primary hover:underline">
          {t("public.home")}
        </Link>
      </footer>
    </div>
  );
}
