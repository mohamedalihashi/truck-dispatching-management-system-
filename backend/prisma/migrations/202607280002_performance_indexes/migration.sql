-- Performance indexes for frequently filtered columns

CREATE INDEX IF NOT EXISTS "idx_users_role" ON "users"("role");
CREATE INDEX IF NOT EXISTS "idx_users_role_status" ON "users"("role", "status");
CREATE INDEX IF NOT EXISTS "idx_users_created_by" ON "users"("created_by_id");

CREATE INDEX IF NOT EXISTS "idx_cargo_requests_customer_created" ON "cargo_requests"("customer_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_cargo_requests_driver" ON "cargo_requests"("driver_id");
CREATE INDEX IF NOT EXISTS "idx_cargo_requests_dispatcher" ON "cargo_requests"("dispatcher_id");
CREATE INDEX IF NOT EXISTS "idx_cargo_requests_created_at" ON "cargo_requests"("created_at");

CREATE INDEX IF NOT EXISTS "idx_trips_customer" ON "trips"("customer_id");
CREATE INDEX IF NOT EXISTS "idx_trips_driver_status" ON "trips"("driver_id", "status");
CREATE INDEX IF NOT EXISTS "idx_trips_dispatcher" ON "trips"("dispatcher_id");
CREATE INDEX IF NOT EXISTS "idx_trips_cargo_request" ON "trips"("cargo_request_id");
CREATE INDEX IF NOT EXISTS "idx_trips_created_at" ON "trips"("created_at");

CREATE INDEX IF NOT EXISTS "idx_payments_status" ON "payments"("status");
CREATE INDEX IF NOT EXISTS "idx_payments_customer_created" ON "payments"("customer_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_payments_created_at" ON "payments"("created_at");

CREATE INDEX IF NOT EXISTS "idx_trucks_status" ON "trucks"("status");

CREATE INDEX IF NOT EXISTS "idx_bids_request_status" ON "bids"("cargo_request_id", "status");

CREATE INDEX IF NOT EXISTS "idx_notifications_created_at" ON "notifications"("created_at");
