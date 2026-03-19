-- project_category_assignments: 거래진행 상태 추가
-- match_status: 'in_progress'(거래진행중), 'completed'(매칭완료), 'cancelled'(거래취소)
-- match_started_at: 거래진행 시작 시각 (72시간 카운트 기준)

ALTER TABLE project_category_assignments
  ADD COLUMN IF NOT EXISTS match_status text DEFAULT 'in_progress',
  ADD COLUMN IF NOT EXISTS match_started_at timestamptz DEFAULT now();

COMMENT ON COLUMN project_category_assignments.match_status IS 'in_progress: 거래진행중(72h), completed: 매칭완료, cancelled: 거래취소';
COMMENT ON COLUMN project_category_assignments.match_started_at IS '거래진행 시작 시각 (72시간 카운트 기준)';
