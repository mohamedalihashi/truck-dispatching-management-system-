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

function PricingRateField({ label, hint, enabled, onEnabledChange, value, onValueChange }) {
  return (
    <div className="rounded-lg border border-outline-variant bg-surface-container-low/40 p-3">
      <label className="mb-2 flex items-start justify-between gap-2">
        <div>
          <span className="block text-sm font-medium text-on-surface">{label}</span>
          {hint ? <span className="mt-0.5 block text-[11px] text-on-surface-variant">{hint}</span> : null}
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[11px] text-on-surface-variant">
          <input
            type="checkbox"
            className="h-4 w-4 accent-secondary-container"
            checked={enabled}
            onChange={(e) => onEnabledChange(e.target.checked)}
          />
          On
        </label>
      </label>
      <input
        className="stitch-input w-full disabled:cursor-not-allowed disabled:opacity-50"
        type="number"
        min="0"
        step="0.01"
        disabled={!enabled}
        value={value ?? ""}
        onChange={(e) => onValueChange(Number(e.target.value))}
      />
    </div>
  );
}

const CARGO_RATE_FIELDS = [
  { suffix: "Kg", label: "Per kg", hint: "General, food, construction" },
  { suffix: "Liter", label: "Per liter", hint: "Fuel, water" },
  { suffix: "Camel", label: "Per camel (Geel)", hint: "Livestock — camels" },
  { suffix: "Sheep", label: "Per sheep (Ari)", hint: "Livestock — sheep" },
  { suffix: "Goat", label: "Per goat (Lo')", hint: "Livestock — goats" },
];

function pricingPreviewTotal(pricing, prefix, { km, cargoQty, cargoRateKey }) {
  const kmRate = Number(pricing[`${prefix}PricePerKm`] || 0);
  const kmOn = pricing[`${prefix}KmEnabled`];
  const cargoRate = Number(pricing[`${prefix}PricePer${cargoRateKey}`] || 0);
  const cargoOn = pricing[`${prefix}${cargoRateKey}Enabled`];
  const distance = kmOn && kmRate > 0 ? km * kmRate : 0;
  const cargo = cargoOn && cargoRate > 0 ? cargoQty * cargoRate : 0;
  return distance + cargo;
}

