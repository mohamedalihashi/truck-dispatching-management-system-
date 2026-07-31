import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, ImagePlus, PhoneCall, Truck } from "lucide-react";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { DataTable } from "../../components/ui/DataTable";
import { Modal } from "../../components/ui/Modal";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { TripPaymentJourney } from "../../components/TripPaymentJourney";
import { useLanguage } from "../../contexts/LanguageContext";
import { api } from "../../services/api";

const bookingStatusLabel = (status) =>
  ({
    NOT_ASSIGNED: "Driver not assigned",
    AWAITING_QUOTE: "Driver — price & time",
    AWAITING_CUSTOMER: "Customer — accept / reject",
    QUOTE_REJECTED: "Quote Rejected",
    ASSIGNED: "Awaiting 30% deposit",
    ACCEPTED: "Accepted",
    PICKUP: "Pickup",
    ARRIVED_PICKUP: "Arrived Pickup",
    LOADED: "Loaded",
    IN_TRANSIT: "In Transit",
    DELIVERED: "Delivered",
    CANCELLED: "Cancelled",
  })[status] || status.replace(/_/g, " ");

const ADMIN_BOOKING_STEPS = [
  { title: "1. Book", text: "Admin creates an FTL phone booking for the customer." },
  { title: "2. Assign driver", text: "Assign an available FTL driver." },
  { title: "3. Price & time", text: "Driver enters price and ETA (or declines with a reason)." },
  { title: "4. Accept & 30%", text: "Customer accepts and pays 30% — the trip can start." },
  { title: "5. Pay 70%", text: "After delivery, customer pays the remaining 70%." }
];

