const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const CHART_COLORS = ["#fe6b00", "#5979ff", "#27ae60", "#0d1c32", "#ba1a1a", "#f59e0b"];

export function buildStatusDistribution(trips = []) {
  const counts = {};
  for (const trip of trips) {
    const name = String(trip.status || "Unknown").replaceAll("_", " ");
    counts[name] = (counts[name] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export function buildMonthlyTripTrend(trips = [], { months = 6, fareKey = "fare" } = {}) {
  const now = new Date();
  const buckets = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      name: MONTH_LABELS[d.getMonth()],
      trips: 0,
      delivered: 0,
      amount: 0
    });
  }
  const index = Object.fromEntries(buckets.map((b, i) => [b.key, i]));

  for (const trip of trips) {
    if (!trip?.createdAt) continue;
    const d = new Date(trip.createdAt);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const slot = index[key];
    if (slot == null) continue;
    buckets[slot].trips += 1;
    if (trip.status === "Delivered") buckets[slot].delivered += 1;
    const amount = Number(trip[fareKey] ?? trip.amount ?? 0);
    if (Number.isFinite(amount)) buckets[slot].amount += amount;
  }

  return buckets;
}

export function buildNamedCounts(entries = []) {
  return entries
    .map(([name, value]) => ({ name, value: Number(value) || 0 }))
    .filter((row) => row.value > 0);
}
