import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { useSettings } from "../../hooks/useApi";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../services/api";

const ROLE_LABELS = {
  admin: "Admin",
  driver: "Driver",
  customer: "Customer"
};

const EDITABLE_ROLES = ["admin", "driver", "customer"];

export function SettingsPage() {
  const { user } = useAuth();
  const isSuperAdmin = Boolean(user?.isSuperAdmin);
  const { data: settings, isLoading, error } = useSettings();
  const [draft, setDraft] = useState(null);
  const [permDraft, setPermDraft] = useState(null);
  const [message, setMessage] = useState("");
  const [permMessage, setPermMessage] = useState("");
  const qc = useQueryClient();

  useEffect(() => {
    if (settings) {
      setDraft({
        ...settings,
        commission: settings.commission || { driver: 90, dispatcher: 0, platform: 10 }
      });
      setPermDraft(settings.rolePermissions || null);
    }
  }, [settings]);

  const catalog = settings?.permissionCatalog || [];

  const save = useMutation({
    mutationFn: async () => {
      const next = {
        general: draft.general || {},
        notifications: draft.notifications || {},
        commission: { ...(draft.commission || { driver: 90, platform: 10 }), dispatcher: 0 },
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
      setDraft((current) => ({ ...current, ...saved }));
      setMessage("Settings saved and applied.");
    },
    onError: (err) => setMessage(err.message)
  });

  const savePermissions = useMutation({
    mutationFn: () => api.updateRolePermissions(permDraft),
    onSuccess: (result) => {
      const value = result?.value || permDraft;
      setPermDraft(value);
      qc.setQueryData(["settings"], (current) =>
        current ? { ...current, rolePermissions: value } : current
      );
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["permissions"] });
      setPermMessage("Role permissions saved. Users get new access on next request.");
    },
    onError: (err) => setPermMessage(err.message)
  });

  const matrixRows = useMemo(() => {
    if (!permDraft || !catalog.length) return [];
    return catalog.map((item) => ({
      key: item.key,
      label: item.label,
      roles: EDITABLE_ROLES.map((role) => ({
        role,
        allowed: item.roles.includes(role),
        checked: Boolean(permDraft?.[role]?.[item.key])
      }))
    }));
  }, [catalog, permDraft]);

  function togglePermission(role, key, allowed) {
    if (!allowed) return;
    setPermDraft((current) => ({
      ...current,
      [role]: {
        ...(current?.[role] || {}),
        [key]: !current?.[role]?.[key]
      }
    }));
    setPermMessage("");
  }

  function resetPermissionsDefaults() {
    const rebuilt = {
      admin: Object.fromEntries(catalog.map((i) => [i.key, i.roles.includes("admin")])),
      driver: Object.fromEntries(
        catalog.map((i) => [
          i.key,
          i.roles.includes("driver") &&
            !["users", "payments", "reports", "auditLogs", "settings"].includes(i.key)
        ])
      ),
      customer: Object.fromEntries(
        catalog.map((i) => [
          i.key,
          i.roles.includes("customer") &&
            !["users", "trucks", "earnings", "reports", "auditLogs", "settings"].includes(i.key)
        ])
      )
    };
    setPermDraft(rebuilt);
    setPermMessage("Defaults restored in the form — click Save permissions to apply.");
  }

  if (isLoading || !draft) {
    return <p className="text-sm text-on-surface-variant">Loading settings…</p>;
  }

  if (error) {
    return <p className="text-sm text-error">{error.message}</p>;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="System Settings"
        subtitle="Company profile, commissions, notifications, and role permissions."
      />

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
            When a customer pays, the amount is split automatically between the driver and platform.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { key: "driver", label: "Driver" },
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

      {isSuperAdmin ? (
      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-[0px_4px_20px_rgba(0,0,0,0.05)]">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-primary-container">Role permissions</h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              Control which menu areas each role can access. Super Admin always has full access.
              When a permission is off, that role will not see it in the sidebar.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={resetPermissionsDefaults}>
              Reset defaults
            </Button>
            <Button onClick={() => savePermissions.mutate()} disabled={savePermissions.isPending || !permDraft}>
              {savePermissions.isPending ? "Saving…" : "Save permissions"}
            </Button>
          </div>
        </div>

        {permMessage ? <p className="mb-3 text-sm text-on-surface-variant">{permMessage}</p> : null}

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low">
                <th className="px-4 py-3 font-semibold text-on-surface-variant">Permission</th>
                {EDITABLE_ROLES.map((role) => (
                  <th key={role} className="px-4 py-3 text-center font-semibold text-on-surface-variant">
                    {ROLE_LABELS[role]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {matrixRows.map((row) => (
                <tr key={row.key}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-on-surface">{row.label}</p>
                    <p className="text-xs text-on-surface-variant">{row.key}</p>
                  </td>
                  {row.roles.map(({ role, allowed, checked }) => (
                    <td key={role} className="px-4 py-3 text-center">
                      {allowed ? (
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-secondary-container"
                          checked={checked}
                          onChange={() => togglePermission(role, row.key, allowed)}
                          aria-label={`${ROLE_LABELS[role]} ${row.label}`}
                        />
                      ) : (
                        <span className="text-xs text-on-surface-variant">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      ) : null}
    </div>
  );
}
