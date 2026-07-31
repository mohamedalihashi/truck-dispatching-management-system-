import { useState } from "react";
import { Banknote, Send, Wallet } from "lucide-react";
import { PageHeader } from "../../components/ui/PageHeader";
import { DataTable } from "../../components/ui/DataTable";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { MetricCard } from "../../components/ui/MetricCard";
import { Button } from "../../components/ui/Button";
import { useAuth } from "../../contexts/AuthContext";
import { useEarningMutations, useEarnings, useEarningsSummary } from "../../hooks/useApi";
import { money } from "../../utils/helpers";

export function EarningsPage() {
  const { user } = useAuth();
  const isAdmin = user.role === "admin";
  const isDriver = user.role === "driver";
  const { data, isLoading } = useEarnings();
  const { data: summary } = useEarningsSummary();
  const { payout, payoutAll } = useEarningMutations();
  const [message, setMessage] = useState("");

  const rows = data?.data || [];
  const currency = "SLSH";

  async function onPayoutOne(id) {
    const ref = prompt("Payout reference (optional — EVC txn ID):", "");
    try {
      await payout.mutateAsync({
        id,
        payoutMethod: "evc_manual",
        payoutReference: ref || undefined
      });
      setMessage("Payout marked as sent.");
    } catch (err) {
      alert(err.message);
    }
  }

  async function onPayoutAll(recipientId, name) {
    if (!confirm(`Send all available earnings to ${name}?`)) return;
    const ref = prompt("Payout reference (optional):", "");
    try {
      const result = await payoutAll.mutateAsync({
        userId: recipientId,
        payoutMethod: "evc_manual",
        payoutReference: ref || undefined
      });
      setMessage(`Paid out ${result.count} earning(s).`);
    } catch (err) {
      alert(err.message);
    }
  }

  const title = isAdmin ? "Earnings & Payouts" : isDriver ? "Earnings" : "My Commission";
  const subtitle = isAdmin
    ? "Commission splits when customers pay. Pay drivers via EVC/ZAAD."
    : isDriver
      ? "Step 5 — your share from each customer payment until payout."
      : "Your share from each customer payment — paid out by admin to your mobile wallet.";

  return (
    <div className="space-y-8">
      <PageHeader title={title} subtitle={subtitle} />

      {message ? (
        <p className="rounded-xl border border-primary-fixed bg-primary-fixed/30 px-4 py-3 text-sm">
          {message}
        </p>
      ) : null}

      {isAdmin ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <MetricCard
            icon={Wallet}
            label="Platform share (available)"
            value={`${money(summary?.platformAvailable)} ${currency}`}
            tone="green"
          />
          <MetricCard
            icon={Banknote}
            label="Owed to drivers"
            value={`${money(summary?.driverOwed)} ${currency}`}
            tone="orange"
          />
          <MetricCard
            icon={Send}
            label="Commission split"
            value={`${summary?.commission?.driver ?? 90}% driver / ${summary?.commission?.platform ?? 10}% platform`}
            tone="warn"
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard
            icon={Wallet}
            label="Available (awaiting payout)"
            value={`${money(summary?.available)} ${currency}`}
            tone="green"
          />
          <MetricCard
            icon={Send}
            label="Already paid out"
            value={`${money(summary?.paidOut)} ${currency}`}
            tone="navy"
          />
          <MetricCard
            icon={Banknote}
            label="Total earned"
            value={`${money(summary?.totalEarned)} ${currency}`}
            tone="orange"
          />
        </div>
      )}

      {!isAdmin && summary?.commission ? (
        <p className="text-sm text-on-surface-variant">
          Commission: Driver {summary.commission.driver}% · Platform {summary.commission.platform}%
        </p>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-[0px_4px_20px_rgba(0,0,0,0.05)]">
        <div className="border-b border-outline-variant px-6 py-5">
          <h2 className="text-xl font-semibold text-primary-container">Earning history</h2>
        </div>
        {isLoading ? (
          <p className="py-10 text-center text-sm text-on-surface-variant">Loading…</p>
        ) : (
          <DataTable
            rows={rows}
            empty="No earnings yet. Earnings appear when customers pay for trips."
            columns={[
              ...(isAdmin
                ? [
                    { key: "recipient", label: "Recipient" },
                    { key: "recipientRole", label: "Role" }
                  ]
                : []),
              { key: "tripId", label: "Trip" },
              {
                key: "amount",
                label: "Amount",
                render: (row) => `${money(row.amount)} ${row.currency || currency}`
              },
              {
                key: "percent",
                label: "%",
                render: (row) => `${row.percent}%`
              },
              {
                key: "status",
                label: "Status",
                render: (row) => <StatusBadge status={row.status === "PaidOut" ? "Paid" : "Pending"} />
              },
              {
                key: "createdAt",
                label: "Date",
                render: (row) => (row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "—")
              },
              ...(isAdmin
                ? [
                    {
                      key: "actions",
                      label: "Payout",
                      render: (row) =>
                        row.recipientRole !== "platform" && row.status === "Available" ? (
                          <Button
                            variant="secondary"
                            className="px-2 py-1 text-xs"
                            disabled={payout.isPending}
                            onClick={() => onPayoutOne(row.id)}
                          >
                            Mark paid
                          </Button>
                        ) : (
                          "—"
                        )
                    }
                  ]
                : [])
            ]}
          />
        )}
      </section>

      {isAdmin && rows.some((r) => r.status === "Available" && r.recipientId) ? (
        <section className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
          <h3 className="font-semibold text-on-surface">Bulk payout by person</h3>
          <p className="mt-1 text-sm text-on-surface-variant">
            After sending EVC/ZAAD to their phone, mark all their available earnings as paid.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {[...new Map(
              rows
                .filter((r) => r.recipientId && r.status === "Available")
                .map((r) => [r.recipientId, r.recipient])
            )].map(([id, name]) => (
              <Button
                key={id}
                variant="secondary"
                className="text-xs"
                disabled={payoutAll.isPending}
                onClick={() => onPayoutAll(id, name)}
              >
                Pay all → {name}
              </Button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
