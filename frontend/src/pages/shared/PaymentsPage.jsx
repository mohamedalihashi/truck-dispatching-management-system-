import { useState } from "react";
import { useForm } from "react-hook-form";
import { CreditCard, DollarSign, Edit3, Plus, Smartphone, Trash2, Wallet } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/ui/PageHeader";
import { DataTable } from "../../components/ui/DataTable";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { MetricCard } from "../../components/ui/MetricCard";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { WaafiPayModal } from "../../components/WaafiPayModal";
import {
  useCustomers,
  usePaymentMutations,
  usePayments,
  useTrips
} from "../../hooks/useApi";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../services/api";
import { isPayablePayment, money, paymentBalance } from "../../utils/helpers";

export function PaymentsPage() {
  const { user } = useAuth();
  const isAdmin = user.role === "admin";
  const isCustomer = user.role === "customer";
  const { data, isLoading } = usePayments();
  const { update, updateCustomer, create, remove, payWithWaafi } = usePaymentMutations();
  const { data: waafiConfig } = useQuery({
    queryKey: ["waafi-config"],
    queryFn: () => api.getWaafiConfig(),
    enabled: isCustomer || isAdmin
  });
  const { data: customers } = useCustomers({ enabled: isAdmin });
  const { data: trips } = useTrips({ limit: 100, enabled: isAdmin });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [paying, setPaying] = useState(null);
  const [payError, setPayError] = useState("");
  const [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm({
    defaultValues: { amount: "", method: "waafipay", status: "Pending", tripId: "", customerId: "", description: "" }
  });
  const editForm = useForm({
    defaultValues: { amount: "", description: "", status: "Pending", method: "waafipay", amountPaid: "" }
  });

  const rows = data?.data || [];
  const payable = rows.filter(isPayablePayment);
  const totalCollected = rows.reduce((sum, row) => sum + Number(row.amountPaid || 0), 0);
  const totalOutstanding = rows.reduce((sum, row) => sum + paymentBalance(row), 0);
  const waafiEnabled = waafiConfig?.enabled !== false;
  const currency = waafiConfig?.currency || "SLSH";

  function openEdit(row) {
    setEditing(row);
    editForm.reset({
      amount: String(row.amount ?? ""),
      description: row.description || "",
      status: row.status,
      method: row.method || "waafipay",
      amountPaid: String(row.amountPaid ?? 0)
    });
    setError("");
  }

  async function onDelete(id) {
    if (!confirm("Delete this payment record?")) return;
    try {
      await remove.mutateAsync(id);
    } catch (err) {
      alert(err.message);
    }
  }

  async function onCreate(values) {
    setError("");
    try {
      await create.mutateAsync({
        customerId: values.customerId,
        tripId: values.tripId || undefined,
        amount: Number(values.amount),
        method: values.method,
        status: values.status,
        description: values.description || undefined
      });
      setCreating(false);
      reset();
    } catch (err) {
      setError(err.message);
    }
  }

  async function onSaveEdit(values) {
    setError("");
    try {
      if (editing.customerEdit) {
        await updateCustomer.mutateAsync({
          id: editing.id,
          amount: Number(values.amount),
          description: values.description
        });
      } else {
        await update.mutateAsync({
          id: editing.id,
          amount: values.amount !== "" ? Number(values.amount) : undefined,
          description: values.description,
          status: values.status,
          method: values.method,
          amountPaid: values.amountPaid !== "" ? Number(values.amountPaid) : undefined
        });
      }
      setEditing(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function onWaafiPay(payload) {
    setPayError("");
    try {
      const result = await payWithWaafi.mutateAsync(payload);
      setPaying(null);
      const remaining = paymentBalance(result);
      if (remaining > 0) {
        alert(`Payment received. Remaining balance: ${money(remaining)} ${currency}`);
      } else {
        alert("Payment completed. Thank you!");
      }
    } catch (err) {
      setPayError(err.message);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title={isAdmin ? "Finance" : "Payment History"}
        subtitle={
          isAdmin
            ? "Track marketplace payments, Waafi settlements, and invoice status in real time."
            : "Pay the 30% deposit before the trip can start, then the remaining 70% after you confirm delivery."
        }
        actions={
          isAdmin ? (
            <Button onClick={() => { setCreating(true); setError(""); }}>
              <Plus size={16} /> Add payment
            </Button>
          ) : null
        }
      />

      {isCustomer && payable.length > 0 ? (
        <div className="rounded-xl border border-secondary-container/30 bg-secondary-container/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-on-surface">Lacag bixin sugaysa</p>
              <p className="text-sm text-on-surface-variant">
                {payable.length} invoice(s) — deposit must be paid before the trip starts; balance after delivery.
              </p>
            </div>
            {waafiEnabled && payable[0] ? (
              <Button onClick={() => { setPaying(payable[0]); setPayError(""); }}>
                <Smartphone size={16} />
                Pay with Waafi
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard icon={Wallet} label="Total collected" value={`${money(totalCollected)} ${currency}`} tone="green" />
        <MetricCard icon={DollarSign} label="Outstanding" value={`${money(totalOutstanding)} ${currency}`} tone="navy" />
        <MetricCard icon={CreditCard} label="Transactions" value={rows.length} tone="orange" />
        <MetricCard icon={Smartphone} label="Awaiting payment" value={payable.length} tone="warn" />
      </div>

      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-[0px_4px_20px_rgba(0,0,0,0.05)]">
        <div className="border-b border-outline-variant px-6 py-5">
          <h2 className="text-xl font-semibold text-primary-container">
            {isAdmin ? "All Payments" : "Your Payments"}
          </h2>
        </div>
        {isLoading ? (
          <p className="py-10 text-center text-sm text-on-surface-variant">Loading payments…</p>
        ) : (
          <DataTable
            rows={rows}
            empty="No payment records yet."
            columns={[
              { key: "id", label: "Payment" },
              { key: "tripId", label: "Trip" },
              ...(isAdmin ? [{ key: "customer", label: "Customer" }] : []),
              {
                key: "amount",
                label: "Invoice",
                render: (row) => `${money(row.amount)} ${row.currency || currency}`
              },
              {
                key: "amountPaid",
                label: "Paid",
                render: (row) => `${money(row.amountPaid || 0)} ${row.currency || currency}`
              },
              {
                key: "balanceDue",
                label: "Balance",
                render: (row) => `${money(paymentBalance(row))} ${row.currency || currency}`
              },
              { key: "method", label: "Method" },
              {
                key: "status",
                label: "Status",
                render: (row) => <StatusBadge status={row.status} />
              },
              { key: "paymentStage", label: "Payment stage" },
              {
                key: "createdAt",
                label: "Date",
                render: (row) => (row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "—")
              },
              ...(isCustomer
                ? [
                    {
                      key: "actions",
                      label: "Actions",
                      render: (row) => (
                        <div className="flex flex-wrap gap-1">
                          {waafiEnabled && isPayablePayment(row) ? (
                            <Button
                              variant="secondary"
                              className="px-2 py-1 text-xs"
                              onClick={() => {
                                setPaying(row);
                                setPayError("");
                              }}
                            >
                              <Smartphone size={14} />
                              Waafi
                            </Button>
                          ) : (
                            "—"
                          )}
                        </div>
                      )
                    }
                  ]
                : []),
              ...(isAdmin
                ? [
                    {
                      key: "actions",
                      label: "Actions",
                      render: (row) => (
                        <div className="flex flex-wrap items-center gap-1">
                          <Button
                            variant="secondary"
                            className="px-2 py-1 text-xs"
                            onClick={() => openEdit(row)}
                          >
                            <Edit3 size={14} />
                            Edit
                          </Button>
                          <button
                            type="button"
                            className="p-1 text-error"
                            onClick={() => onDelete(row.id)}
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )
                    }
                  ]
                : [])
            ]}
          />
        )}
      </section>

      <WaafiPayModal
        payment={paying}
        open={Boolean(paying)}
        onClose={() => setPaying(null)}
        onPay={onWaafiPay}
        loading={payWithWaafi.isPending}
        error={payError}
        currency={currency}
      />

      {creating && (
        <Modal title="Create payment" onClose={() => setCreating(false)} wide>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleSubmit(onCreate)}>
            <select className="stitch-input sm:col-span-2" {...register("customerId", { required: true })}>
              <option value="">Select customer</option>
              {(customers?.data || []).map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
              ))}
            </select>
            <select className="stitch-input sm:col-span-2" {...register("tripId")}>
              <option value="">Trip (optional)</option>
              {(trips?.data || []).map((t) => (
                <option key={t.id} value={t.id}>{t.id} — {t.pickup} → {t.destination}</option>
              ))}
            </select>
            <input
              className="stitch-input"
              type="number"
              step="0.01"
              placeholder="Amount"
              {...register("amount", { required: true })}
            />
            <select className="stitch-input" {...register("method")}>
              <option value="waafipay">Waafi (EVC / ZAAD)</option>
              <option value="card">Card</option>
              <option value="bank">Bank transfer</option>
              <option value="cash">Cash</option>
            </select>
            <select className="stitch-input" {...register("status")}>
              <option value="Pending">Pending</option>
              <option value="Partial">Partial</option>
              <option value="Paid">Paid</option>
              <option value="Failed">Failed</option>
              <option value="Refunded">Refunded</option>
            </select>
            <input
              className="stitch-input sm:col-span-2"
              placeholder="Description (optional)"
              {...register("description")}
            />
            {error && <p className="sm:col-span-2 text-sm text-error">{error}</p>}
            <div className="sm:col-span-2 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
              <Button disabled={isSubmitting || create.isPending}>Create payment</Button>
            </div>
          </form>
        </Modal>
      )}

      {editing && (
        <Modal
          title={editing.customerEdit ? "Edit invoice" : "Edit payment"}
          onClose={() => setEditing(null)}
          wide
        >
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={editForm.handleSubmit(onSaveEdit)}>
            <input
              className="stitch-input"
              type="number"
              step="0.01"
              placeholder="Invoice amount"
              {...editForm.register("amount", { required: true })}
            />
            <input
              className="stitch-input sm:col-span-2"
              placeholder="Description"
              {...editForm.register("description")}
            />
            {!editing.customerEdit ? (
              <>
                <select className="stitch-input" {...editForm.register("status")}>
                  <option value="Pending">Pending</option>
                  <option value="Partial">Partial</option>
                  <option value="Paid">Paid</option>
                  <option value="Failed">Failed</option>
                  <option value="Refunded">Refunded</option>
                </select>
                <select className="stitch-input" {...editForm.register("method")}>
                  <option value="waafipay">Waafi (EVC / ZAAD)</option>
                  <option value="card">Card</option>
                  <option value="bank">Bank transfer</option>
                  <option value="cash">Cash</option>
                </select>
                <input
                  className="stitch-input sm:col-span-2"
                  type="number"
                  step="0.01"
                  placeholder="Amount paid (manual adjustment)"
                  {...editForm.register("amountPaid")}
                />
              </>
            ) : null}
            {error && <p className="sm:col-span-2 text-sm text-error">{error}</p>}
            <div className="sm:col-span-2 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
              <Button disabled={update.isPending || updateCustomer.isPending}>Save</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
