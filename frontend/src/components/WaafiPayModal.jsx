import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";
import { money, paymentBalance } from "../utils/helpers";
import { useLanguage } from "../contexts/LanguageContext";

export function WaafiPayModal({ payment, open, onClose, onPay, loading, error, currency = "SLSH" }) {
  const { t } = useLanguage();
  const [accountNo, setAccountNo] = useState("");
  const [payAmount, setPayAmount] = useState("");

  const balanceDue = payment ? paymentBalance(payment) : 0;

  useEffect(() => {
    if (payment) {
      setPayAmount(String(payment.requiredPaymentAmount || paymentBalance(payment)));
      setAccountNo("");
    }
  }, [payment?.id, payment?.amount, payment?.amountPaid]);

  if (!open || !payment) return null;

  async function handleSubmit(event) {
    event.preventDefault();
    await onPay({
      paymentId: payment.id,
      accountNo,
      payAmount: Number(payAmount),
    });
  }

  const tipText =
    payment.fullPaymentOnce || payment.loadType === "SHARED" || payment.paymentStage === "Payment Due"
      ? t("waafi.sharedOnce")
      : payment.paymentStage === "Deposit Due"
        ? t("waafi.ftlDeposit")
        : t("waafi.ftlBalance");

  return (
    <Modal title={t("waafi.title")} onClose={onClose}>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs text-on-surface-variant">Total invoice</p>
              <p className="mt-1 text-lg font-semibold text-on-surface">
                {money(payment.amount)} {currency}
              </p>
            </div>
            <div>
              <p className="text-xs text-on-surface-variant">Already paid</p>
              <p className="mt-1 text-lg font-semibold text-success">
                {money(payment.amountPaid || 0)} {currency}
              </p>
            </div>
            <div>
              <p className="text-xs text-on-surface-variant">Balance due</p>
              <p className="mt-1 text-lg font-bold text-primary">
                {money(balanceDue)} {currency}
              </p>
            </div>
          </div>
          {payment.tripId ? (
            <p className="mt-3 text-sm text-on-surface-variant">Trip: {payment.tripId}</p>
          ) : null}
          {payment.description ? (
            <p className="mt-1 text-sm text-on-surface-variant">{payment.description}</p>
          ) : null}
        </div>

        <div className="rounded-xl border border-amber-300/40 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="font-semibold">{t("waafi.beforePay")}</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-xs">
            <li>{tipText}</li>
            <li>{t("waafi.useWallet")}</li>
            <li>{t("waafi.approvePhone")}</li>
          </ul>
        </div>

        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-on-surface-variant">
            {t("waafi.amountLabel")} ({currency})
          </span>
          <input
            className="stitch-input w-full"
            type="number"
            min="0.01"
            max={payment.requiredPaymentAmount || balanceDue}
            step="0.01"
            value={payAmount}
            readOnly
            required
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-on-surface-variant">
            {t("waafi.walletNumber")}
          </span>
          <div className="relative">
            <Smartphone
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-outline"
              size={18}
            />
            <input
              className="stitch-input w-full pl-10"
              type="tel"
              inputMode="numeric"
              placeholder="252618827482"
              value={accountNo}
              onChange={(e) => setAccountNo(e.target.value)}
              required
            />
          </div>
        </label>

        {error ? <p className="text-sm text-error">{error}</p> : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            disabled={
              loading ||
              !accountNo.trim() ||
              !payAmount ||
              Number(payAmount) < 0.01 ||
              Number(payAmount) > (payment.requiredPaymentAmount || balanceDue)
            }
          >
            {loading ? t("waafi.processing") : `${t("waafi.payNow")} ${money(payAmount || 0)}`}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
