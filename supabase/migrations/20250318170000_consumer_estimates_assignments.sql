-- 개인고객(프로젝트 소유자)이 자신의 프로젝트 견적·업체선택 조회/수정 가능
-- Supabase SQL Editor에 이 파일 내용 전체를 복사해 실행하세요.

-- project_estimates: 소유 프로젝트의 견적 조회
DROP POLICY IF EXISTS "consumer_select_own_project_estimates" ON project_estimates;
CREATE POLICY "consumer_select_own_project_estimates"
ON project_estimates FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = project_estimates.project_id
      AND projects.user_id = auth.uid()
  )
);

-- project_category_assignments: 소유 프로젝트의 업체선택 조회
DROP POLICY IF EXISTS "consumer_select_own_assignments" ON project_category_assignments;
CREATE POLICY "consumer_select_own_assignments"
ON project_category_assignments FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = project_category_assignments.project_id
      AND projects.user_id = auth.uid()
  )
);

-- project_category_assignments: 소유 프로젝트의 업체선택 삽입
DROP POLICY IF EXISTS "consumer_insert_own_assignments" ON project_category_assignments;
CREATE POLICY "consumer_insert_own_assignments"
ON project_category_assignments FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = project_category_assignments.project_id
      AND projects.user_id = auth.uid()
  )
);

-- project_category_assignments: 소유 프로젝트의 업체선택 수정
DROP POLICY IF EXISTS "consumer_update_own_assignments" ON project_category_assignments;
CREATE POLICY "consumer_update_own_assignments"
ON project_category_assignments FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = project_category_assignments.project_id
      AND projects.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = project_category_assignments.project_id
      AND projects.user_id = auth.uid()
  )
);

-- project_category_assignments: 소유 프로젝트의 업체선택 삭제
DROP POLICY IF EXISTS "consumer_delete_own_assignments" ON project_category_assignments;
CREATE POLICY "consumer_delete_own_assignments"
ON project_category_assignments FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = project_category_assignments.project_id
      AND projects.user_id = auth.uid()
  )
);
