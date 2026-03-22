-- ============================================================
-- 앱 첫 실행(설치) 정보 저장
-- APK/앱 설치 후 첫 실행 시 기기/앱 정보 기록
-- ============================================================

CREATE TABLE IF NOT EXISTS app_installs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  install_id text NOT NULL UNIQUE,
  platform text NOT NULL,
  app_version text,
  app_build text,
  device_model text,
  device_manufacturer text,
  os_version text,
  first_launch_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_installs_install_id ON app_installs(install_id);
CREATE INDEX IF NOT EXISTS idx_app_installs_first_launch ON app_installs(first_launch_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_installs_platform ON app_installs(platform);
CREATE INDEX IF NOT EXISTS idx_app_installs_user ON app_installs(user_id);

ALTER TABLE app_installs ENABLE ROW LEVEL SECURITY;

-- 서비스 롤만 INSERT (API route에서 admin client 사용)
-- 조회는 관리자만
DROP POLICY IF EXISTS "admin_select_app_installs" ON app_installs;
CREATE POLICY "admin_select_app_installs" ON app_installs FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
);

COMMENT ON TABLE app_installs IS '앱(APK/iOS) 첫 실행 시 수집한 설치 정보';
COMMENT ON COLUMN app_installs.install_id IS '앱 내부에서 생성한 고유 ID (재설치 시 새로 생성)';
COMMENT ON COLUMN app_installs.platform IS 'android | ios';
COMMENT ON COLUMN app_installs.user_id IS '첫 실행 시 로그인되어 있으면 저장, 없으면 null';
