import { useLanguage } from "../contexts/LanguageContext";

/** FTL payment: request → assign → accept → trip → pay 100% after Delivered. */
export function TripPaymentJourney({ className = "", compact = false }) {
  const { t } = useLanguage();
  const steps = [
    { title: "1. Submit request", text: "Customer submits an FTL cargo request." },
    { title: "2. Admin assigns", text: "Admin reviews and assigns a driver and truck." },
    { title: "3. Driver accepts", text: "Driver Accepts or Rejects. Fare and route stay as set by admin." },
    { title: "4. Trip runs", text: "Driver advances: En Route → Arrived → Picked Up → In Transit → Near Destination → Delivered." },
    { title: "5. Pay 100%", text: "When the trip is Delivered, customer pays the full fare (100%). No deposit before the trip." }
  ];

  if (compact) {
    return (
      <p className={`text-xs text-on-surface-variant ${className}`}>
        {t("FTL: request → admin assigns → driver Accept/Reject → trip → pay 100% after Delivered.")}
      </p>
    );
  }

  return (
    <section className={`rounded-xl border border-outline-variant bg-surface-container-lowest p-5 sm:p-6 ${className}`}>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-primary-container">{t("FTL trip payment")}</h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          {t("Pay the full trip fare after Delivered — commission is not added to the customer invoice.")}
        </p>
      </div>
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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

/** @deprecated 30/70 removed — kept for shared UI helpers that only need total. */
export function paymentBreakdown(total) {
  const amount = Number(total || 0);
  return { amount, deposit: 0, balance: amount };
}
