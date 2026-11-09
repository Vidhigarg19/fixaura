-- Create table for repair observations (Before/After comparison)
CREATE TABLE IF NOT EXISTS repair_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES repair_sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  before_image_url TEXT NOT NULL,
  after_image_url TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('visible_change', 'no_clear_change', 'incomparable', 'insufficient_evidence', 'professional_review')),
  confidence NUMERIC,
  limitations TEXT[],
  warnings TEXT[],
  raw_analysis JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE repair_observations ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own repair observations"
  ON repair_observations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own repair observations"
  ON repair_observations FOR INSERT
  WITH CHECK (auth.uid() = user_id);