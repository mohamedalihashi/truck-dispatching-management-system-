-- Cargo image: customer uploads a photo of goods when booking
ALTER TABLE cargo_requests
  ADD COLUMN IF NOT EXISTS cargo_image_url TEXT,
  ADD COLUMN IF NOT EXISTS cargo_image_public_id TEXT;
