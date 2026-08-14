-- Drop live GPS location history and last-known position columns from trips.
DROP TABLE IF EXISTS "trip_location_points";

ALTER TABLE "trips" DROP COLUMN IF EXISTS "last_lat";
ALTER TABLE "trips" DROP COLUMN IF EXISTS "last_lng";
ALTER TABLE "trips" DROP COLUMN IF EXISTS "last_location_at";
