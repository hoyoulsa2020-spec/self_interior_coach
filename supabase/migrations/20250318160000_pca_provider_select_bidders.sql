-- Provider: 입찰한 프로젝트의 대공정별 할당을 조회할 수 있도록 RLS 수정
-- (매칭실패 표시를 위해, 다른 업체가 선택된 경우에도 조회 가능해야 함)

DROP POLICY IF EXISTS "provider_select_own_assignments" ON project_category_assignments;

CREATE POLICY "provider_select_assignments_for_bid_projects"
ON project_category_assignments FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'provider')
  AND (
    provider_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM project_estimates pe
      WHERE pe.project_id = project_category_assignments.project_id
        AND pe.provider_id = auth.uid()
    )
  )
);
