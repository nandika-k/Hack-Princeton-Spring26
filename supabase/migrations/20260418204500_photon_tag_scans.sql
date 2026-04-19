-- Photon AI in-store tag scans (iMessage / SMS via Photon/Twilio)
-- This file mirrors the upstream Photon migration, but with a real `.sql`
-- filename so `supabase migration up` will apply it locally.

CREATE TABLE IF NOT EXISTS tag_scans (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  image_url            TEXT NOT NULL,
  phone_number         TEXT,
  extracted_brand      TEXT,
  extracted_materials  TEXT[] DEFAULT '{}',
  country_of_origin    TEXT,
  sustainability_score INTEGER CHECK (sustainability_score BETWEEN 0 AND 100),
  score_explanation    TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE tag_scans ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS tag_scans_phone_number_idx
  ON tag_scans (phone_number);

CREATE INDEX IF NOT EXISTS tag_scans_extracted_brand_idx
  ON tag_scans (extracted_brand);

CREATE INDEX IF NOT EXISTS tag_scans_created_at_idx
  ON tag_scans (created_at DESC);
