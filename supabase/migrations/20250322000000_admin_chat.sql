-- ============================================================
-- 관리자 채팅 (Admin ↔ Consumer, Admin ↔ Provider)
-- 소비자/공급업체는 관리자와만 채팅 가능
-- ============================================================

CREATE TABLE IF NOT EXISTS admin_chat_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_role text NOT NULL CHECK (user_role IN ('consumer', 'provider')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, user_role)
);

CREATE INDEX IF NOT EXISTS idx_admin_chat_threads_user ON admin_chat_threads(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_chat_threads_updated ON admin_chat_threads(updated_at DESC);

CREATE TABLE IF NOT EXISTS admin_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES admin_chat_threads(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_role text NOT NULL CHECK (sender_role IN ('admin', 'consumer', 'provider')),
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_chat_messages_thread ON admin_chat_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_admin_chat_messages_created ON admin_chat_messages(created_at ASC);

ALTER TABLE admin_chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_chat_messages ENABLE ROW LEVEL SECURITY;

-- Admin: 전체 스레드/메시지 조회·수정
DROP POLICY IF EXISTS "admin_all_chat_threads" ON admin_chat_threads;
CREATE POLICY "admin_all_chat_threads" ON admin_chat_threads FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')))
WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')));

DROP POLICY IF EXISTS "admin_all_chat_messages" ON admin_chat_messages;
CREATE POLICY "admin_all_chat_messages" ON admin_chat_messages FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')))
WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')));

-- Consumer: 자신의 스레드만 조회·생성
DROP POLICY IF EXISTS "consumer_own_chat_threads" ON admin_chat_threads;
CREATE POLICY "consumer_own_chat_threads" ON admin_chat_threads FOR ALL TO authenticated
USING (user_id = auth.uid() AND user_role = 'consumer')
WITH CHECK (user_id = auth.uid() AND user_role = 'consumer');

-- Provider: 자신의 스레드만 조회·생성
DROP POLICY IF EXISTS "provider_own_chat_threads" ON admin_chat_threads;
CREATE POLICY "provider_own_chat_threads" ON admin_chat_threads FOR ALL TO authenticated
USING (user_id = auth.uid() AND user_role = 'provider')
WITH CHECK (user_id = auth.uid() AND user_role = 'provider');

-- Consumer: 자신 스레드의 메시지만 조회·삽입
DROP POLICY IF EXISTS "consumer_own_chat_messages" ON admin_chat_messages;
CREATE POLICY "consumer_own_chat_messages" ON admin_chat_messages FOR ALL TO authenticated
USING (
  thread_id IN (SELECT id FROM admin_chat_threads WHERE user_id = auth.uid() AND user_role = 'consumer')
)
WITH CHECK (
  thread_id IN (SELECT id FROM admin_chat_threads WHERE user_id = auth.uid() AND user_role = 'consumer')
  AND sender_id = auth.uid()
  AND sender_role = 'consumer'
);

-- Provider: 자신 스레드의 메시지만 조회·삽입
DROP POLICY IF EXISTS "provider_own_chat_messages" ON admin_chat_messages;
CREATE POLICY "provider_own_chat_messages" ON admin_chat_messages FOR ALL TO authenticated
USING (
  thread_id IN (SELECT id FROM admin_chat_threads WHERE user_id = auth.uid() AND user_role = 'provider')
)
WITH CHECK (
  thread_id IN (SELECT id FROM admin_chat_threads WHERE user_id = auth.uid() AND user_role = 'provider')
  AND sender_id = auth.uid()
  AND sender_role = 'provider'
);

-- 스레드 updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION admin_chat_threads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE admin_chat_threads SET updated_at = now() WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS admin_chat_messages_updated ON admin_chat_messages;
CREATE TRIGGER admin_chat_messages_updated
  AFTER INSERT ON admin_chat_messages
  FOR EACH ROW EXECUTE FUNCTION admin_chat_threads_updated_at();

-- Realtime 구독용 publication 추가
ALTER PUBLICATION supabase_realtime ADD TABLE admin_chat_messages;
