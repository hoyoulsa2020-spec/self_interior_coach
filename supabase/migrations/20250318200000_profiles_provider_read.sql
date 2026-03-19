-- 개인고객이 입찰한 공급업체들의 프로필(업체명, 소재지, 소개 등) 조회 가능
-- 없으면 "다른 공급업체들한테는 프로젝트 정보가 안들어온다"
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'authenticated_read_provider_profiles') THEN
    CREATE POLICY "authenticated_read_provider_profiles"
    ON profiles FOR SELECT TO authenticated
    USING (role = 'provider');
  END IF;
END $$;
