-- 관리자가 읽은 시점 추적 (채팅 목록 row별 미읽음 뱃지용)
ALTER TABLE admin_chat_threads ADD COLUMN IF NOT EXISTS admin_read_at timestamptz;

-- 소비자/공급업체가 읽은 시점 추적 (말풍선 뱃지용)
ALTER TABLE admin_chat_threads ADD COLUMN IF NOT EXISTS user_read_at timestamptz;
