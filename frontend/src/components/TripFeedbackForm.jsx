import { useState } from "react";
import { Star } from "lucide-react";
import { Button } from "./ui/Button";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../services/api";

function StarRating({ label, value, onChange, disabled = false }) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-on-surface">{label}</p>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            disabled={disabled}
            onClick={() => onChange(star)}
            className="rounded p-0.5 transition hover:scale-110 disabled:cursor-default"
            aria-label={`${star} star${star > 1 ? "s" : ""}`}
          >
            <Star
              size={28}
              className={
                star <= value
                  ? "fill-amber-400 text-amber-400"
                  : "text-outline-variant"
              }
            />
          </button>
        ))}
      </div>
    </div>
  );
}

export function TripFeedbackForm({ trip, onSubmitted, compact = false }) {
  const { user } = useAuth();
  const [rating, setRating] = useState(0);
  const [productRating, setProductRating] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isCustomerOwner = Boolean(user?.id) && trip.customerId === user.id;

  if (trip.feedback) {
    return (
      <div className={`rounded-xl border border-outline-variant/40 bg-surface-container-low ${compact ? "p-4" : "p-5"}`}>
        <p className="text-sm font-semibold text-on-surface">
          {user?.role === "customer" ? "Your feedback" : "Customer feedback"}
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <FeedbackSummary label="Delivery service" value={trip.feedback.rating} />
          {trip.feedback.productRating ? (
            <FeedbackSummary label="Goods condition" value={trip.feedback.productRating} />
          ) : null}
        </div>
        {trip.feedback.comment ? (
          <p className="mt-3 text-sm text-on-surface-variant">&ldquo;{trip.feedback.comment}&rdquo;</p>
        ) : null}
      </div>
    );
  }

  if (trip.status !== "Delivered") return null;

  if (!isCustomerOwner) {
    return (
      <div className={`rounded-xl border border-outline-variant/40 bg-surface-container-low ${compact ? "p-4" : "p-5"}`}>
        <p className="text-sm font-semibold text-on-surface">Waiting for customer rating</p>
        <p className="mt-1 text-sm text-on-surface-variant">
          Only the customer who booked this trip can rate the delivery (Trips page or the SMS feedback link).
        </p>
      </div>
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (rating < 1) {
      setError("Please rate the delivery service.");
      return;
    }
    if (productRating < 1) {
      setError("Please rate the condition of the goods when delivered.");
      return;
    }

    setSubmitting(true);
    try {
      const updated = await api.submitTripFeedback(trip.id, {
        rating,
        productRating,
        comment: comment.trim() || undefined
      });
      onSubmitted?.(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`rounded-xl border border-secondary-container/20 bg-secondary-fixed/10 ${compact ? "p-4" : "p-5"}`}
    >
      <p className="text-sm font-semibold text-on-surface">Rate this delivery</p>
      <p className="mt-1 text-sm text-on-surface-variant">
        Tell us how the goods arrived and how the delivery went.
      </p>

      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        <StarRating
          label="Delivery service"
          value={rating}
          onChange={setRating}
          disabled={submitting}
        />
        <StarRating
          label="Goods condition on arrival"
          value={productRating}
          onChange={setProductRating}
          disabled={submitting}
        />
      </div>

      <label className="mt-4 block text-sm font-medium text-on-surface">
        Comments about the goods (optional)
        <textarea
          className="stitch-input mt-2 min-h-24 w-full"
          placeholder="e.g. Items arrived on time, packaging was intact, temperature was good…"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          disabled={submitting}
          maxLength={2000}
        />
      </label>

      {error ? <p className="mt-3 text-sm text-error">{error}</p> : null}

      <div className="mt-4 flex justify-end">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Submitting…" : "Submit feedback"}
        </Button>
      </div>
    </form>
  );
}

function FeedbackSummary({ label, value }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-on-surface-variant">{label}</p>
      <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-on-surface">
        <Star size={16} className="fill-amber-400 text-amber-400" />
        {value}/5
      </p>
    </div>
  );
}
