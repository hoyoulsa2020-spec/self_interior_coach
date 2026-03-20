-- 푸시 발송 이력 (관리자 조회용)
CREATE TABLE IF NOT EXISTS push_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  url text,
  source text NOT NULL,
  status text NOT NULL CHECK (status IN ('success', 'failed')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_logs_recipient ON push_logs(recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_push_logs_created ON push_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_push_logs_source ON push_logs(source);

ALTER TABLE push_logs ENABLE ROW LEVEL SECURITY;

-- 관리자만 조회
DROP POLICY IF EXISTS "admin_select_push_logs" ON push_logs;
CREATE POLICY "admin_select_push_logs" ON push_logs FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
);

-- INSERT는 API(service_role)에서만 수행, RLS 우회됨
