-- 채팅 스레드에 initiated_by_role 추가: 누가 채팅창을 먼저 연지 추적
-- 대화가 없을 때 상대방에게 "채팅창 생겼다"를 보여주지 않기 위함
ALTER TABLE consumer_provider_chat_threads
  ADD COLUMN IF NOT EXISTS initiated_by_role text CHECK (initiated_by_role IN ('consumer', 'provider'));

COMMENT ON COLUMN consumer_provider_chat_threads.initiated_by_role IS '채팅창을 먼저 연 쪽. 메시지 0개일 때 이 쪽에만 목록에 표시';
