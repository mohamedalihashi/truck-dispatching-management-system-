-- Consolidate trip/request statuses to:
-- Assigned → En Route to Pickup → Arrived at Pickup → Picked Up → In Transit → Near Destination → Delivered
-- (+ Pending / Cancelled system states). Remove Accepted, Loaded, Delayed, old Arrived Pickup.

-- ── trip_status ──────────────────────────────────────────────────────────────
ALTER TYPE "trip_status" ADD VALUE IF NOT EXISTS 'En Route to Pickup';
ALTER TYPE "trip_status" ADD VALUE IF NOT EXISTS 'Arrived at Pickup';
ALTER TYPE "trip_status" ADD VALUE IF NOT EXISTS 'Picked Up';
ALTER TYPE "trip_status" ADD VALUE IF NOT EXISTS 'Near Destination';

-- ── request_status ───────────────────────────────────────────────────────────
ALTER TYPE "request_status" ADD VALUE IF NOT EXISTS 'En Route to Pickup';
ALTER TYPE "request_status" ADD VALUE IF NOT EXISTS 'Arrived at Pickup';
ALTER TYPE "request_status" ADD VALUE IF NOT EXISTS 'Picked Up';
ALTER TYPE "request_status" ADD VALUE IF NOT EXISTS 'Near Destination';
