-- ============================================================
-- 견적서 참고 분석 (초안) — 업로드·파싱 결과·참고 구간
-- 정확도 100% 불가 전제, 검수·면책 문구와 함께 사용
-- ============================================================

-- 표준 대공정과 연동할 때는 category.id 와 매핑 (nullable)
CREATE TABLE IF NOT EXISTS estimate_reference_bands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id integer REFERENCES category(id) ON DELETE SET NULL,
  slug text,
  unit text NOT NULL DEFAULT 'per_m2' CHECK (unit IN ('per_m2', 'pct_of_construction', 'flat_amount')),
  min_value numeric,
  max_value numeric,
  note text,
  valid_from date DEFAULT CURRENT_DATE,
  valid_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_estimate_ref_bands_category ON estimate_reference_bands(category_id);
CREATE INDEX IF NOT EXISTS idx_estimate_ref_bands_slug ON estimate_reference_bands(slug);

COMMENT ON TABLE estimate_reference_bands IS '공정별 참고 구간(내부 기준, 시장 평균 주장 시 근거 데이터 필요)';

-- 동의어: "목공사" -> category_id 또는 slug
CREATE TABLE IF NOT EXISTS estimate_category_synonyms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phrase text NOT NULL,
  category_id integer REFERENCES category(id) ON DELETE CASCADE,
  priority int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(phrase, category_id)
);

CREATE INDEX IF NOT EXISTS idx_estimate_synonyms_phrase ON estimate_category_synonyms(phrase);

COMMENT ON TABLE estimate_category_synonyms IS '견적서에 적힌 표현 -> 표준 대공정 매핑';

-- 업로드 1건 = 분석 작업 1건
CREATE TABLE IF NOT EXISTS estimate_analysis_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  storage_path text,
  original_filename text,
  mime_type text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'parsed', 'failed', 'needs_review')),
  area_m2 numeric,
  raw_extract jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_estimate_uploads_created ON estimate_analysis_uploads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_estimate_uploads_status ON estimate_analysis_uploads(status);

COMMENT ON TABLE estimate_analysis_uploads IS '견적 파일 업로드 및 파싱 원본(또는 추출 JSON)';

-- 파싱된 행 단위 (정규화 후)
CREATE TABLE IF NOT EXISTS estimate_analysis_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id uuid NOT NULL REFERENCES estimate_analysis_uploads(id) ON DELETE CASCADE,
  source_row int,
  raw_label text,
  category_id integer REFERENCES category(id) ON DELETE SET NULL,
  amount numeric,
  confidence text CHECK (confidence IN ('high', 'medium', 'low')),
  flags text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_estimate_lines_upload ON estimate_analysis_lines(upload_id);

COMMENT ON TABLE estimate_analysis_lines IS '견적에서 추출한 공정별 금액(참고)';

-- 집계/비교 결과 (LLM 또는 규칙 엔진 출력)
CREATE TABLE IF NOT EXISTS estimate_analysis_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id uuid NOT NULL UNIQUE REFERENCES estimate_analysis_uploads(id) ON DELETE CASCADE,
  summary_json jsonb NOT NULL DEFAULT '{}',
  model text,
  rules_version text DEFAULT '1',
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE estimate_analysis_results IS '비교·요약·등급 등 최종 참고 결과(JSON)';

-- RLS: 관리자만 (소비자 오픈 시 정책 별도)
ALTER TABLE estimate_reference_bands ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_category_synonyms ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_analysis_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_analysis_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_analysis_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_estimate_reference_bands" ON estimate_reference_bands;
CREATE POLICY "admin_all_estimate_reference_bands" ON estimate_reference_bands FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
);

DROP POLICY IF EXISTS "admin_all_estimate_category_synonyms" ON estimate_category_synonyms;
CREATE POLICY "admin_all_estimate_category_synonyms" ON estimate_category_synonyms FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
);

DROP POLICY IF EXISTS "admin_all_estimate_analysis_uploads" ON estimate_analysis_uploads;
CREATE POLICY "admin_all_estimate_analysis_uploads" ON estimate_analysis_uploads FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
);

DROP POLICY IF EXISTS "admin_all_estimate_analysis_lines" ON estimate_analysis_lines;
CREATE POLICY "admin_all_estimate_analysis_lines" ON estimate_analysis_lines FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
);

DROP POLICY IF EXISTS "admin_all_estimate_analysis_results" ON estimate_analysis_results;
CREATE POLICY "admin_all_estimate_analysis_results" ON estimate_analysis_results FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
);
