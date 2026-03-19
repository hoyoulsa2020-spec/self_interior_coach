-- ============================================================
-- 고객 → 공급업체 문의 (consumer_provider_inquiries)
-- ============================================================

CREATE TABLE IF NOT EXISTS consumer_provider_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  project_title text,
  category text,
  title text NOT NULL,
  content text NOT NULL,
  file_urls text[] DEFAULT '{}',
  status text DEFAULT 'pending',
  answer text,
  answered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cpi_provider ON consumer_provider_inquiries(provider_id);
CREATE INDEX IF NOT EXISTS idx_cpi_consumer ON consumer_provider_inquiries(consumer_id);
CREATE INDEX IF NOT EXISTS idx_cpi_created ON consumer_provider_inquiries(created_at DESC);

ALTER TABLE consumer_provider_inquiries ENABLE ROW LEVEL SECURITY;

-- Consumer: 자신이 보낸 문의 조회/생성
DROP POLICY IF EXISTS "consumer_select_own_cpi" ON consumer_provider_inquiries;
CREATE POLICY "consumer_select_own_cpi" ON consumer_provider_inquiries FOR SELECT TO authenticated
USING (consumer_id = auth.uid());

DROP POLICY IF EXISTS "consumer_insert_own_cpi" ON consumer_provider_inquiries;
CREATE POLICY "consumer_insert_own_cpi" ON consumer_provider_inquiries FOR INSERT TO authenticated
WITH CHECK (consumer_id = auth.uid());

-- Provider: 자신에게 온 문의 조회/수정(답변, 읽음)
DROP POLICY IF EXISTS "provider_select_own_cpi" ON consumer_provider_inquiries;
CREATE POLICY "provider_select_own_cpi" ON consumer_provider_inquiries FOR SELECT TO authenticated
USING (provider_id = auth.uid());

DROP POLICY IF EXISTS "provider_update_own_cpi" ON consumer_provider_inquiries;
CREATE POLICY "provider_update_own_cpi" ON consumer_provider_inquiries FOR UPDATE TO authenticated
USING (provider_id = auth.uid())
WITH CHECK (provider_id = auth.uid());

-- Admin: 전체 조회
DROP POLICY IF EXISTS "admin_all_cpi" ON consumer_provider_inquiries;
CREATE POLICY "admin_all_cpi" ON consumer_provider_inquiries FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')))
WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')));
