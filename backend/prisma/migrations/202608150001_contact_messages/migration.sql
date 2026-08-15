-- Public contact form messages from the landing Contact page
CREATE TABLE IF NOT EXISTS contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(150) NOT NULL,
  email varchar(254),
  phone varchar(40) NOT NULL,
  message varchar(2000) NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'Open',
  admin_note varchar(1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_messages_status
  ON contact_messages (status, created_at);
