-- Track which staff user registered an account (dispatcher-scoped customers).
ALTER TABLE "users" ADD COLUMN "created_by_id" UUID;

ALTER TABLE "users"
  ADD CONSTRAINT "users_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "users_created_by_id_idx" ON "users"("created_by_id");

-- Backfill customers created by staff from audit logs.
UPDATE "users" u
SET "created_by_id" = a."actor_id"
FROM "audit_logs" a
WHERE a."entity" = 'users'
  AND a."action" = 'user.created'
  AND a."entity_id" = u."id"::text
  AND a."actor_id" IS NOT NULL
  AND a."actor_id" <> u."id"
  AND u."created_by_id" IS NULL
  AND u."role" = 'customer';
