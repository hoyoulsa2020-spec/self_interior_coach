-- 실시간 채팅: 마지막 발신자 추적 (관리자 뱃지용)
ALTER TABLE admin_chat_threads ADD COLUMN IF NOT EXISTS last_sender_role text CHECK (last_sender_role IN ('admin', 'consumer', 'provider'));

-- 트리거: 메시지 삽입 시 last_sender_role 갱신
CREATE OR REPLACE FUNCTION admin_chat_threads_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE admin_chat_threads
  SET updated_at = now(), last_sender_role = NEW.sender_role
  WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS admin_chat_messages_updated ON admin_chat_messages;
CREATE TRIGGER admin_chat_messages_updated
  AFTER INSERT ON admin_chat_messages
  FOR EACH ROW EXECUTE FUNCTION admin_chat_threads_on_message();

-- 기존 스레드 backfill: 마지막 메시지의 sender_role로 설정
UPDATE admin_chat_threads t
SET last_sender_role = (
  SELECT m.sender_role FROM admin_chat_messages m
  WHERE m.thread_id = t.id
  ORDER BY m.created_at DESC
  LIMIT 1
)
WHERE last_sender_role IS NULL;

-- Realtime 구독 (admin_chat_threads)
ALTER PUBLICATION supabase_realtime ADD TABLE admin_chat_threads;
