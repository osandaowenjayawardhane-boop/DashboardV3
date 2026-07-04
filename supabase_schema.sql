-- ══════════════════════════════════════════════════════════════
-- $8K CHALLENGE — SUPABASE SCHEMA
-- ══════════════════════════════════════════════════════════════
--
-- SETUP INSTRUCTIONS:
-- 1. Go to your Supabase project → SQL Editor
-- 2. Paste this entire file and run it
-- 3. Go to Database → Replication, enable realtime for all 5 tables
-- 4. Copy your Project URL and anon key from Settings → API
-- 5. Paste them into the SUPABASE_URL and SUPABASE_ANON_KEY
--    constants at the top of index.html's <script> section
-- ══════════════════════════════════════════════════════════════


-- ─── 1. CHALLENGE ───────────────────────────────────────────
CREATE TABLE public.challenge (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name        TEXT NOT NULL DEFAULT 'The $8K Challenge',
  goal_amount NUMERIC NOT NULL DEFAULT 8000,
  total_days  INTEGER NOT NULL DEFAULT 28,
  start_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.challenge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own challenges"
  ON public.challenge FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own challenges"
  ON public.challenge FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own challenges"
  ON public.challenge FOR UPDATE
  USING (auth.uid() = user_id);


-- ─── 2. DAILY_ACTIVITY ─────────────────────────────────────
CREATE TABLE public.daily_activity (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  challenge_id    UUID REFERENCES public.challenge(id) ON DELETE CASCADE NOT NULL,
  activity_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  cold_calls      INTEGER NOT NULL DEFAULT 0,
  cold_dms        INTEGER NOT NULL DEFAULT 0,
  follow_ups      INTEGER NOT NULL DEFAULT 0,
  content_posted  INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(challenge_id, activity_date)
);

ALTER TABLE public.daily_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own activities"
  ON public.daily_activity FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own activities"
  ON public.daily_activity FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own activities"
  ON public.daily_activity FOR UPDATE
  USING (auth.uid() = user_id);


-- ─── 3. LEAD ────────────────────────────────────────────────
-- source: 'cold_call' or 'cold_dm'
-- pipeline_stage for cold_call: dialed → picked_up → booked → showed → closed
-- pipeline_stage for cold_dm:   sent   → replied   → booked → showed → closed
CREATE TABLE public.lead (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  challenge_id    UUID REFERENCES public.challenge(id) ON DELETE CASCADE NOT NULL,
  source          TEXT NOT NULL CHECK (source IN ('cold_call', 'cold_dm')),
  pipeline_stage  TEXT NOT NULL,
  name            TEXT,
  phone           TEXT,
  email           TEXT,
  company         TEXT,
  notes           TEXT,
  external_id     TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.lead ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own leads"
  ON public.lead FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own leads"
  ON public.lead FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own leads"
  ON public.lead FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own leads"
  ON public.lead FOR DELETE
  USING (auth.uid() = user_id);


-- ─── 4. REVENUE ─────────────────────────────────────────────
CREATE TABLE public.revenue (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  challenge_id  UUID REFERENCES public.challenge(id) ON DELETE CASCADE NOT NULL,
  amount        NUMERIC NOT NULL DEFAULT 0,
  revenue_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.revenue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own revenue"
  ON public.revenue FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own revenue"
  ON public.revenue FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own revenue"
  ON public.revenue FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own revenue"
  ON public.revenue FOR DELETE
  USING (auth.uid() = user_id);


-- ─── 5. DAILY_REVENUE ───────────────────────────────────────
CREATE TABLE public.daily_revenue (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  challenge_id  UUID REFERENCES public.challenge(id) ON DELETE CASCADE NOT NULL,
  revenue_date  DATE NOT NULL,
  total_amount  NUMERIC NOT NULL DEFAULT 0,
  units_sold    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(challenge_id, revenue_date)
);

ALTER TABLE public.daily_revenue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own daily_revenue"
  ON public.daily_revenue FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own daily_revenue"
  ON public.daily_revenue FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own daily_revenue"
  ON public.daily_revenue FOR UPDATE
  USING (auth.uid() = user_id);


-- ─── INDEXES ────────────────────────────────────────────────
CREATE INDEX idx_daily_activity_lookup
  ON public.daily_activity(user_id, challenge_id, activity_date);

CREATE INDEX idx_lead_pipeline
  ON public.lead(user_id, challenge_id, source, pipeline_stage);

CREATE INDEX idx_revenue_lookup
  ON public.revenue(user_id, challenge_id, revenue_date);

CREATE INDEX idx_daily_revenue_lookup
  ON public.daily_revenue(user_id, challenge_id, revenue_date);


-- ─── AUTO-SYNC TRIGGER: revenue → daily_revenue ────────────
-- Keeps daily_revenue in sync whenever revenue rows change.
CREATE OR REPLACE FUNCTION public.sync_daily_revenue()
RETURNS TRIGGER AS $$
DECLARE
  target_date     DATE;
  target_challenge UUID;
  target_user     UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_date      := OLD.revenue_date;
    target_challenge  := OLD.challenge_id;
    target_user       := OLD.user_id;
  ELSE
    target_date      := NEW.revenue_date;
    target_challenge  := NEW.challenge_id;
    target_user       := NEW.user_id;
  END IF;

  INSERT INTO public.daily_revenue (user_id, challenge_id, revenue_date, total_amount, units_sold)
  VALUES (
    target_user,
    target_challenge,
    target_date,
    COALESCE((SELECT SUM(amount) FROM public.revenue
              WHERE challenge_id = target_challenge AND revenue_date = target_date), 0),
    COALESCE((SELECT COUNT(*)     FROM public.revenue
              WHERE challenge_id = target_challenge AND revenue_date = target_date), 0)
  )
  ON CONFLICT (challenge_id, revenue_date)
  DO UPDATE SET
    total_amount = COALESCE((SELECT SUM(amount) FROM public.revenue
                             WHERE challenge_id = target_challenge AND revenue_date = target_date), 0),
    units_sold   = COALESCE((SELECT COUNT(*)     FROM public.revenue
                             WHERE challenge_id = target_challenge AND revenue_date = target_date), 0);

  -- Handle UPDATE that changes the date: also refresh the OLD date
  IF TG_OP = 'UPDATE' AND OLD.revenue_date <> NEW.revenue_date THEN
    INSERT INTO public.daily_revenue (user_id, challenge_id, revenue_date, total_amount, units_sold)
    VALUES (
      OLD.user_id,
      OLD.challenge_id,
      OLD.revenue_date,
      COALESCE((SELECT SUM(amount) FROM public.revenue
                WHERE challenge_id = OLD.challenge_id AND revenue_date = OLD.revenue_date), 0),
      COALESCE((SELECT COUNT(*)     FROM public.revenue
                WHERE challenge_id = OLD.challenge_id AND revenue_date = OLD.revenue_date), 0)
    )
    ON CONFLICT (challenge_id, revenue_date)
    DO UPDATE SET
      total_amount = COALESCE((SELECT SUM(amount) FROM public.revenue
                               WHERE challenge_id = OLD.challenge_id AND revenue_date = OLD.revenue_date), 0),
      units_sold   = COALESCE((SELECT COUNT(*)     FROM public.revenue
                               WHERE challenge_id = OLD.challenge_id AND revenue_date = OLD.revenue_date), 0);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_sync_daily_revenue
  AFTER INSERT OR UPDATE OR DELETE ON public.revenue
  FOR EACH ROW EXECUTE FUNCTION public.sync_daily_revenue();


-- ══════════════════════════════════════════════════════════════
-- MIGRATION — Run this on existing databases (safe to re-run)
-- ══════════════════════════════════════════════════════════════
ALTER TABLE public.lead ADD COLUMN IF NOT EXISTS email      TEXT;
ALTER TABLE public.lead ADD COLUMN IF NOT EXISTS company    TEXT;
ALTER TABLE public.lead ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE public.lead ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ DEFAULT now();

-- Auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lead_updated_at ON public.lead;
CREATE TRIGGER trg_lead_updated_at
  BEFORE UPDATE ON public.lead
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Add stripe_id to revenue table to prevent duplicate transaction counts from Stripe
ALTER TABLE public.revenue ADD COLUMN IF NOT EXISTS stripe_id TEXT UNIQUE;

-- Enable REPLICA IDENTITY FULL so Supabase Realtime sends complete row data in all event payloads
-- (required for payload.new.amount and payload.old.pipeline_stage to be available in the browser)
ALTER TABLE public.revenue REPLICA IDENTITY FULL;
ALTER TABLE public.lead REPLICA IDENTITY FULL;
ALTER TABLE public.challenge REPLICA IDENTITY FULL;