function PricingLoadPanel({ title, prefix, pricing, onPatch }) {
  const field = (suffix) => ({
    enabled: Boolean(pricing[`${prefix}${suffix}Enabled`]),
    value: pricing[`${prefix}PricePer${suffix}`],
    onEnabled: (checked) => onPatch({ [`${prefix}${suffix}Enabled`]: checked }),
    onValue: (val) => onPatch({ [`${prefix}PricePer${suffix}`]: val }),
  });

  const km = field("Km");
  const examples = [
    { label: "General · 800 kg + 100 km", total: pricingPreviewTotal(pricing, prefix, { km: 100, cargoQty: 800, cargoRateKey: "Kg" }) },
    { label: "Water · 5,000 L + 10 km", total: pricingPreviewTotal(pricing, prefix, { km: 10, cargoQty: 5000, cargoRateKey: "Liter" }) },
    { label: "Geel · 10 camels + 100 km", total: pricingPreviewTotal(pricing, prefix, { km: 100, cargoQty: 10, cargoRateKey: "Camel" }) },
    { label: "Ari · 30 sheep + 100 km", total: pricingPreviewTotal(pricing, prefix, { km: 100, cargoQty: 30, cargoRateKey: "Sheep" }) },
    { label: "Lo' · 25 goats + 100 km", total: pricingPreviewTotal(pricing, prefix, { km: 100, cargoQty: 25, cargoRateKey: "Goat" }) },
  ];

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-outline-variant bg-surface-container-low/30 p-4">
      <h3 className="text-sm font-bold uppercase tracking-wide text-secondary-container">{title}</h3>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
          1. Distance charge
        </p>
        <PricingRateField
          label="Price per km (GPS)"
          hint="Applied to all cargo types"
          enabled={km.enabled}
          onEnabledChange={km.onEnabled}
          value={km.value}
          onValueChange={km.onValue}
        />
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
          2. Cargo charge (at pickup)
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {CARGO_RATE_FIELDS.map(({ suffix, label, hint }) => {
            const f = field(suffix);
            return (
              <PricingRateField
                key={suffix}
                label={label}
                hint={hint}
                enabled={f.enabled}
                onEnabledChange={f.onEnabled}
                value={f.value}
                onValueChange={f.onValue}
              />
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-outline-variant/60 bg-surface-container-lowest px-3 py-2">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
          Examples
        </p>
        <ul className="space-y-1 text-xs text-on-surface-variant">
          {examples.map((ex) => (
            <li key={ex.label} className="flex items-center justify-between gap-3">
              <span>{ex.label}</span>
              <strong className="text-on-surface">{ex.total > 0 ? ex.total.toLocaleString() : "—"}</strong>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

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
        commission: settings.commission || { driver: 90, dispatcher: 0, platform: 10 },
        pricing: {
          enabled: settings.pricing?.enabled !== false,
          ftlPricePerKg:
            settings.pricing?.ftlPricePerKg ??
            (settings.pricing?.ftlPricePerTon != null
              ? Number(settings.pricing.ftlPricePerTon) / 1000
              : 1),
          sharedPricePerKg:
            settings.pricing?.sharedPricePerKg ??
            (settings.pricing?.sharedPricePerTon != null
              ? Number(settings.pricing.sharedPricePerTon) / 1000
              : 1),
          ftlPricePerKm: settings.pricing?.ftlPricePerKm ?? 0,
          sharedPricePerKm: settings.pricing?.sharedPricePerKm ?? 0,
          ftlPricePerLiter: settings.pricing?.ftlPricePerLiter ?? 0.01,
          sharedPricePerLiter: settings.pricing?.sharedPricePerLiter ?? 0.01,
          ftlPricePerCamel: settings.pricing?.ftlPricePerCamel ?? settings.pricing?.ftlPricePerHead ?? 15,
          sharedPricePerCamel: settings.pricing?.sharedPricePerCamel ?? settings.pricing?.sharedPricePerHead ?? 15,
          ftlPricePerSheep: settings.pricing?.ftlPricePerSheep ?? settings.pricing?.ftlPricePerHead ?? 3,
          sharedPricePerSheep: settings.pricing?.sharedPricePerSheep ?? settings.pricing?.sharedPricePerHead ?? 3,
          ftlPricePerGoat:
            settings.pricing?.ftlPricePerGoat ??
            (settings.pricing?.ftlPricePerHead != null
              ? Number(settings.pricing.ftlPricePerHead) * 0.67
              : 2),
          sharedPricePerGoat:
            settings.pricing?.sharedPricePerGoat ??
            (settings.pricing?.sharedPricePerHead != null
              ? Number(settings.pricing.sharedPricePerHead) * 0.67
              : 2),
          ftlKgEnabled:
            settings.pricing?.ftlKgEnabled ??
            Number(settings.pricing?.ftlPricePerKg ?? settings.pricing?.ftlPricePerTon ?? 1) > 0,
          ftlKmEnabled:
            settings.pricing?.ftlKmEnabled ?? Number(settings.pricing?.ftlPricePerKm ?? 0) > 0,
          sharedKgEnabled:
            settings.pricing?.sharedKgEnabled ??
            Number(settings.pricing?.sharedPricePerKg ?? settings.pricing?.sharedPricePerTon ?? 1) > 0,
          sharedKmEnabled:
            settings.pricing?.sharedKmEnabled ?? Number(settings.pricing?.sharedPricePerKm ?? 0) > 0,
          ftlLiterEnabled:
            settings.pricing?.ftlLiterEnabled ?? Number(settings.pricing?.ftlPricePerLiter ?? 0.01) > 0,
          sharedLiterEnabled:
            settings.pricing?.sharedLiterEnabled ?? Number(settings.pricing?.sharedPricePerLiter ?? 0.01) > 0,
          ftlCamelEnabled:
            settings.pricing?.ftlCamelEnabled ??
            Number(settings.pricing?.ftlPricePerCamel ?? settings.pricing?.ftlPricePerHead ?? 15) > 0,
          sharedCamelEnabled:
            settings.pricing?.sharedCamelEnabled ??
            Number(settings.pricing?.sharedPricePerCamel ?? settings.pricing?.sharedPricePerHead ?? 15) > 0,
          ftlSheepEnabled:
            settings.pricing?.ftlSheepEnabled ??
            Number(settings.pricing?.ftlPricePerSheep ?? settings.pricing?.ftlPricePerHead ?? 3) > 0,
          sharedSheepEnabled:
            settings.pricing?.sharedSheepEnabled ??
            Number(settings.pricing?.sharedPricePerSheep ?? settings.pricing?.sharedPricePerHead ?? 3) > 0,
          ftlGoatEnabled:
            settings.pricing?.ftlGoatEnabled ?? Number(settings.pricing?.ftlPricePerGoat ?? 2) > 0,
          sharedGoatEnabled:
            settings.pricing?.sharedGoatEnabled ?? Number(settings.pricing?.sharedPricePerGoat ?? 2) > 0
        }
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
        pricing: {
          enabled: draft.pricing?.enabled !== false,
          ftlPricePerKg: Number(draft.pricing?.ftlPricePerKg ?? 1),
          sharedPricePerKg: Number(draft.pricing?.sharedPricePerKg ?? 1),
          ftlPricePerKm: Number(draft.pricing?.ftlPricePerKm ?? 0),
          sharedPricePerKm: Number(draft.pricing?.sharedPricePerKm ?? 0),
          ftlPricePerLiter: Number(draft.pricing?.ftlPricePerLiter ?? 0.01),
          sharedPricePerLiter: Number(draft.pricing?.sharedPricePerLiter ?? 0.01),
          ftlPricePerCamel: Number(draft.pricing?.ftlPricePerCamel ?? 15),
          sharedPricePerCamel: Number(draft.pricing?.sharedPricePerCamel ?? 15),
          ftlPricePerSheep: Number(draft.pricing?.ftlPricePerSheep ?? 3),
          sharedPricePerSheep: Number(draft.pricing?.sharedPricePerSheep ?? 3),
          ftlPricePerGoat: Number(draft.pricing?.ftlPricePerGoat ?? 2),
          sharedPricePerGoat: Number(draft.pricing?.sharedPricePerGoat ?? 2),
          ftlKgEnabled: Boolean(draft.pricing?.ftlKgEnabled),
          ftlKmEnabled: Boolean(draft.pricing?.ftlKmEnabled),
          sharedKgEnabled: Boolean(draft.pricing?.sharedKgEnabled),
          sharedKmEnabled: Boolean(draft.pricing?.sharedKmEnabled),
          ftlLiterEnabled: Boolean(draft.pricing?.ftlLiterEnabled),
          sharedLiterEnabled: Boolean(draft.pricing?.sharedLiterEnabled),
          ftlCamelEnabled: Boolean(draft.pricing?.ftlCamelEnabled),
          sharedCamelEnabled: Boolean(draft.pricing?.sharedCamelEnabled),
          ftlSheepEnabled: Boolean(draft.pricing?.ftlSheepEnabled),
          sharedSheepEnabled: Boolean(draft.pricing?.sharedSheepEnabled),
          ftlGoatEnabled: Boolean(draft.pricing?.ftlGoatEnabled),
          sharedGoatEnabled: Boolean(draft.pricing?.sharedGoatEnabled)
        }
      };
      await api.updateSettings("general", next.general);
      await api.updateSettings("notifications", next.notifications);
      await api.updateSettings("commission", next.commission);
      await api.updateSettings("pricing", next.pricing);
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
        subtitle="Company profile, pricing rates, commissions, notifications, and role permissions."
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
              <p className="mt-1 text-xs text-on-surface-variant">
                Same number is used for calls and WhatsApp.
              </p>
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
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-primary-container">Pricing rates</h2>
              <p className="mt-1 max-w-2xl text-sm text-on-surface-variant">
                Final fare = distance charge (km × rate) + cargo charge (kg / liter / head).
                Qiimaha waa la xaqiijiyaa marka safarka la gaarsiiyo (Delivered).
              </p>
            </div>
            <label className="flex items-center gap-2 rounded-lg border border-outline-variant px-3 py-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-secondary-container"
                checked={draft.pricing?.enabled !== false}
                onChange={(e) =>
                  setDraft((s) => ({
                    ...s,
                    pricing: { ...s.pricing, enabled: e.target.checked }
                  }))
                }
              />
              Auto-calculate fares
            </label>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <PricingLoadPanel
              title="FTL — full truck"
              prefix="ftl"
              pricing={draft.pricing || {}}
              onPatch={(patch) =>
                setDraft((s) => ({ ...s, pricing: { ...s.pricing, ...patch } }))
              }
            />
            <PricingLoadPanel
              title="SHARED — partial load"
              prefix="shared"
              pricing={draft.pricing || {}}
              onPatch={(patch) =>
                setDraft((s) => ({ ...s, pricing: { ...s.pricing, ...patch } }))
              }
            />
          </div>
        </section>

        <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-[0px_4px_20px_rgba(0,0,0,0.05)] lg:col-span-2">
          <h2 className="mb-4 text-xl font-semibold text-primary-container">Commission split (%)</h2>
          <p className="mb-4 text-sm text-on-surface-variant">
            When a customer pays, the amount is split between the driver and the platform (admin). Totals must equal 100%.
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
                      commission: { ...s.commission, dispatcher: 0, [key]: Number(e.target.value) }
                    }))
                  }
                />
              </label>
            ))}
          </div>
          {draft.commission ? (
            <p
              className={`mt-3 text-sm ${
                Number(draft.commission.driver || 0) + Number(draft.commission.platform || 0) === 100
                  ? "text-on-surface-variant"
                  : "text-error"
              }`}
            >
              Total: {Number(draft.commission.driver || 0) + Number(draft.commission.platform || 0)}%
              {Number(draft.commission.driver || 0) + Number(draft.commission.platform || 0) !== 100
                ? " — must equal 100%"
                : ""}
            </p>
          ) : null}
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
