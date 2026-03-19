-- 업체가 견적 입력 시(project_estimates INSERT/UPDATE) 프로젝트 상태를 자동으로 진행중(active)으로 전환

CREATE OR REPLACE FUNCTION trigger_project_active_on_estimate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.amounts IS NOT NULL AND jsonb_typeof(NEW.amounts) = 'object' AND (NEW.amounts != '{}'::jsonb) THEN
    UPDATE projects
    SET status = 'active'
    WHERE id = NEW.project_id
      AND status = 'estimate_waiting';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_project_active_on_estimate ON project_estimates;
CREATE TRIGGER trg_project_active_on_estimate
  AFTER INSERT OR UPDATE OF amounts ON project_estimates
  FOR EACH ROW
  EXECUTE FUNCTION trigger_project_active_on_estimate();
