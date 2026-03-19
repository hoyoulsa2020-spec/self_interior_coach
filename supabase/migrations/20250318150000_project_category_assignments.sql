-- 대공정별 매칭(선택된 업체) 관리
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

-- Provider는 자신이 할당된 건만 조회
CREATE POLICY "provider_select_own_assignments"
ON project_category_assignments FOR SELECT TO authenticated
USING (
  provider_id = auth.uid()
  AND EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'provider')
);

-- Admin은 전체 조회/수정
CREATE POLICY "admin_all_assignments"
ON project_category_assignments FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
);
