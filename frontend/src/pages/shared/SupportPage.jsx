import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Clock3, Headphones, Mail, MessageCircle, Phone, ShieldCheck } from "lucide-react";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { useAuth } from "../../contexts/AuthContext";
import { useSupportContact, useSupportComplaints, useTrips } from "../../hooks/useApi";
import { api } from "../../services/api";

export function SupportPage({ embedded = false }) {
  const { user, refreshUser } = useAuth();
  const qc = useQueryClient();
  const { data: supportContact } = useSupportContact();
  const isCustomer = user?.role === "customer";
  const isAdmin = user?.role === "admin";
  const complaintsQuery = useSupportComplaints({}, { enabled: isCustomer || isAdmin });
  const tripsQuery = useTrips({ limit: 100 }, { enabled: isCustomer });

  const [form, setForm] = useState({
    againstRole: "driver",
    referenceId: "",
    subject: "",
    message: ""
  });
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void refreshUser?.().catch(() => {});
  }, [refreshUser]);

  const customerTrips = (tripsQuery.data?.data || []).filter(
    (trip) => !user?.id || trip.customerId === user.id
  );
  const selectedTrip = customerTrips.find((trip) => trip.id === form.referenceId) || null;
  const availableRoles = selectedTrip
    ? [
        selectedTrip.driverId ? { value: "driver", name: selectedTrip.driver } : null,
        selectedTrip.dispatcherId ? { value: "dispatcher", name: selectedTrip.dispatcher } : null
      ].filter(Boolean)
    : [];

  const email =
    supportContact?.supportEmail ||
    import.meta.env.VITE_SUPPORT_EMAIL ||
    "support@truckdispatch.so";
  const phone =
    supportContact?.supportPhone ||
    import.meta.env.VITE_SUPPORT_PHONE ||
    "+252 61 XXX XXXX";
  const phoneHref = `tel:${String(phone).replace(/\s+/g, "")}`;
  const whatsappHref = `https://wa.me/${String(phone).replace(/\D/g, "")}`;

  const createComplaint = useMutation({
    mutationFn: (payload) => api.createSupportComplaint(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["support-complaints"] });
      setForm({ againstRole: "driver", referenceId: "", subject: "", message: "" });
      setError("");
      setInfo("Complaint submitted. Support will review it shortly.");
    },
    onError: (err) => {
      setInfo("");
      setError(err.message);
    }
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }) => api.updateSupportComplaintStatus(id, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["support-complaints"] })
  });

  const channels = [
    {
      label: "Email support",
      value: email,
      detail: "Best for account, billing, and document issues",
      href: `mailto:${email}`,
      icon: Mail,
      action: "Send email"
    },
    {
      label: "Phone support",
      value: phone,
      detail: "Best for urgent trip or assignment problems",
      href: phoneHref,
      icon: Phone,
      action: "Call now"
    },
    {
      label: "WhatsApp",
      value: phone,
      detail: "Share screenshots, request IDs, and updates quickly",
      href: whatsappHref,
      icon: MessageCircle,
      action: "Open WhatsApp",
      external: true
    }
  ];

  function onSelectTrip(tripId) {
    const trip = customerTrips.find((item) => item.id === tripId) || null;
    const roles = trip
      ? [trip.driverId ? "driver" : null, trip.dispatcherId ? "dispatcher" : null].filter(Boolean)
      : [];
    setForm((current) => ({
      ...current,
      referenceId: tripId,
      againstRole: roles.includes(current.againstRole)
        ? current.againstRole
        : roles[0] || "platform"
    }));
  }

  async function onSubmitComplaint(event) {
    event.preventDefault();
    setError("");
    setInfo("");

    const latest = await refreshUser?.().catch(() => user);
    const role = latest?.role || user?.role;
    if (role !== "customer") {
      setError("Only customer accounts can file complaints. Log out and sign in as a customer.");
      return;
    }

    if (form.againstRole !== "platform" && !form.referenceId) {
      setError("Please choose the trip you want to complain about.");
      return;
    }
    if (!form.againstRole) {
      setError("Choose who the complaint is about.");
      return;
    }
    if (form.againstRole !== "platform" && availableRoles.length === 0) {
      setError("No driver is assigned on this trip yet. Choose Platform support instead.");
      return;
    }

    createComplaint.mutate({
      againstRole: form.againstRole,
      referenceId: form.referenceId || undefined,
      subject: form.subject || undefined,
      message: form.message
    });
  }

  function tripLabel(trip) {
    const route = trip.route || `${trip.pickup || "—"} → ${trip.destination || "—"}`;
    return `${trip.id} · ${route} · ${trip.status}`;
  }

  return (
    <div className="space-y-8">
      {!embedded ? (
        <PageHeader
          title="Support Center"
          subtitle="Professional help for booking, dispatch, tracking, and account access."
        />
      ) : null}

      <section className="overflow-hidden rounded-2xl bg-primary-container text-on-primary shadow-[0px_8px_30px_rgba(13,28,50,0.18)]">
        <div className="relative px-6 py-8 sm:px-8 sm:py-10">
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              background:
                "radial-gradient(circle at top right, rgba(254,107,0,0.45), transparent 42%), linear-gradient(135deg, rgba(255,255,255,0.06), transparent 55%)"
            }}
          />
          <div className="relative grid gap-8 lg:grid-cols-[1.4fr_0.8fr] lg:items-end">
            <div className="max-w-2xl">
              <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-secondary-fixed">
                <Headphones size={14} />
                GaariHel Support
              </p>
              <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                We are here when operations need a clear answer.
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/75 sm:text-base">
                Reach the operations team by email, phone, or WhatsApp. Customers can also file a formal complaint against a driver from one of their trips.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-xl bg-white/8 px-4 py-3 ring-1 ring-white/10 backdrop-blur-sm">
                <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-secondary-fixed">
                  <Clock3 size={14} />
                  Response window
                </div>
                <p className="text-sm text-white/85">Typically within a few business hours</p>
              </div>
              <div className="rounded-xl bg-white/8 px-4 py-3 ring-1 ring-white/10 backdrop-blur-sm">
                <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-secondary-fixed">
                  <ShieldCheck size={14} />
                  Coverage
                </div>
                <p className="text-sm text-white/85">Booking, fleet, payments, tracking, access</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-4">
          <h3 className="text-xl font-semibold text-primary-container">Contact support</h3>
          <p className="mt-1 text-sm text-on-surface-variant">Use the email address, phone number, or WhatsApp below to contact support.</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {channels.map((channel) => {
            const Icon = channel.icon;
            return (
              <a
                key={channel.label}
                href={channel.href}
                target={channel.external ? "_blank" : undefined}
                rel={channel.external ? "noreferrer" : undefined}
                className="group flex h-full flex-col rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-[0px_4px_20px_rgba(0,0,0,0.04)] transition duration-200 hover:-translate-y-0.5 hover:border-secondary-container hover:shadow-[0px_10px_28px_rgba(13,28,50,0.08)]"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-secondary-container/10 text-secondary-container">
                  <Icon size={20} />
                </div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-on-surface-variant">{channel.label}</p>
                <p className="mt-2 break-all text-lg font-semibold text-primary-container">{channel.value}</p>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-on-surface-variant">{channel.detail}</p>
                <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-secondary-container">
                  {channel.action}
                  <ArrowUpRight size={16} className="transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </span>
              </a>
            );
          })}
        </div>
      </section>

      {isCustomer ? (
        <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 shadow-[0px_4px_20px_rgba(0,0,0,0.04)]">
          <h3 className="text-xl font-semibold text-primary-container">File a complaint</h3>
          <p className="mt-1 text-sm text-on-surface-variant">
            Pick one of your trips, or send a general complaint to platform support.
          </p>
          <form className="mt-5 grid gap-3 sm:grid-cols-2" onSubmit={onSubmitComplaint}>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1.5 block font-medium text-on-surface-variant">Choose trip (optional for platform support)</span>
              <select
                className="stitch-input"
                value={form.referenceId}
                onChange={(e) => onSelectTrip(e.target.value)}
                disabled={tripsQuery.isLoading}
              >
                <option value="">
                  {tripsQuery.isLoading
                    ? "Loading your trips…"
                    : customerTrips.length === 0
                      ? "No trips found — you can still contact platform support"
                      : "Select a trip…"}
                </option>
                {customerTrips.map((trip) => (
                  <option key={trip.id} value={trip.id}>
                    {tripLabel(trip)}
                  </option>
                ))}
              </select>
            </label>
            {selectedTrip ? (
              <div className="sm:col-span-2 rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">People on this trip</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <p>
                    <span className="text-on-surface-variant">Driver: </span>
                    <span className="font-medium">{selectedTrip.driver || "Not assigned"}</span>
                  </p>
                  <p>
                    <span className="text-on-surface-variant">Dispatcher: </span>
                    <span className="font-medium">{selectedTrip.dispatcher || "Not assigned"}</span>
                  </p>
                </div>
              </div>
            ) : null}
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1.5 block font-medium text-on-surface-variant">Complaint about *</span>
              <select
                className="stitch-input"
                value={form.againstRole}
                onChange={(e) => setForm((current) => ({ ...current, againstRole: e.target.value }))}
              >
                <option value="platform">Platform support</option>
                {availableRoles.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.value === "driver" ? "Driver" : "Dispatcher"}
                    {role.name ? ` — ${role.name}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1.5 block font-medium text-on-surface-variant">Subject (optional)</span>
              <input
                className="stitch-input"
                value={form.subject}
                onChange={(e) => setForm((current) => ({ ...current, subject: e.target.value }))}
                placeholder="Late pickup, rude behavior, damaged cargo…"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1.5 block font-medium text-on-surface-variant">Describe the issue *</span>
              <textarea
                className="stitch-input min-h-28"
                value={form.message}
                onChange={(e) => setForm((current) => ({ ...current, message: e.target.value }))}
                placeholder="Explain what happened, when it happened, and what you expected."
                required
                minLength={10}
                maxLength={2000}
              />
            </label>
            <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={createComplaint.isPending || form.message.trim().length < 10}>
                {createComplaint.isPending ? "Submitting…" : "Submit complaint"}
              </Button>
              {info ? <p className="text-sm text-emerald-700">{info}</p> : null}
              {error ? <p className="text-sm text-error">{error}</p> : null}
            </div>
          </form>
        </section>
      ) : isAdmin ? (
        <p className="rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
          Admins review customer complaints below. To file a complaint, sign in with a customer account.
        </p>
      ) : null}

      {(isCustomer || isAdmin) && (
        <section className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-[0px_4px_20px_rgba(0,0,0,0.04)]">
          <div className="border-b border-outline-variant px-6 py-5">
            <h3 className="text-xl font-semibold text-primary-container">
              {isAdmin ? "Customer complaints" : "My complaints"}
            </h3>
            <p className="mt-1 text-sm text-on-surface-variant">
              {isAdmin
                ? "Review complaints filed by customers against drivers."
                : "Track the status of complaints you have submitted."}
            </p>
          </div>
          <div className="divide-y divide-outline-variant">
            {complaintsQuery.isLoading ? (
              <p className="p-6 text-center text-sm text-on-surface-variant">Loading…</p>
            ) : null}
            {(complaintsQuery.data?.data || []).map((row) => (
              <article key={row.id} className="px-6 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-on-surface">{row.subject}</p>
                    <p className="mt-1 text-sm text-on-surface-variant">
                      {row.againstRole} {row.againstName ? `— ${row.againstName}` : ""} · {row.referenceId}
                      {isAdmin && row.customerName ? ` · ${row.customerName}` : ""}
                    </p>
                    <p className="mt-2 text-sm text-on-surface">{row.message}</p>
                  </div>
                  <StatusBadge status={row.status} />
                </div>
                {isAdmin ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {["Open", "In Review", "Resolved", "Closed"].map((status) => (
                      <Button
                        key={status}
                        variant="secondary"
                        className="px-2 py-1 text-xs"
                        disabled={updateStatus.isPending || row.status === status}
                        onClick={() => updateStatus.mutate({ id: row.id, status })}
                      >
                        {status}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
            {!complaintsQuery.isLoading && !(complaintsQuery.data?.data || []).length ? (
              <p className="p-6 text-center text-on-surface-variant">No complaints yet.</p>
            ) : null}
          </div>
        </section>
      )}
    </div>
  );
}
