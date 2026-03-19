-- 프로젝트에 선택된 업체(assigned_provider_id) 추가
ALTER TABLE projects ADD COLUMN IF NOT EXISTS assigned_provider_id uuid REFERENCES auth.users(id);

-- Provider가 자신이 입찰한 프로젝트(active 등) 조회 가능
CREATE POLICY "provider_select_own_bid_projects"
ON projects FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM project_estimates
    WHERE project_estimates.project_id = projects.id
    AND project_estimates.provider_id = auth.uid()
  )
  AND EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'provider')
);
