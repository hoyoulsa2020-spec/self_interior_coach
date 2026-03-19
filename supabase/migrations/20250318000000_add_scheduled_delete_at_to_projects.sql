-- 프로젝트 삭제 예정일 (3일 후 실제 삭제)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS scheduled_delete_at timestamptz;
