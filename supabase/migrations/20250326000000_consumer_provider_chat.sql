-- ============================================================
-- 소비자 ↔ 공급업체 채팅 (계약완료된 업체와만)
-- ============================================================

CREATE TABLE IF NOT EXISTS consumer_provider_chat_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  ended_by text CHECK (ended_by IN ('consumer', 'provider')),
  consumer_cleared_at timestamptz,
  provider_cleared_at timestamptz,
  consumer_read_at timestamptz,
  provider_read_at timestamptz,
  last_sender_role text CHECK (last_sender_role IN ('consumer', 'provider')),
  UNIQUE(consumer_id, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_cpct_consumer ON consumer_provider_chat_threads(consumer_id);
CREATE INDEX IF NOT EXISTS idx_cpct_provider ON consumer_provider_chat_threads(provider_id);
CREATE INDEX IF NOT EXISTS idx_cpct_updated ON consumer_provider_chat_threads(updated_at DESC);

CREATE TABLE IF NOT EXISTS consumer_provider_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES consumer_provider_chat_threads(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_role text NOT NULL CHECK (sender_role IN ('consumer', 'provider')),
  content text NOT NULL,
  image_urls text[],
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cpcm_thread ON consumer_provider_chat_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_cpcm_created ON consumer_provider_chat_messages(created_at ASC);

ALTER TABLE consumer_provider_chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE consumer_provider_chat_messages ENABLE ROW LEVEL SECURITY;

-- Consumer: 자신이 참여하는 스레드만 (consumer_id = self)
DROP POLICY IF EXISTS "consumer_cpct_own" ON consumer_provider_chat_threads;
CREATE POLICY "consumer_cpct_own" ON consumer_provider_chat_threads FOR ALL TO authenticated
USING (consumer_id = auth.uid());
WITH CHECK (consumer_id = auth.uid());

-- Provider: 자신이 참여하는 스레드만 (provider_id = self)
DROP POLICY IF EXISTS "provider_cpct_own" ON consumer_provider_chat_threads;
CREATE POLICY "provider_cpct_own" ON consumer_provider_chat_threads FOR ALL TO authenticated
USING (provider_id = auth.uid());
WITH CHECK (provider_id = auth.uid());

-- Consumer: 자신 스레드의 메시지만 조회·삽입
DROP POLICY IF EXISTS "consumer_cpcm_own" ON consumer_provider_chat_messages;
CREATE POLICY "consumer_cpcm_own" ON consumer_provider_chat_messages FOR ALL TO authenticated
USING (thread_id IN (SELECT id FROM consumer_provider_chat_threads WHERE consumer_id = auth.uid()));
WITH CHECK (
  thread_id IN (SELECT id FROM consumer_provider_chat_threads WHERE consumer_id = auth.uid())
  AND sender_id = auth.uid() AND sender_role = 'consumer'
);

-- Provider: 자신 스레드의 메시지만 조회·삽입
DROP POLICY IF EXISTS "provider_cpcm_own" ON consumer_provider_chat_messages;
CREATE POLICY "provider_cpcm_own" ON consumer_provider_chat_messages FOR ALL TO authenticated
USING (thread_id IN (SELECT id FROM consumer_provider_chat_threads WHERE provider_id = auth.uid()));
WITH CHECK (
  thread_id IN (SELECT id FROM consumer_provider_chat_threads WHERE provider_id = auth.uid())
  AND sender_id = auth.uid() AND sender_role = 'provider'
);

-- 스레드 updated_at, last_sender_role 갱신
CREATE OR REPLACE FUNCTION consumer_provider_chat_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE consumer_provider_chat_threads
  SET updated_at = now(), last_sender_role = NEW.sender_role
  WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cpcm_updated ON consumer_provider_chat_messages;
CREATE TRIGGER cpcm_updated
  AFTER INSERT ON consumer_provider_chat_messages
  FOR EACH ROW EXECUTE FUNCTION consumer_provider_chat_on_message();

ALTER PUBLICATION supabase_realtime ADD TABLE consumer_provider_chat_messages;
