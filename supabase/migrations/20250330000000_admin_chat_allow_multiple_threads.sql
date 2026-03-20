-- 채팅 종료 후 같은 회원/업체와 새 대화 시작 가능하도록
-- 기존: UNIQUE(user_id, user_role) - 종료된 스레드가 있어도 새 스레드 생성 불가
-- 변경: 활성 스레드(ended_at IS NULL)만 1개 허용, 종료된 스레드는 여러 개 허용

ALTER TABLE admin_chat_threads DROP CONSTRAINT IF EXISTS admin_chat_threads_user_id_user_role_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_chat_threads_active_unique
  ON admin_chat_threads(user_id, user_role)
  WHERE ended_at IS NULL;
