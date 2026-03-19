-- ============================================================
-- 테스트: 프로젝트를 견적대기로 변경 (공급업체가 볼 수 있게)
-- Supabase SQL Editor에서 실행
-- ============================================================

-- publish_requested 또는 pending 프로젝트 1개를 estimate_waiting으로 변경
UPDATE projects
SET status = 'estimate_waiting'
WHERE id = (
  SELECT id FROM projects
  WHERE status IN ('publish_requested', 'pending')
  ORDER BY created_at DESC
  LIMIT 1
)
RETURNING id, title, status;
