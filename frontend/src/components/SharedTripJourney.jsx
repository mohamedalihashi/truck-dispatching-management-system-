import { CheckCircle2, Flag, Navigation, Package, Truck, Users, Wallet } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";

/** Explains shared-trip flow: create → book → pickup → in transit → delivered. */
export function SharedTripJourney({ status = null, compact = false, className = "" }) {
  const { t } = useLanguage();

  const STEPS = [
    { key: "create", title: t("sharedJourney.create"), text: t("sharedJourney.createText"), icon: Package },
    { key: "open", title: t("sharedJourney.bookPay"), text: t("sharedJourney.bookPayText"), icon: Wallet },
    { key: "bookings", title: t("sharedJourney.full"), text: t("sharedJourney.fullText"), icon: Users },
    { key: "pickup", title: t("sharedJourney.pickup"), text: t("sharedJourney.pickupText"), icon: Truck },
    { key: "transit", title: t("sharedJourney.transit"), text: t("sharedJourney.transitText"), icon: Navigation },
    { key: "delivered", title: t("sharedJourney.delivered"), text: t("sharedJourney.deliveredText"), icon: Flag },
  ];

  function stepIndexForStatus(value) {
    if (!value || value === "Cancelled") return -1;
    if (value === "Delivered" || value === "Completed") return 5;
    if (value === "In Transit") return 4;
    if (value === "Pickup" || value === "Departed") return 3;
    if (value === "Full") return 2;
    if (value === "Open for booking" || value === "Draft") return 1;
    return 0;
  }

  const activeIndex = status ? stepIndexForStatus(status) : -1;
  const cancelled = status === "Cancelled";

  if (compact) {
    return (
      <div className={`flex flex-wrap gap-1.5 ${className}`}>
        {STEPS.map((step, index) => {
          const done = activeIndex > index || (activeIndex === index && step.key !== "create");
          const current = activeIndex === index;
          return (
            <span
              key={step.key}
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                cancelled
                  ? "bg-surface-container text-on-surface-variant line-through"
                  : current
                    ? "bg-secondary-container text-on-secondary"
                    : done
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                      : "bg-surface-container text-on-surface-variant"
              }`}
            >
              {step.title.replace(/^\d+\.\s*/, "")}
            </span>
          );
        })}
      </div>
    );
  }

  return (
    <section className={`rounded-xl border border-outline-variant bg-surface-container-lowest p-5 sm:p-6 ${className}`}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-primary-container">{t("sharedJourney.title")}</h2>
          <p className="mt-1 text-sm text-on-surface-variant">{t("sharedJourney.intro")}</p>
        </div>
        {cancelled ? (
          <span className="rounded-full bg-error/10 px-3 py-1 text-xs font-semibold text-error">
            {t("sharedJourney.cancelled")}
          </span>
        ) : status ? (
          <span className="text-xs font-semibold text-on-surface-variant">
            {t("sharedJourney.current")}: {status}
          </span>
        ) : null}
      </div>

      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {STEPS.map((step, index) => {
          const Icon = step.icon;
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
              <div className="mb-2 flex items-center gap-2">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                    current
                      ? "bg-secondary-container text-on-secondary"
                      : done
                        ? "bg-emerald-600 text-white"
                        : "bg-surface-container-highest text-on-surface-variant"
                  }`}
                >
                  {done ? <CheckCircle2 size={16} /> : <Icon size={16} />}
                </span>
                <p className="text-sm font-semibold text-on-surface">{step.title}</p>
              </div>
              <p className="text-xs leading-relaxed text-on-surface-variant">{step.text}</p>
              {current ? (
                <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-secondary-container">
                  {t("sharedJourney.youAreHere")}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
