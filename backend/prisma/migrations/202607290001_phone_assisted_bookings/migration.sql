ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "last_seen_at" TIMESTAMPTZ;

ALTER TABLE "cargo_requests"
ADD COLUMN IF NOT EXISTS "booking_channel" TEXT NOT NULL DEFAULT 'ONLINE',
ADD COLUMN IF NOT EXISTS "assigned_by_admin_id" UUID,
ADD COLUMN IF NOT EXISTS "assigned_at" TIMESTAMPTZ;

ALTER TABLE "cargo_requests"
ADD CONSTRAINT "cargo_requests_assigned_by_admin_id_fkey"
FOREIGN KEY ("assigned_by_admin_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "idx_cargo_requests_booking_channel_status"
ON "cargo_requests"("booking_channel", "status");
