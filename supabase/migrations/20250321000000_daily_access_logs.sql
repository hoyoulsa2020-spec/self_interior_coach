-- ============================================================
-- 일별 접속 로그 (UPDATE 방식, row 누적 없음)
-- user_id + access_date 당 1 row, visit_count로 집계
-- ============================================================

CREATE TABLE IF NOT EXISTS daily_access_logs (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_date date NOT NULL,
  first_visit_at timestamptz NOT NULL DEFAULT now(),
  last_visit_at timestamptz NOT NULL DEFAULT now(),
  visit_count int NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, access_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_access_logs_date ON daily_access_logs(access_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_access_logs_user ON daily_access_logs(user_id);

ALTER TABLE daily_access_logs ENABLE ROW LEVEL SECURITY;

-- 본인 접속 기록: INSERT, UPDATE (로그인 시 기록)
DROP POLICY IF EXISTS "user_insert_own_access" ON daily_access_logs;
CREATE POLICY "user_insert_own_access" ON daily_access_logs FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "user_update_own_access" ON daily_access_logs;
CREATE POLICY "user_update_own_access" ON daily_access_logs FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- 관리자만 전체 조회
DROP POLICY IF EXISTS "admin_select_all_access" ON daily_access_logs;
CREATE POLICY "admin_select_all_access" ON daily_access_logs FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
);
