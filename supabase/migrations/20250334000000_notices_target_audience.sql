-- 공지사항 대상 구분: 시공업체(provider) / 소비자(consumer)
ALTER TABLE notices
  ADD COLUMN IF NOT EXISTS target_audience text NOT NULL DEFAULT 'consumer'
  CHECK (target_audience IN ('provider', 'consumer'));

CREATE INDEX IF NOT EXISTS idx_notices_target ON notices(target_audience);

COMMENT ON COLUMN notices.target_audience IS '공지 대상: provider=시공업체, consumer=소비자';
