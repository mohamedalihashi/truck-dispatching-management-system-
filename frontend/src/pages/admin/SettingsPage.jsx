import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { useSettings } from "../../hooks/useApi";
import { api } from "../../services/api";

export function SettingsPage() {
  const { data: settings, isLoading, error } = useSettings();
  const [draft, setDraft] = useState(null);
  const [message, setMessage] = useState("");
  const qc = useQueryClient();

  useEffect(() => {
    if (settings) {
      setDraft({
        ...settings,
        commission: settings.commission || { driver: 80, dispatcher: 10, platform: 10 }
      });
    }
  }, [settings]);

  const save = useMutation({
    mutationFn: async () => {
      const next = {
        general: draft.general || {},
        notifications: draft.notifications || {},
        commission: draft.commission || {
          driver: 80,
          dispatcher: 10,
          platform: 10
        }
      };
      await api.updateSettings("general", next.general);
      await api.updateSettings("notifications", next.notifications);
      await api.updateSettings("commission", next.commission);
      return next;
    },
    onSuccess: (saved) => {
      qc.setQueryData(["settings"], (current) => ({ ...current, ...saved }));
      qc.invalidateQueries({ queryKey: ["settings"], refetchType: "active" });
      qc.invalidateQueries({ queryKey: ["earnings"] });
      setDraft(saved);
      setMessage("Settings saved and applied.");
    },
    onError: (err) => setMessage(err.message)
  });

  if (isLoading || !draft) {
    return <p className="text-sm text-on-surface-variant">Loading settings…</p>;
  }

  if (error) {
    return <p className="text-sm text-error">{error.message}</p>;
  }

  return (
    <div className="space-y-8">
      <PageHeader title="System Settings" subtitle="Company profile, commissions, and notification preferences." />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-[0px_4px_20px_rgba(0,0,0,0.05)]">
          <h2 className="mb-4 text-xl font-semibold text-primary-container">General</h2>
          <div className="space-y-3">
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-on-surface-variant">Company name</span>
              <input
                className="stitch-input"
                value={draft.general?.companyName || ""}
                onChange={(e) =>
                  setDraft((s) => ({ ...s, general: { ...s.general, companyName: e.target.value } }))
                }
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-on-surface-variant">Support email</span>
              <input
                className="stitch-input"
                value={draft.general?.supportEmail || ""}
                onChange={(e) =>
                  setDraft((s) => ({ ...s, general: { ...s.general, supportEmail: e.target.value } }))
                }
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-on-surface-variant">Support phone</span>
              <input
                className="stitch-input"
                value={draft.general?.supportPhone || ""}
                onChange={(e) =>
                  setDraft((s) => ({ ...s, general: { ...s.general, supportPhone: e.target.value } }))
                }
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-on-surface-variant">Currency</span>
              <input
                className="stitch-input"
                value={draft.general?.currency || ""}
                onChange={(e) =>
                  setDraft((s) => ({ ...s, general: { ...s.general, currency: e.target.value } }))
                }
              />
            </label>
          </div>
        </section>

        <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-[0px_4px_20px_rgba(0,0,0,0.05)]">
          <h2 className="mb-4 text-xl font-semibold text-primary-container">Notifications</h2>
          {["email", "sms", "push"].map((key) => (
            <label
              key={key}
              className="mb-3 flex items-center justify-between rounded-lg border border-outline-variant px-4 py-3"
            >
              <span className="capitalize text-sm font-medium">{key}</span>
              <input
                type="checkbox"
                className="h-4 w-4 accent-secondary-container"
                checked={Boolean(draft.notifications?.[key])}
                onChange={(e) =>
                  setDraft((s) => ({
                    ...s,
                    notifications: { ...s.notifications, [key]: e.target.checked }
                  }))
                }
              />
            </label>
          ))}
        </section>

        <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-[0px_4px_20px_rgba(0,0,0,0.05)] lg:col-span-2">
          <h2 className="mb-4 text-xl font-semibold text-primary-container">Commission split (%)</h2>
          <p className="mb-4 text-sm text-on-surface-variant">
            When a customer pays, the amount is split automatically between driver, dispatcher, and platform.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { key: "driver", label: "Driver" },
              { key: "dispatcher", label: "Dispatcher" },
              { key: "platform", label: "Platform (admin)" }
            ].map(({ key, label }) => (
              <label key={key} className="block text-sm">
                <span className="mb-1.5 block font-medium text-on-surface-variant">{label}</span>
                <input
                  className="stitch-input w-full"
                  type="number"
                  min="0"
                  max="100"
                  value={draft.commission?.[key] ?? ""}
                  onChange={(e) =>
                    setDraft((s) => ({
                      ...s,
                      commission: { ...s.commission, [key]: Number(e.target.value) }
                    }))
                  }
                />
              </label>
            ))}
          </div>
        </section>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save settings"}
        </Button>
        {message && <p className="text-sm text-on-surface-variant">{message}</p>}
      </div>
    </div>
  );
}
