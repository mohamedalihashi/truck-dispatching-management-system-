-- Track which staff user sent an SMS (manual or system-tagged).
ALTER TABLE "sms_notifications" ADD COLUMN IF NOT EXISTS "sent_by_user_id" UUID;
ALTER TABLE "sms_notifications" ADD COLUMN IF NOT EXISTS "sent_by_name" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sms_notifications_sent_by_user_id_fkey'
  ) THEN
    ALTER TABLE "sms_notifications"
      ADD CONSTRAINT "sms_notifications_sent_by_user_id_fkey"
      FOREIGN KEY ("sent_by_user_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
