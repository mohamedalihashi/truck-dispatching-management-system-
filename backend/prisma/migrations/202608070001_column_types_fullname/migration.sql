-- Narrow short text columns to VARCHAR; keep long notes/descriptions as TEXT.
-- Full name supports multi-part names up to 150 chars.

ALTER TABLE "users"
  ALTER COLUMN "name" TYPE VARCHAR(150),
  ALTER COLUMN "username" TYPE VARCHAR(30),
  ALTER COLUMN "email" TYPE VARCHAR(254),
  ALTER COLUMN "phone" TYPE VARCHAR(20),
  ALTER COLUMN "national_id_number" TYPE VARCHAR(50),
  ALTER COLUMN "driver_license" TYPE VARCHAR(50),
  ALTER COLUMN "status" TYPE VARCHAR(40);

CREATE INDEX IF NOT EXISTS "idx_users_name" ON "users"("name");

ALTER TABLE "customer_profiles"
  ALTER COLUMN "customer_type" TYPE VARCHAR(40),
  ALTER COLUMN "city" TYPE VARCHAR(100),
  ALTER COLUMN "address" TYPE VARCHAR(255),
  ALTER COLUMN "company_name" TYPE VARCHAR(100),
  ALTER COLUMN "company_phone" TYPE VARCHAR(20),
  ALTER COLUMN "company_address" TYPE VARCHAR(255),
  ALTER COLUMN "business_registration_number" TYPE VARCHAR(100);

ALTER TABLE "dispatcher_profiles"
  ALTER COLUMN "dispatcher_code" TYPE VARCHAR(40),
  ALTER COLUMN "national_id_number" TYPE VARCHAR(50),
  ALTER COLUMN "gender" TYPE VARCHAR(20),
  ALTER COLUMN "city" TYPE VARCHAR(100),
  ALTER COLUMN "address" TYPE VARCHAR(255),
  ALTER COLUMN "assigned_region" TYPE VARCHAR(100),
  ALTER COLUMN "work_shift" TYPE VARCHAR(40),
  ALTER COLUMN "emergency_contact_name" TYPE VARCHAR(150),
  ALTER COLUMN "emergency_contact_phone" TYPE VARCHAR(20),
  ALTER COLUMN "verification_status" TYPE VARCHAR(40),
  ALTER COLUMN "account_status" TYPE VARCHAR(40);

ALTER TABLE "truck_types"
  ALTER COLUMN "name" TYPE VARCHAR(100);

ALTER TABLE "trucks"
  ALTER COLUMN "truck_number" TYPE VARCHAR(50),
  ALTER COLUMN "plate_number" TYPE VARCHAR(30),
  ALTER COLUMN "capacity" TYPE VARCHAR(30),
  ALTER COLUMN "truck_type" TYPE VARCHAR(100),
  ALTER COLUMN "region" TYPE VARCHAR(100),
  ALTER COLUMN "city" TYPE VARCHAR(100);

ALTER TABLE "cargo_requests"
  ALTER COLUMN "pickup" TYPE VARCHAR(255),
  ALTER COLUMN "destination" TYPE VARCHAR(255),
  ALTER COLUMN "truck_type" TYPE VARCHAR(100),
  ALTER COLUMN "cargo_type" TYPE VARCHAR(100),
  ALTER COLUMN "weight" TYPE VARCHAR(30),
  ALTER COLUMN "receiver" TYPE VARCHAR(150),
  ALTER COLUMN "sender" TYPE VARCHAR(150),
  ALTER COLUMN "customer_role" TYPE VARCHAR(20),
  ALTER COLUMN "sender_name" TYPE VARCHAR(150),
  ALTER COLUMN "sender_phone" TYPE VARCHAR(20),
  ALTER COLUMN "receiver_name" TYPE VARCHAR(150),
  ALTER COLUMN "receiver_phone" TYPE VARCHAR(20),
  ALTER COLUMN "from_region" TYPE VARCHAR(100),
  ALTER COLUMN "from_district" TYPE VARCHAR(100),
  ALTER COLUMN "from_neighborhood" TYPE VARCHAR(100),
  ALTER COLUMN "to_region" TYPE VARCHAR(100),
  ALTER COLUMN "to_district" TYPE VARCHAR(100),
  ALTER COLUMN "to_neighborhood" TYPE VARCHAR(100),
  ALTER COLUMN "adjustment_reason" TYPE VARCHAR(255),
  ALTER COLUMN "quoted_estimated_time" TYPE VARCHAR(50),
  ALTER COLUMN "booking_channel" TYPE VARCHAR(40);
