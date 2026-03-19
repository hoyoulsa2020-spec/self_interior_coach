/**
 * 개인고객 RLS 정책 적용 스크립트
 * Cursor 터미널에서: npm run db:apply-consumer-policies
 *
 * .env.local에 DATABASE_URL 추가 필요:
 * Supabase 대시보드 > Settings > Database > Connection string (URI) 복사
 */

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", ".env.local") });

const sql = `
DROP POLICY IF EXISTS "consumer_select_own_project_estimates" ON project_estimates;
CREATE POLICY "consumer_select_own_project_estimates"
ON project_estimates FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = project_estimates.project_id
      AND projects.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "consumer_select_own_assignments" ON project_category_assignments;
CREATE POLICY "consumer_select_own_assignments"
ON project_category_assignments FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = project_category_assignments.project_id
      AND projects.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "consumer_insert_own_assignments" ON project_category_assignments;
CREATE POLICY "consumer_insert_own_assignments"
ON project_category_assignments FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = project_category_assignments.project_id
      AND projects.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "consumer_update_own_assignments" ON project_category_assignments;
CREATE POLICY "consumer_update_own_assignments"
ON project_category_assignments FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = project_category_assignments.project_id
      AND projects.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = project_category_assignments.project_id
      AND projects.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "consumer_delete_own_assignments" ON project_category_assignments;
CREATE POLICY "consumer_delete_own_assignments"
ON project_category_assignments FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = project_category_assignments.project_id
      AND projects.user_id = auth.uid()
  )
);
`;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(`
❌ DATABASE_URL이 .env.local에 없습니다.

1. Supabase 대시보드 접속
2. 프로젝트 선택 > Settings > Database
3. "Connection string" > "URI" 복사
4. .env.local에 추가:
   DATABASE_URL=postgresql://postgres.[프로젝트ref]:[비밀번호]@aws-0-[지역].pooler.supabase.com:6543/postgres
`);
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url });
  try {
    await pool.query(sql);
    console.log("✅ 개인고객 RLS 정책 적용 완료");
  } catch (err) {
    console.error("❌ 오류:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
