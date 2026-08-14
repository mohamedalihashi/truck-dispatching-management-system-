-- Cargo pickup measurement: quantity + unit (KG, LITER, HEAD, TON)
ALTER TABLE cargo_requests
  ADD COLUMN IF NOT EXISTS measured_quantity DECIMAL(14, 3),
  ADD COLUMN IF NOT EXISTS measurement_unit VARCHAR(20);
