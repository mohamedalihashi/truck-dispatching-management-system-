import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Gavel, Pencil, X } from "lucide-react";
import { PageHeader } from "../../components/ui/PageHeader";
import { DataTable } from "../../components/ui/DataTable";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { api } from "../../services/api";
import { money } from "../../utils/helpers";

export function DriverMyBidsPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [amount, setAmount] = useState("");
  const [estimatedDays, setEstimatedDays] = useState("1");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["my-bids"],
    queryFn: () => api.listMyBids()
  });

  const updateBid = useMutation({
    mutationFn: ({ id, payload }) => api.updateBid(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-bids"] });
      qc.invalidateQueries({ queryKey: ["ftl-marketplace"] });
      setEditing(null);
    }
  });

  const withdrawBid = useMutation({
    mutationFn: (id) => api.withdrawBid(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-bids"] });
      qc.invalidateQueries({ queryKey: ["ftl-marketplace"] });
    }
  });

  const rows = data?.data || [];

  function openEdit(row) {
    setEditing(row);
    setAmount(String(row.amount));
    setEstimatedDays(row.estimatedDays != null ? String(row.estimatedDays) : "1");
    setNotes(row.notes || "");
    setError("");
  }

  async function submitEdit(e) {
    e.preventDefault();
    if (!editing) return;
    setError("");
    try {
      await updateBid.mutateAsync({
        id: editing.id,
        payload: {
          amount: Number(amount),
          estimatedDays: Number(estimatedDays),
          notes: notes.trim() || undefined
        }
      });
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleWithdraw(id) {
    if (!confirm("Withdraw this bid?")) return;
    try {
      await withdrawBid.mutateAsync(id);
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="My Offers"
        subtitle="Step 2 — track price offers you sent on Available Loads."
        actions={
          <Link to="/driver/marketplace">
            <Button variant="secondary">
              <Gavel size={16} /> Browse loads
            </Button>
          </Link>
        }
      />

      {isLoading ? (
        <p className="py-10 text-center text-sm text-on-surface-variant">Loading offers…</p>
      ) : (
        <DataTable
          rows={rows}
          empty="No offers yet. Browse available loads and submit your first offer."
          columns={[
            { key: "id", label: "Bid" },
            {
              key: "request",
              label: "Request",
              render: (row) => row.cargoRequestId
            },
            {
              key: "route",
              label: "Route",
              render: (row) =>
                row.cargoRequest
                  ? `${row.cargoRequest.pickup} → ${row.cargoRequest.destination}`
                  : "—"
            },
            {
              key: "amount",
              label: "Amount",
              render: (row) => money(row.amount)
            },
            {
              key: "status",
              label: "Status",
              render: (row) => <StatusBadge status={row.status} />
            },
            {
              key: "actions",
              label: "Actions",
              render: (row) =>
                row.status === "Pending" ? (
                  <div className="flex flex-wrap gap-1">
                    <button type="button" className="p-1 text-secondary-container" onClick={() => openEdit(row)} title="Edit">
                      <Pencil size={16} />
                    </button>
                    <button type="button" className="p-1 text-error" onClick={() => handleWithdraw(row.id)} title="Withdraw">
                      <X size={16} />
                    </button>
                  </div>
                ) : null
            }
          ]}
        />
      )}

      {editing && (
        <Modal title={`Edit bid ${editing.id}`} onClose={() => setEditing(null)}>
          <form className="space-y-4" onSubmit={submitEdit}>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-on-surface-variant">Amount ($)</span>
              <input className="stitch-input" type="number" min="1" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-on-surface-variant">Estimated days</span>
              <input className="stitch-input" type="number" min="1" required value={estimatedDays} onChange={(e) => setEstimatedDays(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-on-surface-variant">Notes</span>
              <textarea className="stitch-input min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            {error ? <p className="text-sm text-error">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="submit" disabled={updateBid.isPending}>{updateBid.isPending ? "Saving…" : "Save bid"}</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
