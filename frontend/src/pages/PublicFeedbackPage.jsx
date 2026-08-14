import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Star, Truck } from "lucide-react";
import { useParams } from "react-router-dom";
import { api } from "../services/api";
import { Button } from "../components/ui/Button";

function Rating({ label, value, onChange }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-primary-container">{label}</legend>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button key={star} type="button" onClick={() => onChange(star)} className="rounded-lg p-1" aria-label={`${label}: ${star} stars`}>
            <Star size={30} className={star <= value ? "fill-amber-400 text-amber-400" : "text-outline-variant"} />
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function PublicFeedbackPage() {
  const { token } = useParams();
  const [booking, setBooking] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState({
    rating: 0, driverBehaviourRating: 0, deliverySpeedRating: 0,
    cargoConditionRating: 0, comment: "", cargoReceivedSafely: true, reportProblem: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getPublicFeedback(token).then(setBooking).catch((err) => setLoadError(err.message));
  }, [token]);

  async function submit(event) {
    event.preventDefault();
    setError("");
    if ([form.rating, form.driverBehaviourRating, form.deliverySpeedRating, form.cargoConditionRating].some((value) => value < 1)) {
      setError("Please complete all four ratings.");
      return;
    }
    setSubmitting(true);
    try {
      await api.submitPublicFeedback(token, form);
      setSubmitted(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) return <Message icon={AlertTriangle} title="Feedback link unavailable" text={loadError} tone="error" />;
  if (!booking) return <div className="grid min-h-screen place-items-center bg-background text-on-surface-variant">Loading secure feedback…</div>;
  if (submitted) return <Message icon={CheckCircle2} title="Thank you" text="Your delivery feedback has been submitted successfully." tone="success" />;

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-on-surface sm:py-12">
      <div className="mx-auto max-w-2xl">
        <header className="mb-6 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-secondary-container text-white"><Truck /></span>
          <h1 className="mt-3 text-2xl font-bold text-primary-container">Confirm delivery and rate service</h1>
          <p className="mt-1 text-sm text-on-surface-variant">Secure feedback for booking {booking.bookingNumber}</p>
        </header>
        <section className="mb-5 rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <Info label="From" value={booking.from} /><Info label="To" value={booking.to} />
            <Info label="Delivery date" value={new Date(booking.deliveryDate).toLocaleDateString()} />
            <Info label="Driver" value={booking.driverFirstName} />
          </div>
        </section>
        <form onSubmit={submit} className="space-y-6 rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm sm:p-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <Rating label="Overall rating" value={form.rating} onChange={(rating) => setForm({ ...form, rating })} />
            <Rating label="Driver behaviour" value={form.driverBehaviourRating} onChange={(driverBehaviourRating) => setForm({ ...form, driverBehaviourRating })} />
            <Rating label="Delivery speed" value={form.deliverySpeedRating} onChange={(deliverySpeedRating) => setForm({ ...form, deliverySpeedRating })} />
            <Rating label="Cargo condition" value={form.cargoConditionRating} onChange={(cargoConditionRating) => setForm({ ...form, cargoConditionRating })} />
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-primary-container">Cargo received safely?</legend>
            <div className="flex gap-3">{[true, false].map((value) => <label key={String(value)} className="flex cursor-pointer items-center gap-2 rounded-lg border border-outline-variant px-4 py-2"><input type="radio" checked={form.cargoReceivedSafely === value} onChange={() => setForm({ ...form, cargoReceivedSafely: value })} />{value ? "Yes" : "No"}</label>)}</div>
          </fieldset>
          <label className="flex items-center gap-3 rounded-lg border border-error/30 bg-error/5 p-4 text-sm font-medium"><input type="checkbox" checked={form.reportProblem} onChange={(event) => setForm({ ...form, reportProblem: event.target.checked })} />Report a problem with this delivery</label>
          <label className="block text-sm font-semibold text-primary-container">Comment<textarea className="stitch-input mt-2 min-h-28 w-full" maxLength={2000} value={form.comment} onChange={(event) => setForm({ ...form, comment: event.target.value })} placeholder="Tell us about the delivery…" /></label>
          {error && <p className="text-sm text-error">{error}</p>}
          <Button className="w-full justify-center" disabled={submitting}>{submitting ? "Submitting…" : "Submit Feedback"}</Button>
        </form>
      </div>
    </main>
  );
}

function Info({ label, value }) {
  return <div><p className="text-xs uppercase tracking-wide text-on-surface-variant">{label}</p><p className="mt-1 font-semibold text-primary-container">{value || "—"}</p></div>;
}

function Message({ icon: Icon, title, text, tone }) {
  return <main className="grid min-h-screen place-items-center bg-background px-4"><div className="max-w-md rounded-xl border border-outline-variant bg-surface-container-lowest p-8 text-center shadow-sm"><Icon className={`mx-auto ${tone === "error" ? "text-error" : "text-emerald-600"}`} size={42} /><h1 className="mt-4 text-2xl font-bold text-primary-container">{title}</h1><p className="mt-2 text-on-surface-variant">{text}</p></div></main>;
}
