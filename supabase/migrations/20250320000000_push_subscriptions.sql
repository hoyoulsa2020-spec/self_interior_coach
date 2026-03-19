-- ============================================================
-- PWA 푸시 알림 구독 (push_subscriptions)
-- ============================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_active ON push_subscriptions(is_active) WHERE is_active = true;

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- 본인 구독만 조회/추가/삭제
DROP POLICY IF EXISTS "user_select_own_push" ON push_subscriptions;
CREATE POLICY "user_select_own_push" ON push_subscriptions FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_insert_own_push" ON push_subscriptions;
CREATE POLICY "user_insert_own_push" ON push_subscriptions FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "user_update_own_push" ON push_subscriptions;
CREATE POLICY "user_update_own_push" ON push_subscriptions FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "user_delete_own_push" ON push_subscriptions;
CREATE POLICY "user_delete_own_push" ON push_subscriptions FOR DELETE TO authenticated
USING (user_id = auth.uid());

