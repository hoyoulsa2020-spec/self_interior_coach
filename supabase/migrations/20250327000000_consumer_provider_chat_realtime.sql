-- consumer_provider_chat_threads도 Realtime으로 전파 (트리거 업데이트 시 뱃지 갱신)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'consumer_provider_chat_threads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE consumer_provider_chat_threads;
  END IF;
END $$;
