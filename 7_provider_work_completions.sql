-- provider_work_completions 테이블 생성 (Supabase SQL Editor에서 실행)
-- 공급업체 프로젝트 관리 - 하위공정 완료 체크 저장용

CREATE TABLE IF NOT EXISTS provider_work_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category text NOT NULL,
  completed_subs text[] DEFAULT '{}',
  consumer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at timestamptz DEFAULT now(),
  UNIQUE(provider_id, project_id, category)
);

CREATE INDEX IF NOT EXISTS idx_pwc_provider ON provider_work_completions(provider_id);
CREATE INDEX IF NOT EXISTS idx_pwc_consumer ON provider_work_completions(consumer_id);
CREATE INDEX IF NOT EXISTS idx_pwc_completed_at ON provider_work_completions(completed_at);

ALTER TABLE provider_work_completions ENABLE ROW LEVEL SECURITY;

-- 기존 정책 제거 후 재생성 (이미 있으면 실행 시 에러 방지)
DROP POLICY IF EXISTS "provider_select_own_completions" ON provider_work_completions;
DROP POLICY IF EXISTS "provider_insert_own_completions" ON provider_work_completions;
DROP POLICY IF EXISTS "provider_update_own_completions" ON provider_work_completions;

CREATE POLICY "provider_select_own_completions"
ON provider_work_completions FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'provider')
  AND provider_id = auth.uid()
);

CREATE POLICY "provider_insert_own_completions"
ON provider_work_completions FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'provider')
  AND provider_id = auth.uid()
);

CREATE POLICY "provider_update_own_completions"
ON provider_work_completions FOR UPDATE TO authenticated
USING (provider_id = auth.uid())
WITH CHECK (provider_id = auth.uid());

COMMENT ON TABLE provider_work_completions IS '공급업체가 대공정별 하위공정 완료 체크. 완료 시 고객에게 카톡 발송 예정';
