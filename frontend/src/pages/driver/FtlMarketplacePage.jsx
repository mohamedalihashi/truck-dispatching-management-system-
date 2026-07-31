import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Gavel, MapPin, Package } from "lucide-react";
import { PageHeader } from "../../components/ui/PageHeader";
import { DataTable } from "../../components/ui/DataTable";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { api } from "../../services/api";
import { useDashboardSearch } from "../../hooks/useDashboardSearch";

export function FtlMarketplacePage() {
  const { search } = useDashboardSearch();
  const qc = useQueryClient();
  const [bidding, setBidding] = useState(null);
  const [amount, setAmount] = useState("");
  const [estimatedDays, setEstimatedDays] = useState("1");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["ftl-marketplace", search],
    queryFn: () => api.listFtlMarketplace({ search: search || undefined, limit: 50 })
  });

  const createBid = useMutation({
    mutationFn: ({ id, payload }) => api.createBid(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ftl-marketplace"] });
      qc.invalidateQueries({ queryKey: ["my-bids"] });
      setBidding(null);
    }
  });

  const rows = data?.data || [];

  function openBid(row) {
    setBidding(row);
    setAmount(row.quotedPrice != null ? String(row.quotedPrice) : row.finalPrice != null ? String(row.finalPrice) : "");
    setEstimatedDays("1");
    setNotes("");
    setError("");
  }

  async function submitBid(e) {
    e.preventDefault();
    if (!bidding) return;
    setError("");
    try {
      await createBid.mutateAsync({
        id: bidding.id,
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

  return (
    <div className="space-y-8">
      <PageHeader
        title="Available Loads"
        subtitle="Step 1 — browse open FTL requests where full-truck jobs are available, then send an offer."
      />

      {isLoading ? (
        <p className="py-10 text-center text-sm text-on-surface-variant">Loading available loads…</p>
      ) : (
        <DataTable
          rows={rows}
          empty="No open FTL requests right now. Check back soon."
          columns={[
            { key: "id", label: "Request" },
            {
              key: "route",
              label: "Route",
              render: (row) => (
                <span className="flex items-center gap-1 text-sm">
                  <MapPin size={14} /> {row.pickup} → {row.destination}
                </span>
              )
            },
            { key: "truckType", label: "Truck" },
            { key: "weight", label: "Weight" },
            {
              key: "status",
              label: "Status",
              render: (row) => <StatusBadge status={row.status} />
            },
            {
              key: "actions",
              label: "Actions",
              render: (row) => (
                <Button className="px-2 py-1 text-xs" onClick={() => openBid(row)}>
                  <Gavel size={14} /> Place bid
                </Button>
              )
            }
          ]}
        />
      )}

      {bidding && (
        <Modal title={`Bid on ${bidding.id}`} onClose={() => setBidding(null)}>
          <p className="mb-4 text-sm text-on-surface-variant">
            <Package size={14} className="inline" /> {bidding.pickup} → {bidding.destination} · {bidding.weight}
          </p>
          <form className="space-y-4" onSubmit={submitBid}>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-on-surface-variant">Your price (USD)</span>
              <input className="stitch-input" type="number" min="1" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-on-surface-variant">Estimated days</span>
              <input className="stitch-input" type="number" min="1" required value={estimatedDays} onChange={(e) => setEstimatedDays(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-on-surface-variant">Note (optional)</span>
              <textarea className="stitch-input min-h-[80px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            {error ? <p className="text-sm text-error">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setBidding(null)}>Cancel</Button>
              <Button type="submit" disabled={createBid.isPending}>{createBid.isPending ? "Submitting…" : "Submit bid"}</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
