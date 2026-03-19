-- ============================================================
-- 공급업체 프로젝트 안 보일 때 진단용 (Supabase SQL Editor에서 실행)
-- ============================================================

-- 1) 현재 로그인한 공급업체의 profiles 확인 (관리자로 실행 시)
-- ※ auth.uid()는 SQL Editor에서는 null이므로, 아래에서 user_id를 직접 지정해서 확인
SELECT user_id, name, role, category
FROM profiles
WHERE role = 'provider'
LIMIT 5;

-- 2) projects 테이블 RLS 정책 목록 확인
SELECT policyname, cmd, qual::text
FROM pg_policies
WHERE tablename = 'projects'
ORDER BY policyname;

-- 3) is_provider() 함수 존재 여부
SELECT proname FROM pg_proc WHERE proname = 'is_provider';

-- 4) 견적대기 프로젝트가 실제로 있는지 (RLS 무시, 관리자 권한으로)
SELECT COUNT(*) AS estimate_waiting_count FROM projects WHERE status = 'estimate_waiting';

-- 5) 프로젝트 상태별 개수
SELECT status, COUNT(*) FROM projects GROUP BY status ORDER BY status;

-- 6) [테스트용] publish_requested 또는 pending 프로젝트 1개를 estimate_waiting으로 변경
-- ※ 아래 실행 시 공급업체 페이지에서 해당 프로젝트가 보입니다
/*
UPDATE projects
SET status = 'estimate_waiting'
WHERE id = (SELECT id FROM projects WHERE status IN ('publish_requested', 'pending') LIMIT 1)
RETURNING id, title, status;
*/
