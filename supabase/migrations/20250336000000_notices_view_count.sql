-- 공지사항 조회수
ALTER TABLE notices ADD COLUMN IF NOT EXISTS view_count int DEFAULT 0;

-- 조회수 증가 함수 (공지 상세 조회 시 호출)
CREATE OR REPLACE FUNCTION increment_notice_view(nid uuid)
RETURNS void AS $$
  UPDATE notices SET view_count = COALESCE(view_count, 0) + 1 WHERE id = nid;
$$ LANGUAGE sql SECURITY DEFINER;

-- 인증된 사용자만 실행 가능
GRANT EXECUTE ON FUNCTION increment_notice_view(uuid) TO authenticated;
