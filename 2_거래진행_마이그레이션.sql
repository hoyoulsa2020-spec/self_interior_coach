-- ============================================================
-- 거래진행 기능 + 프로필 조회
-- Supabase SQL Editor에서 실행하세요.
-- ============================================================

-- 0) 프로필 조회 정책 (공급업체가 자신 프로필 읽어야 projects RLS 통과)
DROP POLICY IF EXISTS "users_read_own_profile" ON profiles;
CREATE POLICY "users_read_own_profile"
ON profiles FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "authenticated_read_provider_profiles" ON profiles;
CREATE POLICY "authenticated_read_provider_profiles"
ON profiles FOR SELECT TO authenticated
USING (role = 'provider');

-- 0-1) project_category_assignments 테이블 (없으면 생성)
CREATE TABLE IF NOT EXISTS project_category_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category text NOT NULL,
  provider_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(project_id, category)
);
CREATE INDEX IF NOT EXISTS idx_pca_project ON project_category_assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_pca_provider ON project_category_assignments(provider_id);
ALTER TABLE project_category_assignments ENABLE ROW LEVEL SECURITY;

-- Provider/Admin 정책
DROP POLICY IF EXISTS "provider_select_own_assignments" ON project_category_assignments;
DROP POLICY IF EXISTS "provider_select_assignments_for_bid_projects" ON project_category_assignments;
CREATE POLICY "provider_select_assignments_for_bid_projects"
ON project_category_assignments FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'provider')
  AND (
    provider_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM project_estimates pe
      WHERE pe.project_id = project_category_assignments.project_id AND pe.provider_id = auth.uid()
    )
  )
);
DROP POLICY IF EXISTS "admin_all_assignments" ON project_category_assignments;
CREATE POLICY "admin_all_assignments"
ON project_category_assignments FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')))
WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')));

-- Consumer 정책 (개인고객 업체선택)
DROP POLICY IF EXISTS "consumer_select_own_assignments" ON project_category_assignments;
CREATE POLICY "consumer_select_own_assignments" ON project_category_assignments FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = project_category_assignments.project_id AND projects.user_id = auth.uid()));
DROP POLICY IF EXISTS "consumer_insert_own_assignments" ON project_category_assignments;
CREATE POLICY "consumer_insert_own_assignments" ON project_category_assignments FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM projects WHERE projects.id = project_category_assignments.project_id AND projects.user_id = auth.uid()));
DROP POLICY IF EXISTS "consumer_update_own_assignments" ON project_category_assignments;
CREATE POLICY "consumer_update_own_assignments" ON project_category_assignments FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = project_category_assignments.project_id AND projects.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM projects WHERE projects.id = project_category_assignments.project_id AND projects.user_id = auth.uid()));
DROP POLICY IF EXISTS "consumer_delete_own_assignments" ON project_category_assignments;
CREATE POLICY "consumer_delete_own_assignments" ON project_category_assignments FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = project_category_assignments.project_id AND projects.user_id = auth.uid()));

-- 1) match_status, match_started_at 컬럼 추가
ALTER TABLE project_category_assignments
  ADD COLUMN IF NOT EXISTS match_status text DEFAULT 'in_progress',
  ADD COLUMN IF NOT EXISTS match_started_at timestamptz DEFAULT now();

-- 2) Provider: 자신이 할당된 건의 match_status 수정 가능 (거래취소/매칭완료)
DROP POLICY IF EXISTS "provider_update_own_assignments" ON project_category_assignments;
CREATE POLICY "provider_update_own_assignments"
ON project_category_assignments FOR UPDATE TO authenticated
USING (
  provider_id = auth.uid()
  AND EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'provider')
)
WITH CHECK (
  provider_id = auth.uid()
  AND EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'provider')
);
