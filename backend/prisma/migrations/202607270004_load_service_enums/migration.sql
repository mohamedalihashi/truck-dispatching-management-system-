-- Align Prisma with existing PostgreSQL enums (or convert TEXT columns if still present)

DO $$ BEGIN
  CREATE TYPE cargo_load_type AS ENUM ('FTL', 'SHARED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE driver_service_type AS ENUM ('FTL', 'SHARED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'cargo_requests'
      AND column_name = 'load_type'
      AND udt_name = 'text'
  ) THEN
    ALTER TABLE cargo_requests ALTER COLUMN load_type DROP DEFAULT;
    ALTER TABLE cargo_requests
      ALTER COLUMN load_type TYPE cargo_load_type
      USING load_type::cargo_load_type;
    ALTER TABLE cargo_requests
      ALTER COLUMN load_type SET DEFAULT 'FTL'::cargo_load_type;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'service_type'
      AND udt_name = 'text'
  ) THEN
    ALTER TABLE users
      ALTER COLUMN service_type TYPE driver_service_type
      USING CASE
        WHEN service_type IS NULL THEN NULL
        ELSE service_type::driver_service_type
      END;
  END IF;
END $$;
