-- Customer complaints against driver or dispatcher linked to a trip/request ID.
CREATE TABLE IF NOT EXISTS "support_complaints" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_id" UUID NOT NULL,
    "against_role" TEXT NOT NULL,
    "against_user_id" UUID,
    "against_name" TEXT,
    "reference_type" TEXT NOT NULL,
    "reference_id" TEXT NOT NULL,
    "subject" TEXT,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "admin_note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "support_complaints_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'support_complaints_customer_id_fkey'
  ) THEN
    ALTER TABLE "support_complaints"
      ADD CONSTRAINT "support_complaints_customer_id_fkey"
      FOREIGN KEY ("customer_id") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'support_complaints_against_user_id_fkey'
  ) THEN
    ALTER TABLE "support_complaints"
      ADD CONSTRAINT "support_complaints_against_user_id_fkey"
      FOREIGN KEY ("against_user_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_support_complaints_customer" ON "support_complaints"("customer_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_support_complaints_status" ON "support_complaints"("status", "created_at");
