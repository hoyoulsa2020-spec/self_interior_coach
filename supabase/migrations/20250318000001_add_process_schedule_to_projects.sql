-- 공정별 공사일자 (공정표)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS process_schedule jsonb;
