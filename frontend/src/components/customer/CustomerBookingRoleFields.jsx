import { useLanguage } from "../../contexts/LanguageContext";

export const CUSTOMER_BOOKING_ROLES = [
  {
    value: "SENDER",
    title: "I am sending cargo",
    subtitle: "Take the load from me and deliver it to someone else."
  },
  {
    value: "RECEIVER",
    title: "I am receiving cargo",
    subtitle: "Pick up the load from someone else and bring it to me."
  }
];

export function CustomerBookingRolePicker({ value, onChange, error }) {
  const { t } = useLanguage();
  return (
    <section>
      <h3 className="mb-1 text-sm font-semibold text-on-surface">{t("Who are you in this shipment?")}</h3>
      <p className="mb-3 text-xs text-on-surface-variant">{t("Choose how you are involved in this delivery.")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {CUSTOMER_BOOKING_ROLES.map((role) => (
          <label
            key={role.value}
            className={`flex min-h-[5.5rem] cursor-pointer flex-col gap-1 rounded-lg border px-4 py-3 text-sm transition ${
              value === role.value
                ? "border-secondary-container bg-secondary-container/10"
                : "border-outline-variant hover:bg-surface-container-low"
            }`}
          >
            <span className="flex items-start gap-2">
              <input
                type="radio"
                name="customerBookingRole"
                value={role.value}
                checked={value === role.value}
                onChange={() => onChange(role.value)}
                className="mt-1 h-4 w-4 shrink-0"
              />
              <span className="font-semibold text-on-surface">{t(role.title)}</span>
            </span>
            <span className="pl-6 text-xs text-on-surface-variant">{t(role.subtitle)}</span>
          </label>
        ))}
      </div>
      {error ? <p className="mt-2 text-sm text-error">{error}</p> : null}
    </section>
  );
}

export function CustomerBookingContactFields({
  role,
  user,
  register,
  errors,
  values = {},
  onChange = {}
}) {
  const { t } = useLanguage();
  if (!role) {
    return (
      <p className="text-sm text-on-surface-variant">
        {t("Select whether you are sending or receiving cargo to enter contact details.")}
      </p>
    );
  }

  if (role === "SENDER") {
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-surface-container-low p-4 text-sm">
          <p className="font-semibold text-primary-container">{t("Sender (your profile)")}</p>
          <p className="mt-1 text-on-surface-variant">
            {user?.name || t("Name missing")} · {user?.phone || t("Phone missing")}
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {register ? (
            <>
              <ContactInput
                label="Receiver name"
                name="receiverName"
                register={register}
                error={errors?.receiverName?.message}
              />
              <ContactInput
                label="Receiver phone"
                name="receiverPhone"
                register={register}
                error={errors?.receiverPhone?.message}
                type="tel"
              />
            </>
          ) : (
            <>
              <PlainInput
                label="Receiver name"
                value={values.receiverName}
                onChange={onChange.receiverName}
                required
              />
              <PlainInput
                label="Receiver phone"
                value={values.receiverPhone}
                onChange={onChange.receiverPhone}
                type="tel"
                required
              />
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-surface-container-low p-4 text-sm">
        <p className="font-semibold text-primary-container">{t("Receiver (your profile)")}</p>
        <p className="mt-1 text-on-surface-variant">
          {user?.name || t("Name missing")} · {user?.phone || t("Phone missing")}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {register ? (
          <>
            <ContactInput
              label="Sender name"
              name="senderName"
              register={register}
              error={errors?.senderName?.message}
            />
            <ContactInput
              label="Sender phone"
              name="senderPhone"
              register={register}
              error={errors?.senderPhone?.message}
              type="tel"
            />
          </>
        ) : (
          <>
            <PlainInput
              label="Sender name"
              value={values.senderName}
              onChange={onChange.senderName}
              required
            />
            <PlainInput
              label="Sender phone"
              value={values.senderPhone}
              onChange={onChange.senderPhone}
              type="tel"
              required
            />
          </>
        )}
      </div>
    </div>
  );
}

function ContactInput({ label, name, register, error, type = "text" }) {
  const { t } = useLanguage();
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-on-surface-variant">{t(label)}</span>
      <input
        className="stitch-input"
        type={type}
        {...register(name, {
          required: `${label} is required`,
          validate: (value) => value.trim().length > 0 || `${label} cannot be blank`
        })}
      />
      {error ? <p className="mt-1 text-sm text-error">{error}</p> : null}
    </label>
  );
}

function PlainInput({ label, value, onChange, type = "text", required = false }) {
  const { t } = useLanguage();
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-on-surface-variant">{t(label)}</span>
      <input
        className="stitch-input"
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export function buildCustomerBookingContacts(formValues) {
  const payload = { customerRole: formValues.customerRole };
  if (formValues.customerRole === "SENDER") {
    payload.receiverName = formValues.receiverName.trim();
    payload.receiverPhone = formValues.receiverPhone.trim();
  } else {
    payload.senderName = formValues.senderName.trim();
    payload.senderPhone = formValues.senderPhone.trim();
  }
  return payload;
}
