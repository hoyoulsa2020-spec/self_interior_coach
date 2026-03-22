-- FCM(앱 푸시) 지원: Web Push와 별도로 FCM 토큰 저장
-- endpoint가 'fcm:'으로 시작하면 FCM 구독, p256dh/auth는 null 허용

ALTER TABLE push_subscriptions
  ALTER COLUMN p256dh DROP NOT NULL,
  ALTER COLUMN auth DROP NOT NULL;

COMMENT ON COLUMN push_subscriptions.endpoint IS 'Web Push: subscription endpoint URL. FCM: fcm:TOKEN 형식';
