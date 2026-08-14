ALTER TABLE "shared_trip_bookings"
ADD COLUMN IF NOT EXISTS "pickup_order" INTEGER,
ADD COLUMN IF NOT EXISTS "delivery_order" INTEGER;
