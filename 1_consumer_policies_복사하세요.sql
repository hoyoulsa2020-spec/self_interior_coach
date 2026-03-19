-- ============================================================
-- ⚠️ 관리자/개인고객 프로젝트가 안 나오면 이 SQL을 Supabase SQL Editor에서 실행하세요.
-- ⚠️ 이 파일을 열고, 아래 SQL 전체를 Ctrl+A로 선택 후 Ctrl+C로 복사하세요.
-- ⚠️ Supabase Dashboard → SQL Editor → New query → 붙여넣기 → Run
-- ============================================================

-- 0) RLS 재귀 방지: projects 소유 여부 체크 (SECURITY DEFINER로 RLS 우회)
CREATE OR REPLACE FUNCTION public.user_owns_project(pid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.projects WHERE id = pid AND user_id = auth.uid());
$$;

-- 0-1) 공급업체 여부 체크 (profiles RLS 우회, 정책에서 사용)
CREATE OR REPLACE FUNCTION public.is_provider()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'provider');
$$;

-- 1) projects: 관리자 전체 접근 (필수 - 없으면 관리자 프로젝트 목록 안 나옴)
DROP POLICY IF EXISTS "admin_all_projects" ON projects;
CREATE POLICY "admin_all_projects"
ON projects FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
);

-- 2) projects: 개인고객 자신의 프로젝트 조회/생성/수정/삭제
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

-- 3) project_estimates: 개인고객이 자신의 프로젝트 입찰 내역 조회 (진행중 입찰 보기에 필요)
-- ※ projects 직접 참조 시 RLS 무한재귀 발생 → user_owns_project() 사용
DROP POLICY IF EXISTS "consumer_select_own_project_estimates" ON project_estimates;
CREATE POLICY "consumer_select_own_project_estimates"
ON project_estimates FOR SELECT TO authenticated
USING (public.user_owns_project(project_id));

-- 4) projects: 공급업체가 견적대기·진행중 프로젝트 조회 (전문분야 매칭은 앱에서)
DROP POLICY IF EXISTS "provider_select_estimate_waiting" ON projects;
CREATE POLICY "provider_select_estimate_waiting"
ON projects FOR SELECT TO authenticated
USING (
  status IN ('estimate_waiting', 'active')
  AND public.is_provider()
);

-- 5) projects: 공급업체가 자신이 입찰한 프로젝트(기타 상태) 조회
DROP POLICY IF EXISTS "provider_select_own_bid_projects" ON projects;
CREATE POLICY "provider_select_own_bid_projects"
ON projects FOR SELECT TO authenticated
USING (
  public.is_provider()
  AND EXISTS (
    SELECT 1 FROM project_estimates
    WHERE project_estimates.project_id = projects.id AND project_estimates.provider_id = auth.uid()
  )
);
