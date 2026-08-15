-- Secure public trip tracking links (/track/:token)
CREATE TABLE IF NOT EXISTS tracking_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id text NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  label varchar(120),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_by_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_viewed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_tracking_links_trip
  ON tracking_links (trip_id, revoked_at);

CREATE INDEX IF NOT EXISTS idx_tracking_links_expires
  ON tracking_links (expires_at);
