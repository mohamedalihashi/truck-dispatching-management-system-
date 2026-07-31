ALTER TABLE "shared_trips"
ADD COLUMN IF NOT EXISTS "duration_amount" DECIMAL(12, 2),
ADD COLUMN IF NOT EXISTS "duration_unit" TEXT;
