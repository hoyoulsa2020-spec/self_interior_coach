-- Provider: 자신이 할당된 건의 match_status 수정 가능 (거래취소/매칭완료)
CREATE POLICY "provider_update_own_assignments"
ON project_category_assignments FOR UPDATE TO authenticated
USING (
  provider_id = auth.uid()
  AND EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'provider')
)
WITH CHECK (
  provider_id = auth.uid()
  AND EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'provider')
);
