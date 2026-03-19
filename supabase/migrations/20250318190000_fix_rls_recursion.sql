-- RLS 무한재귀 수정: projects ↔ project_estimates 순환 참조 제거
-- project_estimates 정책이 projects를 참조하면, projects 정책(provider_select_own_bid_projects)이
-- project_estimates를 참조하는 구조에서 무한재귀 발생 → SECURITY DEFINER 함수로 우회

CREATE OR REPLACE FUNCTION public.user_owns_project(pid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.projects WHERE id = pid AND user_id = auth.uid());
$$;

DROP POLICY IF EXISTS "consumer_select_own_project_estimates" ON project_estimates;
CREATE POLICY "consumer_select_own_project_estimates"
ON project_estimates FOR SELECT TO authenticated
USING (public.user_owns_project(project_id));
