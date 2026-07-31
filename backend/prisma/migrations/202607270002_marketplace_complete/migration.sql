-- Marketplace: service types, load types, bids, shared trips

ALTER TABLE users ADD COLUMN IF NOT EXISTS service_type TEXT;

ALTER TABLE trucks ADD COLUMN IF NOT EXISTS capacity_tons DECIMAL(12, 2);

ALTER TABLE cargo_requests ADD COLUMN IF NOT EXISTS load_type TEXT NOT NULL DEFAULT 'FTL';

CREATE TABLE IF NOT EXISTS bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cargo_request_id TEXT NOT NULL REFERENCES cargo_requests(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES users(id),
  truck_id UUID REFERENCES trucks(id),
  amount DECIMAL(12, 2) NOT NULL,
  estimated_days INT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'Pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_bid_request_driver UNIQUE (cargo_request_id, driver_id)
);

CREATE INDEX IF NOT EXISTS idx_bids_driver ON bids(driver_id, status);

-- Recreate shared trip tables to guarantee TEXT id (avoids UUID/text FK mismatch)
DROP TABLE IF EXISTS shared_trip_bookings CASCADE;
DROP TABLE IF EXISTS shared_trips CASCADE;

CREATE TABLE shared_trips (
  id TEXT PRIMARY KEY,
  driver_id UUID NOT NULL REFERENCES users(id),
  truck_id UUID REFERENCES trucks(id),
  pickup TEXT NOT NULL,
  destination TEXT NOT NULL,
  from_region TEXT,
  from_district TEXT,
  to_region TEXT,
  to_district TEXT,
  departure_date DATE,
  total_capacity_tons DECIMAL(12, 2) NOT NULL,
  available_tons DECIMAL(12, 2) NOT NULL,
  price_per_ton DECIMAL(12, 2),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'Open for booking',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_shared_trips_driver ON shared_trips(driver_id, status);
CREATE INDEX idx_shared_trips_status ON shared_trips(status, departure_date);

CREATE TABLE shared_trip_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shared_trip_id TEXT NOT NULL REFERENCES shared_trips(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES users(id),
  cargo_request_id TEXT UNIQUE REFERENCES cargo_requests(id) ON DELETE SET NULL,
  weight_tons DECIMAL(12, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_shared_trip_bookings_trip ON shared_trip_bookings(shared_trip_id);
CREATE INDEX idx_shared_trip_bookings_customer ON shared_trip_bookings(customer_id);

CREATE INDEX IF NOT EXISTS idx_cargo_requests_load_type ON cargo_requests(load_type, status);

-- Default existing drivers to FTL
UPDATE users SET service_type = 'FTL' WHERE role = 'driver' AND service_type IS NULL;
