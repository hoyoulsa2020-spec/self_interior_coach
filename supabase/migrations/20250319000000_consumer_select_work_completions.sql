-- 개인고객: 본인 프로젝트의 완료 공정 조회 허용 (시공업체 견적확인 > 완료된 공정)
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
