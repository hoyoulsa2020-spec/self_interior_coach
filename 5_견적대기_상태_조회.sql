-- ============================================================
-- 견적대기 페이지 4가지 상태 조회 (확인용)
-- Supabase SQL Editor에서 실행
-- ============================================================
-- UI 상태 4개는 DB에서 서로 다른 조건으로 결정됨:
--
--   UI상태      | DB 조건
--   ------------|--------------------------------------------------
--   none        | project_estimates.amounts에 해당 category 없음 (견적 미입력)
--   매칭대기    | amounts에는 있으나 project_category_assignments에 해당 category 없음
--   거래진행중  | pca.match_status = 'in_progress' AND pca.provider_id = 내 업체
--   거래취소    | pca.match_status = 'cancelled' AND pca.provider_id = 내 업체
--
-- (견적대기에서 제외되는 상태)
--   계약완료    | pca.match_status = 'completed'
--   매칭실패    | pca.provider_id != 내 업체
-- ============================================================

-- 1) project_category_assignments의 match_status 분포 (DB에 저장된 값 3종)
SELECT
  COALESCE(match_status, '(null)') AS match_status,
  COUNT(*) AS cnt,
  CASE COALESCE(match_status, '')
    WHEN 'in_progress' THEN '→ UI: 거래진행중'
    WHEN 'completed'   THEN '→ UI: 계약완료'
    WHEN 'cancelled'   THEN '→ UI: 거래취소'
    ELSE '→ 기타'
  END AS ui_label
FROM project_category_assignments
GROUP BY match_status
ORDER BY cnt DESC;

-- 2) 프로젝트·대공정별 할당 현황 (match_status 확인)
SELECT
  p.id AS project_id,
  p.title,
  pca.category,
  pca.match_status,
  pca.provider_id,
  pca.match_started_at
FROM projects p
JOIN project_category_assignments pca ON pca.project_id = p.id
WHERE p.status IN ('estimate_waiting', 'active')
ORDER BY p.created_at DESC, pca.category
LIMIT 50;
