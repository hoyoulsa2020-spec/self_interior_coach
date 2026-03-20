-- 공지사항 테이블
CREATE TABLE IF NOT EXISTS notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  sort_order int DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_notices_created ON notices(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notices_sort ON notices(sort_order ASC, created_at DESC);

ALTER TABLE notices ENABLE ROW LEVEL SECURITY;

-- 관리자만 모든 작업 가능
DROP POLICY IF EXISTS "admin_notices_all" ON notices;
CREATE POLICY "admin_notices_all" ON notices FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
);

-- 모든 인증 사용자 읽기 가능 (소비자/시공업체가 공지 확인)
DROP POLICY IF EXISTS "authenticated_read_notices" ON notices;
CREATE POLICY "authenticated_read_notices" ON notices FOR SELECT TO authenticated
USING (true);
