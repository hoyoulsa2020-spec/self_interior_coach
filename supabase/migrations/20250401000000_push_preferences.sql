-- 푸시 알림 구독에 source(PWA/앱) 및 유형별 설정 추가
ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'pwa' CHECK (source IN ('pwa', 'app')),
  ADD COLUMN IF NOT EXISTS chat_push boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS progress_push boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS estimate_push boolean DEFAULT true;

COMMENT ON COLUMN push_subscriptions.source IS 'pwa: 웹/PWA, app: Capacitor 앱';
COMMENT ON COLUMN push_subscriptions.chat_push IS '채팅 푸시 수신';
COMMENT ON COLUMN push_subscriptions.progress_push IS '진행상태 알림 수신 (소비자)';
COMMENT ON COLUMN push_subscriptions.estimate_push IS '견적 알림 수신 (시공업체)';
