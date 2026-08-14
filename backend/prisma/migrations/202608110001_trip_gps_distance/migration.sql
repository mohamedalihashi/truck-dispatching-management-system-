-- GPS tracking for per-km fare: last position, trail, accumulated km.
ALTER TABLE "trips"
ADD COLUMN IF NOT EXISTS "last_lat" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "last_lng" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "last_location_at" TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS "distance_traveled_km" DECIMAL(12, 2);

CREATE TABLE IF NOT EXISTS "trip_location_points" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "trip_id" TEXT NOT NULL,
  "lat" DOUBLE PRECISION NOT NULL,
  "lng" DOUBLE PRECISION NOT NULL,
  "recorded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "trip_location_points_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "trip_location_points_trip_id_fkey"
    FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_trip_location_points_trip"
ON "trip_location_points"("trip_id", "recorded_at");
