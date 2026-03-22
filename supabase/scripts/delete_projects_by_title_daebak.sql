-- Supabase SQL Editor에서 한 번 실행 (테스트용 제목 정리)
-- 제목에 '대박나자'가 포함된 프로젝트를 삭제합니다.
-- FK 오류 시: 해당 프로젝트에 연결된 행을 먼저 삭제하거나, 대시보드에서 수동 삭제하세요.

DELETE FROM projects
WHERE title ILIKE '%대박나자%'
RETURNING id, title;
