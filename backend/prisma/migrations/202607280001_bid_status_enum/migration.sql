-- Align Prisma Bid.status with existing PostgreSQL enum bid_status

DO $$ BEGIN
  CREATE TYPE bid_status AS ENUM ('Pending', 'Accepted', 'Rejected', 'Withdrawn');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bids'
      AND column_name = 'status'
      AND udt_name = 'text'
  ) THEN
    ALTER TABLE bids ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE bids
      ALTER COLUMN status TYPE bid_status
      USING status::bid_status;
    ALTER TABLE bids
      ALTER COLUMN status SET DEFAULT 'Pending'::bid_status;
  END IF;
END $$;
