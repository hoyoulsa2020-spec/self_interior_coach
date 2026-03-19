-- Provider(시공업체)가 견적대기(status=estimate_waiting) 프로젝트를 조회할 수 있도록 정책 추가
-- 기존 owner 정책(user_id = auth.uid())이 있다면 유지됨. provider는 estimate_waiting만 SELECT 가능.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'projects' AND policyname = 'provider_select_estimate_waiting'
  ) THEN
    CREATE POLICY "provider_select_estimate_waiting"
    ON projects FOR SELECT
    TO authenticated
    USING (
      status = 'estimate_waiting'
      AND EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.user_id = auth.uid()
        AND profiles.role = 'provider'
      )
    );
  END IF;
END $$;
