import { FileText, MapPin, Package, Route, Wallet } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";

const STEPS = [
  {
    key: "loads",
    title: "1. Available Loads",
    text: "Browse open FTL requests — full truck jobs available to bid or confirm."
  },
  {
    key: "offers",
    title: "2. Price & time",
    text: "Send your FTL price and estimated time. Customer accepts or rejects."
  },
  {
    key: "trips",
    title: "3. Accept & 30%",
    text: "Customer accepts and pays 30% deposit — only then the FTL trip can start."
  },
  {
    key: "tracking",
    title: "4. FTL trip",
    text: "Run and track the full-truck trip until delivery."
  },
  {
    key: "earnings",
    title: "5. Pay 70% & earn",
    text: "After delivery confirmation, customer pays 70% — then you get paid."
  }
];

const STATUS_TO_STEP = {
  Assigned: 2,
  Accepted: 3,
  "Arrived Pickup": 3,
  Loaded: 3,
  "In Transit": 3,
  Delayed: 3,
  Delivered: 4,
  Cancelled: -1
};

/** Explains FTL trip flow from available loads until 30%/70% payment and earnings. */
export function FtlDriverJourney({ status = null, className = "" }) {
  const { t } = useLanguage();
  const activeIndex = status ? (STATUS_TO_STEP[status] ?? 0) : -1;
  const cancelled = status === "Cancelled";

  return (
    <section className={`rounded-xl border border-outline-variant bg-surface-container-lowest p-5 sm:p-6 ${className}`}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-primary-container">{t("FTL trip journey")}</h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            {t("Full truck trip: find load → price & time → customer pays 30% → run trip → 70% after delivery.")}
          </p>
        </div>
        {cancelled ? (
          <span className="rounded-full bg-error/10 px-3 py-1 text-xs font-semibold text-error">{t("Cancelled")}</span>
        ) : status ? (
          <span className="text-xs font-semibold text-on-surface-variant">
            {t("Current")}: {t(status)}
          </span>
        ) : null}
      </div>

      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {STEPS.map((step, index) => {
          const done = !cancelled && activeIndex > index;
          const current = !cancelled && activeIndex === index;
          return (
            <li
              key={step.key}
              className={`rounded-xl border p-4 ${
                current
                  ? "border-secondary-container bg-secondary-fixed/40"
                  : done
                    ? "border-emerald-200 bg-emerald-50/80 dark:border-emerald-800 dark:bg-emerald-950/30"
                    : "border-outline-variant bg-surface-container-low"
              }`}
            >
              <p className="text-sm font-semibold text-on-surface">{t(step.title)}</p>
              <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">{t(step.text)}</p>
              {current ? (
                <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-secondary-container">
                  {t("You are here")}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export const FTL_DRIVER_ACTIONS = [
  {
    to: "/driver/marketplace",
    icon: Package,
    title: "Available Loads",
    text: "FTL jobs available to bid on.",
    tone: "bg-secondary-fixed text-on-secondary-fixed"
  },
  {
    to: "/driver/my-bids",
    icon: FileText,
    title: "My Offers",
    text: "Track FTL price offers you sent.",
    tone: "bg-tertiary-fixed text-on-tertiary-fixed"
  },
  {
    to: "/driver/jobs",
    icon: Route,
    title: "FTL Trips",
    text: "After 30% deposit — until delivery ends.",
    tone: "bg-primary-fixed text-on-primary-fixed"
  },
  {
    to: "/driver/tracking",
    icon: MapPin,
    title: "Tracking",
    text: "Live location for active FTL loads.",
    tone: "bg-secondary-fixed text-on-secondary-fixed"
  },
  {
    to: "/driver/earnings",
    icon: Wallet,
    title: "Earnings",
    text: "Paid after customer 30% + 70%.",
    tone: "bg-tertiary-fixed text-on-tertiary-fixed"
  }
];
