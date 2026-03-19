-- 시공업체가 프로젝트별 대공정 금액을 제안하는 테이블 (견적연구소 데이터)
CREATE TABLE IF NOT EXISTS project_estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amounts jsonb NOT NULL DEFAULT '{}',  -- {"목공사": 1000000, "도배": 500000}
  project_snapshot jsonb,  -- 프로젝트 정보: 평형, 주소, work_tree 등
  process_schedule jsonb,  -- 대공정 작업기간
  provider_business_name text,  -- 시공업체명
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(project_id, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_project_estimates_project ON project_estimates(project_id);
CREATE INDEX IF NOT EXISTS idx_project_estimates_provider ON project_estimates(provider_id);

ALTER TABLE project_estimates ENABLE ROW LEVEL SECURITY;

-- Provider는 자신의 견적만 조회/수정 가능
CREATE POLICY "provider_select_own_estimates"
ON project_estimates FOR SELECT TO authenticated
USING (
  provider_id = auth.uid()
  AND EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'provider')
);

CREATE POLICY "provider_insert_own_estimates"
ON project_estimates FOR INSERT TO authenticated
WITH CHECK (
  provider_id = auth.uid()
  AND EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'provider')
);

CREATE POLICY "provider_update_own_estimates"
ON project_estimates FOR UPDATE TO authenticated
USING (provider_id = auth.uid())
WITH CHECK (provider_id = auth.uid());