export function AdminBookingPage() {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [assigning, setAssigning] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [error, setError] = useState("");

  const bookingsQuery = useQuery({
    queryKey: ["phone-assisted-bookings"],
    queryFn: () => api.listPhoneBookings({ limit: 100 }),
  });
  const customersQuery = useQuery({
    queryKey: ["phone-booking-customers"],
    queryFn: () => api.listUsers({ role: "customer", status: "Active", limit: 100 }),
  });
  const availableQuery = useQuery({
    queryKey: ["phone-booking-available-options"],
    queryFn: () => api.listPhoneBookingOptions(),
    refetchInterval: 30_000,
  });
  const optionsQuery = useQuery({
    queryKey: ["phone-booking-assignment-options", assigning?.id],
    queryFn: () => api.phoneBookingAssignmentOptions(assigning.id),
    enabled: Boolean(assigning),
  });

  const assign = useMutation({
    mutationFn: ({ id, option }) =>
      api.assignPhoneBooking(id, option.sharedTripId ? { sharedTripId: option.sharedTripId } : { truckId: option.truckId }),
    onSuccess: () => {
      setAssigning(null);
      qc.invalidateQueries({ queryKey: ["phone-assisted-bookings"] });
      qc.invalidateQueries({ queryKey: ["trips"] });
      qc.invalidateQueries({ queryKey: ["cargo-requests"] });
    },
    onError: (requestError) => setError(requestError.message),
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Admin Booking (Telefoon)"
        subtitle="FTL phone booking — same flow: book → driver price & time → customer accept & 30% → trip → 70%."
        actions={
          <Button
            variant="secondary"
            onClick={() => {
              setCreating({ manual: true });
              setError("");
            }}
          >
            <PhoneCall size={16} /> Create without selecting a driver
          </Button>
        }
      />

      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-primary-container">{t("Admin booking workflow (FTL)")}</h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          {t("Phone bookings follow the same FTL payment flow.")}
        </p>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {ADMIN_BOOKING_STEPS.map((step) => (
            <li key={step.title} className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
              <p className="text-sm font-semibold text-on-surface">{t(step.title)}</p>
              <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">{t(step.text)}</p>
            </li>
          ))}
        </ol>
      </section>

      <TripPaymentJourney />

      {error && <p className="rounded-lg bg-error/10 p-3 text-sm text-error">{error}</p>}

      <AvailableOptions
        data={availableQuery.data}
        isLoading={availableQuery.isLoading}
        onSelect={(option) => {
          setCreating(option);
          setError("");
        }}
      />

      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
        <div className="border-b border-outline-variant px-6 py-5">
          <h2 className="text-xl font-semibold text-primary-container">{t("Phone bookings")}</h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            {t("FTL: assign driver → wait for price & time → customer accepts and pays 30%.")}
          </p>
        </div>
        {bookingsQuery.isLoading ? (
          <p className="py-10 text-center text-sm text-on-surface-variant">{t("Loading bookings…")}</p>
        ) : (
          <DataTable
            rows={bookingsQuery.data?.data || []}
            empty="No phone bookings yet."
            columns={[
              { key: "id", label: "Booking" },
              { key: "loadType", label: "Type" },
              { key: "senderName", label: "Pickup contact" },
              { key: "pickup", label: "Pickup location" },
              { key: "destination", label: "Delivery location" },
              { key: "weight", label: "Weight" },
              { key: "driver", label: "Driver", render: (row) => row.driver || t("Not assigned") },
              {
                key: "offer",
                label: "Price",
                render: (row) =>
                  row.quotedPrice != null
                    ? `$${Number(row.quotedPrice).toLocaleString()} · ${row.quotedEstimatedTime || "—"}`
                    : "—"
              },
              { key: "status", label: "Status", render: (row) => <StatusBadge status={bookingStatusLabel(row.status)} /> },
              {
                key: "actions",
                label: "Actions",
                render: (row) => (
                  <div className="flex gap-2">
                    <button type="button" className="p-1 text-on-surface-variant" onClick={() => setViewing(row)}>
                      <Eye size={16} />
                    </button>
                    {row.status === "NOT_ASSIGNED" && (
                      <Button
                        className="px-3 py-1 text-xs"
                        onClick={() => {
                          setAssigning(row);
                          setError("");
                        }}
                      >
                        Assign driver
                      </Button>
                    )}
                  </div>
                ),
              },
            ]}
          />
        )}
      </section>

      {creating && (
        <PhoneBookingForm
          customers={customersQuery.data?.data || []}
          selectedOption={creating.manual ? null : creating}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            qc.invalidateQueries({ queryKey: ["phone-assisted-bookings"] });
            qc.invalidateQueries({ queryKey: ["phone-booking-available-options"] });
            qc.invalidateQueries({ queryKey: ["trips"] });
            qc.invalidateQueries({ queryKey: ["cargo-requests"] });
          }}
        />
      )}

      {assigning && (
        <Modal title={`Select driver — ${assigning.id}`} onClose={() => setAssigning(null)} wide>
          <p className="mb-4 text-sm text-on-surface-variant">
            {assigning.loadType === "FTL"
              ? t("FTL: driver confirms price & time. After the customer accepts, they pay the 30% deposit.")
              : t("Only open shared trips with enough capacity and an active, available driver are shown.")}
          </p>
          {optionsQuery.isLoading ? (
            <p className="py-8 text-center text-sm">{t("Finding available drivers…")}</p>
          ) : !(optionsQuery.data?.data || []).length ? (
            <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
              {t("No active and available driver is currently available.")}
            </p>
          ) : (
            <div className="space-y-3">
              {optionsQuery.data.data.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => assign.mutate({ id: assigning.id, option })}
                  disabled={assign.isPending}
                  className="flex w-full items-center justify-between rounded-xl border border-outline-variant p-4 text-left hover:border-primary hover:bg-primary/5"
                >
                  <div>
                    <p className="font-semibold text-on-surface">{option.driver}</p>
                    <p className="text-sm text-on-surface-variant">
                      {option.route || `${option.truckNumber} · ${option.truckType || ""}`}
                    </p>
                    <p className="text-xs text-on-surface-variant">
                      {option.plateNumber}{" "}
                      {option.availableTons != null ? `· ${option.availableTons}t available` : `· ${option.capacity}`}
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">
                    {t("Ready")}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Modal>
      )}

      {viewing && (
        <Modal title={`Phone booking ${viewing.id}`} onClose={() => setViewing(null)} wide>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Detail label="Booking type" value={viewing.loadType} />
            <Detail label="Status" value={t(bookingStatusLabel(viewing.status))} />
            <Detail
              label="Price"
              value={viewing.quotedPrice != null ? `$${Number(viewing.quotedPrice).toLocaleString()}` : "—"}
            />
            <Detail label="Estimated time" value={viewing.quotedEstimatedTime || "—"} />
            <Detail
              label="Pickup contact"
              value={`${viewing.senderName || "—"} · ${viewing.senderPhone || "—"}`}
            />
            <Detail label="Pickup location" value={viewing.pickup} />
            <Detail
              label="Delivery contact"
              value={`${viewing.receiverName || "—"} · ${viewing.receiverPhone || "—"}`}
            />
            <Detail label="Delivery location" value={viewing.destination} />
            <Detail label="Cargo description" value={viewing.description} />
            <Detail label="Weight" value={viewing.weight} />
            <Detail label="Driver" value={viewing.driver || t("Not assigned")} />
            <Detail label="Truck" value={viewing.truck || t("Not assigned")} />
            {viewing.cargoImageUrl && (
              <img className="max-h-56 rounded-xl object-cover sm:col-span-2" src={viewing.cargoImageUrl} alt="Cargo" />
            )}
          </dl>
        </Modal>
      )}
    </div>
  );
}

function PhoneBookingForm({ customers, selectedOption, onClose, onCreated }) {
  const { t } = useLanguage();
  const [form, setForm] = useState({
    loadType: selectedOption?.loadType || "FTL",
    pickupContactName: "",
    pickupContactPhone: "",
    pickup: "",
    destinationContactName: "",
    destinationContactPhone: "",
    destination: "",
    truckType: selectedOption?.truckType || "",
    weightAmount: "",
    weightUnit: "tons",
    description: "",
  });
  const [photo, setPhoto] = useState(null);
  const [error, setError] = useState("");
  const create = useMutation({
    mutationFn: async () => {
      const normalizePhone = (value) => String(value || "").replace(/\D/g, "");
      const pickupPhone = normalizePhone(form.pickupContactPhone);
      const destinationPhone = normalizePhone(form.destinationContactPhone);
      const customer =
        customers.find((item) => normalizePhone(item.phone) === pickupPhone) ||
        customers.find((item) => normalizePhone(item.phone) === destinationPhone);
      if (!customer) {
        throw new Error(
          "No active customer found for the pickup or delivery contact phone."
        );
      }
      const weightTons = form.weightUnit === "kg" ? Number(form.weightAmount) / 1000 : Number(form.weightAmount);
      const booking = await api.createPhoneBooking({
        ...form,
        customerId: customer.id,
        weight: `${weightTons} tons`,
      });
      if (photo && booking?.id) {
        const body = new FormData();
        body.append("cargoImage", photo);
        await api.uploadCargoImage(booking.id, body);
      }
      if (selectedOption) {
        await api.assignPhoneBooking(
          booking.id,
          selectedOption.sharedTripId
            ? { sharedTripId: selectedOption.sharedTripId }
            : { truckId: selectedOption.truckId }
        );
      }
      return booking;
    },
    onSuccess: onCreated,
    onError: (requestError) => setError(requestError.message),
  });

  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submit(event) {
    event.preventDefault();
    setError("");
    create.mutate();
  }

  return (
    <Modal title="New phone booking" onClose={onClose} wide>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
        {selectedOption && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 sm:col-span-2">
            <p className="font-semibold">
              {t("Selected")}: {selectedOption.driver} · {selectedOption.truckNumber}
            </p>
            <p>{selectedOption.route || `${selectedOption.truckType} · ${selectedOption.plateNumber}`}</p>
          </div>
        )}
        <Field label="Booking type">
          <select
            className="stitch-input w-full"
            disabled={Boolean(selectedOption)}
            value={form.loadType}
            onChange={(e) => set("loadType", e.target.value)}
          >
            <option value="FTL">Full Truck (FTL)</option>
            <option value="SHARED">Shared Load (LTL)</option>
          </select>
        </Field>
        <Field label="Required truck type">
          <input
            className="stitch-input w-full"
            required={form.loadType === "FTL"}
            disabled={form.loadType !== "FTL" || Boolean(selectedOption)}
            value={form.truckType}
            onChange={(e) => set("truckType", e.target.value)}
          />
        </Field>
        <Field label="Pickup contact name">
          <input
            className="stitch-input w-full"
            type="text"
            maxLength={100}
            required
            value={form.pickupContactName}
            onChange={(e) => set("pickupContactName", e.target.value)}
          />
        </Field>
        <Field label="Pickup contact phone">
          <input
            className="stitch-input w-full"
            type="tel"
            inputMode="tel"
            maxLength={20}
            required
            value={form.pickupContactPhone}
            onChange={(e) => set("pickupContactPhone", e.target.value)}
          />
        </Field>
        <Field label="Pickup location" wide>
          <input
            className="stitch-input w-full"
            type="text"
            maxLength={255}
            required
            value={form.pickup}
            onChange={(e) => set("pickup", e.target.value)}
          />
        </Field>
        <Field label="Delivery contact name">
          <input
            className="stitch-input w-full"
            type="text"
            maxLength={100}
            required
            value={form.destinationContactName}
            onChange={(e) => set("destinationContactName", e.target.value)}
          />
        </Field>
        <Field label="Delivery contact phone">
          <input
            className="stitch-input w-full"
            type="tel"
            inputMode="tel"
            maxLength={20}
            required
            value={form.destinationContactPhone}
            onChange={(e) => set("destinationContactPhone", e.target.value)}
          />
        </Field>
        <Field label="Delivery location" wide>
          <input
            className="stitch-input w-full"
            type="text"
            maxLength={255}
            required
            value={form.destination}
            onChange={(e) => set("destination", e.target.value)}
          />
        </Field>
        <Field label="Cargo weight">
          <div className="grid grid-cols-[1fr_120px] gap-2">
            <input
              className="stitch-input w-full"
              type="number"
              min="0.01"
              step="0.01"
              required
              value={form.weightAmount}
              onChange={(e) => set("weightAmount", e.target.value)}
            />
            <select
              className="stitch-input"
              value={form.weightUnit}
              onChange={(e) => set("weightUnit", e.target.value)}
            >
              <option value="kg">kg</option>
              <option value="tons">tons</option>
            </select>
          </div>
        </Field>
        <Field label="Cargo description">
          <input
            className="stitch-input w-full"
            type="text"
            maxLength={1000}
            required
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </Field>
        <Field label="Cargo image" wide>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-outline-variant p-5">
            <input
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setPhoto(e.target.files?.[0] || null)}
            />
            <ImagePlus size={20} /> {photo ? photo.name : t("Select cargo image (optional)")}
          </label>
        </Field>
        {error && <p className="text-sm text-error sm:col-span-2">{error}</p>}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={create.isPending}>
            <Truck size={16} />{" "}
            {create.isPending
              ? "Saving…"
              : selectedOption
                ? "Create booking and assign driver"
                : "Create booking without driver"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function AvailableOptions({ data, isLoading, onSelect }) {
  const { t } = useLanguage();
  if (isLoading) {
    return <p className="py-8 text-center text-sm text-on-surface-variant">{t("Loading available trucks…")}</p>;
  }
  const ftl = data?.ftl || [];
  const shared = data?.shared || [];
  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-primary-container">{t("Available FTL trucks")}</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {ftl.map((option) => (
            <OptionCard key={option.id} option={option} onSelect={onSelect} />
          ))}
          {!ftl.length && <p className="text-sm text-on-surface-variant">{t("No FTL truck is available right now.")}</p>}
        </div>
      </div>
      <div>
        <h2 className="text-lg font-semibold text-primary-container">{t("Open shared trips")}</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shared.map((option) => (
            <OptionCard key={option.id} option={option} onSelect={onSelect} />
          ))}
          {!shared.length && (
            <p className="text-sm text-on-surface-variant">{t("No open shared trip with free capacity right now.")}</p>
          )}
        </div>
      </div>
    </section>
  );
}

function OptionCard({ option, onSelect }) {
  const { t } = useLanguage();
  return (
    <article className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-on-surface">
            {option.truckNumber} · {option.truckType}
          </p>
          <p className="text-sm text-on-surface-variant">
            {option.driver} · {option.plateNumber}
          </p>
        </div>
        <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-700">
          {t("Ready")}
        </span>
      </div>
      <p className="mt-2 text-sm text-on-surface-variant">
        {option.route || option.capacity}
        {option.availableTons != null ? ` · ${option.availableTons}t available` : ""}
      </p>
      <Button className="mt-3 w-full" onClick={() => onSelect(option)}>
        Book for customer
      </Button>
    </article>
  );
}

function Field({ label, children, wide = false }) {
  const { t } = useLanguage();
  return (
    <label className={`block text-sm ${wide ? "sm:col-span-2" : ""}`}>
      <span className="mb-1 block font-medium text-on-surface-variant">{t(label)}</span>
      {children}
    </label>
  );
}

function Detail({ label, value }) {
  const { t } = useLanguage();
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-on-surface-variant">{t(label)}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}
