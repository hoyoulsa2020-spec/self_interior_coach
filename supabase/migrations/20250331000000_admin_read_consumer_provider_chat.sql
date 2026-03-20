-- 관리자가 소비자-시공업체 채팅을 모니터링할 수 있도록 SELECT 정책 추가
DROP POLICY IF EXISTS "admin_read_cpct" ON consumer_provider_chat_threads;
CREATE POLICY "admin_read_cpct" ON consumer_provider_chat_threads FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
);

DROP POLICY IF EXISTS "admin_read_cpcm" ON consumer_provider_chat_messages;
CREATE POLICY "admin_read_cpcm" ON consumer_provider_chat_messages FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
);
