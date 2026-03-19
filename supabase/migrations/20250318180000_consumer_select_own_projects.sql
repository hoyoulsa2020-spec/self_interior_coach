-- projects 테이블: 관리자 전체 접근 + 개인고객 본인 프로젝트 접근
-- (이게 없으면 관리자/개인고객 모두 프로젝트 목록이 안 나옵니다)

-- 1) 관리자: 전체 프로젝트 조회/수정/삭제
DROP POLICY IF EXISTS "admin_all_projects" ON projects;
CREATE POLICY "admin_all_projects"
ON projects FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
);

-- 2) 개인고객: 자신의 프로젝트 조회/생성/수정/삭제
DROP POLICY IF EXISTS "consumer_select_own_projects" ON projects;
CREATE POLICY "consumer_select_own_projects"
ON projects FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "consumer_insert_own_projects" ON projects;
CREATE POLICY "consumer_insert_own_projects"
ON projects FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "consumer_update_own_projects" ON projects;
CREATE POLICY "consumer_update_own_projects"
ON projects FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "consumer_delete_own_projects" ON projects;
CREATE POLICY "consumer_delete_own_projects"
ON projects FOR DELETE TO authenticated
USING (user_id = auth.uid());
