-- 개인고객이 본인 프로젝트의 완료 공정(provider_work_completions) 조회 가능하도록 정책 추가
-- Supabase SQL Editor에서 실행하세요.

DROP POLICY IF EXISTS "consumer_select_own_project_completions" ON provider_work_completions;

CREATE POLICY "consumer_select_own_project_completions"
ON provider_work_completions FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'consumer')
  AND EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = provider_work_completions.project_id
    AND projects.user_id = auth.uid()
  )
);
