-- ============================================================
-- consumer_provider_inquiries 컬럼 추가
-- Supabase SQL Editor에서 실행하세요.
-- ============================================================

ALTER TABLE consumer_provider_inquiries
  ADD COLUMN IF NOT EXISTS consumer_name text,
  ADD COLUMN IF NOT EXISTS consumer_phone text,
  ADD COLUMN IF NOT EXISTS consumer_email text,
  ADD COLUMN IF NOT EXISTS category_subs text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS category_schedule_date text,
  ADD COLUMN IF NOT EXISTS answer_file_urls text[] DEFAULT '{}';
