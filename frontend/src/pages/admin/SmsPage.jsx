import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { useSmsNotifications } from "../../hooks/useApi";
import { api } from "../../services/api";

export function SmsPage({ embedded = false }) {
  const qc = useQueryClient();
  const smsHistory = useSmsNotifications({ limit: 100 });
  const [form, setForm] = useState({ recipientName: "", recipientPhone: "", message: "" });
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");

  const sendSms = useMutation({
    mutationFn: (payload) => api.sendSmsNotification(payload),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["sms-notifications"] });
      setForm({ recipientName: "", recipientPhone: "", message: "" });
      if (result?.status === "Sent") {
        setError("");
        setInfo("SMS accepted by provider.");
        return;
      }
      if (result?.status === "Failed" || result?.failureReason) {
        setInfo("");
        setError(result.failureReason || "SMS failed. Check Infobip trial number limits.");
        return;
      }
      setError("");
      setInfo(`SMS queued (${result?.status || "Pending"}).`);
    },
    onError: (err) => {
      setInfo("");
      setError(err.message);
    }
  });

  const resendSms = useMutation({
    mutationFn: (id) => api.resendSmsNotification(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sms-notifications"] })
  });

  function onSubmit(event) {
    event.preventDefault();
    setError("");
    setInfo("");
    sendSms.mutate({
      recipientName: form.recipientName.trim() || undefined,
      recipientPhone: form.recipientPhone.trim(),
      message: form.message.trim()
    });
  }

  return (
    <div className="space-y-8">
      {embedded ? null : (
        <PageHeader
          title="SMS"
          subtitle="Send SMS messages and review delivery history. Infobip trial accounts only deliver to verified test numbers."
        />
      )}

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
        Infobip free trial waxay u diri kartaa kaliya numbers verified ah (sida number-kaaga).
        Numbers kale waa la diidi (“Destination not in SMS demo whitelist”).
        Si aad u diri kartid customers: ku dar numbers-ka Infobip portal verified recipients, ama account-ka upgrade garee.
      </div>

      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-[0px_4px_20px_rgba(0,0,0,0.05)]">
        <h2 className="mb-4 text-xl font-semibold text-primary-container">Send SMS</h2>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={onSubmit}>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-on-surface-variant">Recipient name (optional)</span>
            <input
              className="stitch-input"
              value={form.recipientName}
              onChange={(e) => setForm((current) => ({ ...current, recipientName: e.target.value }))}
              placeholder="Customer name"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-on-surface-variant">Phone *</span>
            <input
              className="stitch-input"
              value={form.recipientPhone}
              onChange={(e) => setForm((current) => ({ ...current, recipientPhone: e.target.value }))}
              placeholder="61xxxxxxx"
              required
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1.5 block font-medium text-on-surface-variant">Message *</span>
            <textarea
              className="stitch-input min-h-28"
              value={form.message}
              onChange={(e) => setForm((current) => ({ ...current, message: e.target.value }))}
              maxLength={1000}
              required
            />
          </label>
          <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={sendSms.isPending}>
              {sendSms.isPending ? "Sending…" : "Send SMS"}
            </Button>
            {info ? <p className="text-sm text-emerald-700">{info}</p> : null}
            {error ? <p className="text-sm text-error">{error}</p> : null}
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-[0px_4px_20px_rgba(0,0,0,0.05)]">
        <div className="border-b border-outline-variant px-6 py-5">
          <h2 className="text-xl font-semibold text-primary-container">SMS History</h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            Manual and system SMS attempts. Failed messages can be resent.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-surface-container-low text-on-surface-variant">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Sent by</th>
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3">Recipient</th>
                <th className="px-4 py-3">Message</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Attempts</th>
                <th className="px-4 py-3">Failure</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {(smsHistory.data?.data || []).map((sms) => (
                <tr key={sms.id} className="border-t border-outline-variant/60 align-top">
                  <td className="px-4 py-3 whitespace-nowrap">{new Date(sms.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3 font-semibold text-primary-container">{sms.sentByName || "System"}</td>
                  <td className="px-4 py-3">{sms.event}</td>
                  <td className="px-4 py-3">
                    <p className="font-semibold">{sms.recipientName || "—"}</p>
                    <p className="text-xs text-on-surface-variant">{sms.recipientPhone}</p>
                  </td>
                  <td className="max-w-xs px-4 py-3 text-xs text-on-surface-variant">{sms.message}</td>
                  <td className="px-4 py-3 font-semibold">{sms.status}</td>
                  <td className="px-4 py-3">{sms.attempts}</td>
                  <td className="max-w-xs px-4 py-3 text-xs text-error">{sms.failureReason || "—"}</td>
                  <td className="px-4 py-3">
                    <Button
                      variant="outline"
                      disabled={resendSms.isPending || sms.status === "Sent"}
                      onClick={() => resendSms.mutate(sms.id)}
                    >
                      Resend
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!smsHistory.isLoading && !(smsHistory.data?.data || []).length ? (
            <p className="p-6 text-center text-on-surface-variant">No SMS attempts recorded yet.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
