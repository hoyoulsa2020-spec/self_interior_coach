-- 채팅 종료/숨김: 소비자·공급업체 초기화 또는 관리자 종료 시 사용
ALTER TABLE admin_chat_threads ADD COLUMN IF NOT EXISTS ended_at timestamptz;
ALTER TABLE admin_chat_threads ADD COLUMN IF NOT EXISTS ended_by text CHECK (ended_by IN ('user', 'admin'));
-- 사용자 초기화 시점: 이 시점 이전 메시지는 소비자/공급업체에게 표시하지 않음
ALTER TABLE admin_chat_threads ADD COLUMN IF NOT EXISTS user_cleared_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_admin_chat_threads_ended ON admin_chat_threads(ended_at) WHERE ended_at IS NOT NULL;
