-- project_estimates 확장: 견적연구소 데이터 활용용
-- 대공정 작업기간, 프로젝트 정보(평형 등), 업체명 저장

ALTER TABLE project_estimates ADD COLUMN IF NOT EXISTS project_snapshot jsonb;
ALTER TABLE project_estimates ADD COLUMN IF NOT EXISTS process_schedule jsonb;
ALTER TABLE project_estimates ADD COLUMN IF NOT EXISTS provider_business_name text;

COMMENT ON COLUMN project_estimates.project_snapshot IS '프로젝트 정보 스냅샷: title, site_address1, site_address2, supply_area_m2, exclusive_area_m2, is_expanded, start_date, move_in_date, work_tree';
COMMENT ON COLUMN project_estimates.process_schedule IS '대공정별 작업기간';
COMMENT ON COLUMN project_estimates.provider_business_name IS '시공업체명';

-- Admin이 견적연구소에서 데이터 조회 가능
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'project_estimates' AND policyname = 'admin_select_all_estimates') THEN
    CREATE POLICY "admin_select_all_estimates"
    ON project_estimates FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.user_id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin')
      )
    );
  END IF;
END $$;
