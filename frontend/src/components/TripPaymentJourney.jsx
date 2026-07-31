import { useLanguage } from "../contexts/LanguageContext";

/** FTL trip payment flow: book → price/time → accept & pay 30% → trip → pay 70%. */
export function TripPaymentJourney({ className = "", compact = false }) {
  const { t } = useLanguage();
  const steps = [
    { title: "1. FTL book", text: "Customer books a full truck (FTL) trip." },
    { title: "2. Price & time", text: "FTL driver confirms price and estimated delivery time." },
    { title: "3. Accept & pay 30%", text: "Customer accepts — pays 30% deposit immediately so the FTL trip can start." },
    { title: "4. FTL trip runs", text: "Driver runs the trip only after the 30% deposit is paid." },
    { title: "5. Pay 70%", text: "When delivered and confirmed, customer pays the remaining 70%." }
  ];

  if (compact) {
    return (
      <p className={`text-xs text-on-surface-variant ${className}`}>
        {t("FTL trip: book → price & time → accept & pay 30% to start → 70% after delivery.")}
      </p>
    );
  }

  return (
    <section className={`rounded-xl border border-outline-variant bg-surface-container-lowest p-5 sm:p-6 ${className}`}>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-primary-container">{t("FTL trip payment")}</h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          {t("How payment works for every full-truck (FTL) trip — from booking until delivery.")}
        </p>
      </div>
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {steps.map((step) => (
          <li key={step.title} className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
            <p className="text-sm font-semibold text-on-surface">{t(step.title)}</p>
            <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">{t(step.text)}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function paymentBreakdown(total) {
  const amount = Number(total || 0);
  const deposit = Math.round(amount * 0.3 * 100) / 100;
  const balance = Math.max(0, Math.round((amount - deposit) * 100) / 100);
  return { amount, deposit, balance };
}
