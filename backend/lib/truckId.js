/** System-generated fleet truck identifier (stored in truck.truckNumber). */
export function generateTruckId() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.floor(100 + Math.random() * 900);
  return `TRK-${stamp}${rand}`;
}
