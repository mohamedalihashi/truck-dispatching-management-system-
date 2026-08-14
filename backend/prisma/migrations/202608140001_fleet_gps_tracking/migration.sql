-- Live fleet GPS enrichment + geofencing / trip events
ALTER TABLE "trucks"
  ADD COLUMN IF NOT EXISTS "last_lat" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "last_lng" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "last_location_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "last_speed_kmh" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "last_heading" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "gps_status" VARCHAR(20) NOT NULL DEFAULT 'OFFLINE';

CREATE INDEX IF NOT EXISTS "idx_trucks_gps_status" ON "trucks" ("gps_status");
CREATE INDEX IF NOT EXISTS "idx_trucks_last_location" ON "trucks" ("last_location_at");

ALTER TABLE "trips"
  ADD COLUMN IF NOT EXISTS "last_speed_kmh" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "last_heading" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "last_accuracy_m" DOUBLE PRECISION;

ALTER TABLE "trip_location_points"
  ADD COLUMN IF NOT EXISTS "speed_kmh" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "heading" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "accuracy_m" DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS "trip_events" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "trip_id" TEXT,
  "truck_id" UUID,
  "type" VARCHAR(60) NOT NULL,
  "message" TEXT NOT NULL,
  "lat" DOUBLE PRECISION,
  "lng" DOUBLE PRECISION,
  "meta" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "trip_events_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "trip_events_truck_id_fkey" FOREIGN KEY ("truck_id") REFERENCES "trucks"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_trip_events_trip" ON "trip_events" ("trip_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_trip_events_truck" ON "trip_events" ("truck_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_trip_events_type" ON "trip_events" ("type", "created_at");

CREATE TABLE IF NOT EXISTS "geofences" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" VARCHAR(150) NOT NULL,
  "zone_type" VARCHAR(40) NOT NULL,
  "center_lat" DOUBLE PRECISION NOT NULL,
  "center_lng" DOUBLE PRECISION NOT NULL,
  "radius_m" DOUBLE PRECISION NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_geofences_active" ON "geofences" ("active");
