import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Clock3, Headphones, Mail, MessageCircle, Phone, ShieldCheck } from "lucide-react";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { useAuth } from "../../contexts/AuthContext";
import { useSettings, useSupportComplaints, useTrips } from "../../hooks/useApi";
import { api } from "../../services/api";

export function SupportPage({ embedded = false }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: settings } = useSettings({ enabled: user.role === "admin" });
  const canComplaint = user.role === "customer" || user.role === "admin";
  const complaintsQuery = useSupportComplaints({}, { enabled: canComplaint });
  const tripsQuery = useTrips({ limit: 100 }, { enabled: user.role === "customer" });

  const [form, setForm] = useState({
    againstRole: "driver",
    referenceId: "",
    subject: "",
    message: ""
  });
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");

  const shipments = tripsQuery.data?.data || [];
  const selectedTrip = shipments.find((trip) => trip.id === form.referenceId) || null;
  const availableRoles = selectedTrip
    ? [
        selectedTrip.driverId ? { value: "driver", name: selectedTrip.driver } : null,
        selectedTrip.dispatcherId ? { value: "dispatcher", name: selectedTrip.dispatcher } : null
      ].filter(Boolean)
    : [];

  const email =
    settings?.general?.supportEmail ||
    import.meta.env.VITE_SUPPORT_EMAIL ||
    "support@truckdispatch.so";
  const phone =
    settings?.general?.supportPhone ||
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

  function onSelectShipment(tripId) {
    const trip = shipments.find((item) => item.id === tripId) || null;
    const roles = trip
      ? [trip.driverId ? "driver" : null, trip.dispatcherId ? "dispatcher" : null].filter(Boolean)
      : [];
    setForm((current) => ({
      ...current,
      referenceId: tripId,
      againstRole: roles.includes(current.againstRole) ? current.againstRole : roles[0] || ""
    }));
  }

  function onSubmitComplaint(event) {
    event.preventDefault();
    setError("");
    setInfo("");
    if (!form.referenceId) {
      setError("Please choose the shipment you want to complain about.");
      return;
    }
    if (!form.againstRole) {
      setError("Choose whether the complaint is about the driver or dispatcher.");
      return;
    }
    createComplaint.mutate({
      againstRole: form.againstRole,
      referenceId: form.referenceId.trim(),
      subject: form.subject.trim() || undefined,
      message: form.message.trim()
    });
  }

  return (
    <div className="space-y-8">
      {embedded ? null : (
        <PageHeader
          title="Support Center"
          subtitle="Professional help for booking, dispatch, tracking, and account access."
        />
      )}

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
                TruckDispatch Support
              </p>
              <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                We are here when operations need a clear answer.
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/75 sm:text-base">
                Reach the operations team by email, phone, or WhatsApp. Customers can also file a formal complaint against a driver or dispatcher straight from one of their shipments.
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

      {user.role === "customer" ? (
        <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 shadow-[0px_4px_20px_rgba(0,0,0,0.04)]">
          <h3 className="text-xl font-semibold text-primary-container">File a complaint</h3>
          <p className="mt-1 text-sm text-on-surface-variant">
            Pick one of your shipments below. The driver and dispatcher who worked on it are filled in automatically.
          </p>
          <form className="mt-5 grid gap-3 sm:grid-cols-2" onSubmit={onSubmitComplaint}>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1.5 block font-medium text-on-surface-variant">Choose shipment *</span>
              <select
                className="stitch-input"
                value={form.referenceId}
                onChange={(e) => onSelectShipment(e.target.value)}
                required
                disabled={tripsQuery.isLoading}
              >
                <option value="">
                  {tripsQuery.isLoading
                    ? "Loading your shipments…"
                    : shipments.length === 0
                      ? "No shipments found"
                      : "Select a shipment…"}
                </option>
                {shipments.map((trip) => (
                  <option key={trip.id} value={trip.id}>
                    {trip.id} · {trip.route} · {trip.status}
                  </option>
                ))}
              </select>
            </label>
            {selectedTrip ? (
              <div className="sm:col-span-2 rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">People on this shipment</p>
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
                disabled={!selectedTrip || availableRoles.length === 0}
              >
                {!selectedTrip ? <option value="">Select a shipment first</option> : null}
                {availableRoles.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.value === "driver" ? "Driver" : "Dispatcher"}
                    {role.name ? ` — ${role.name}` : ""}
                  </option>
                ))}
                {selectedTrip && availableRoles.length === 0 ? (
                  <option value="">No driver or dispatcher assigned yet</option>
                ) : null}
              </select>
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1.5 block font-medium text-on-surface-variant">Subject (optional)</span>
              <input
                className="stitch-input"
                value={form.subject}
                onChange={(e) => setForm((current) => ({ ...current, subject: e.target.value }))}
                placeholder="Late pickup, rude behavior, wrong route…"
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
              <Button
                type="submit"
                disabled={createComplaint.isPending || !form.referenceId || availableRoles.length === 0}
              >
                {createComplaint.isPending ? "Submitting…" : "Submit complaint"}
              </Button>
              {info ? <p className="text-sm text-emerald-700">{info}</p> : null}
              {error ? <p className="text-sm text-error">{error}</p> : null}
            </div>
          </form>
        </section>
      ) : null}

      {canComplaint ? (
        <section className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-[0px_4px_20px_rgba(0,0,0,0.04)]">
          <div className="border-b border-outline-variant px-6 py-5">
            <h3 className="text-xl font-semibold text-primary-container">
              {user.role === "admin" ? "Customer complaints" : "My complaints"}
            </h3>
            <p className="mt-1 text-sm text-on-surface-variant">
              {user.role === "admin"
                ? "Review complaints filed by customers against drivers or dispatchers."
                : "Track the status of complaints you have submitted."}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-surface-container-low text-on-surface-variant">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  {user.role === "admin" ? <th className="px-4 py-3">Customer</th> : null}
                  <th className="px-4 py-3">Against</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3">Status</th>
                  {user.role === "admin" ? <th className="px-4 py-3">Action</th> : null}
                </tr>
              </thead>
              <tbody>
                {(complaintsQuery.data?.data || []).map((row) => (
                  <tr key={row.id} className="border-t border-outline-variant/60 align-top">
                    <td className="px-4 py-3 whitespace-nowrap">{new Date(row.createdAt).toLocaleString()}</td>
                    {user.role === "admin" ? (
                      <td className="px-4 py-3 font-semibold">{row.customerName || "—"}</td>
                    ) : null}
                    <td className="px-4 py-3">
                      <p className="font-semibold capitalize">{row.againstRole}</p>
                      <p className="text-xs text-on-surface-variant">{row.againstName || "—"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold">{row.referenceId}</p>
                      <p className="text-xs capitalize text-on-surface-variant">{row.referenceType?.replace("_", " ")}</p>
                    </td>
                    <td className="max-w-xs px-4 py-3">
                      <p className="font-medium">{row.subject || "—"}</p>
                      <p className="mt-1 text-xs text-on-surface-variant line-clamp-2">{row.message}</p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                    {user.role === "admin" ? (
                      <td className="px-4 py-3">
                        <select
                          className="stitch-input max-w-[9rem]"
                          value={row.status}
                          disabled={updateStatus.isPending}
                          onChange={(e) => updateStatus.mutate({ id: row.id, status: e.target.value })}
                        >
                          {["Open", "In Review", "Resolved", "Closed"].map((status) => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
            {!complaintsQuery.isLoading && !(complaintsQuery.data?.data || []).length ? (
              <p className="p-6 text-center text-on-surface-variant">No complaints yet.</p>
            ) : null}
          </div>
        </section>
      ) : null}

      <section>
        <div className="mb-4">
          <h3 className="text-xl font-semibold text-primary-container">Contact channels</h3>
          <p className="mt-1 text-sm text-on-surface-variant">Choose the channel that matches how urgent your issue is.</p>
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
    </div>
  );
}
