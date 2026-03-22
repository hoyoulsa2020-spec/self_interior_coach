/**
 * 자재창고(supply_materials) 전체 삭제 스크립트
 * 실행: node scripts/delete-all-materials.js
 *
 * .env.local에 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local") });

const { createClient } = require("@supabase/supabase-js");

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY를 .env.local에 설정하세요.");
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { count: beforeCount } = await supabase.from("supply_materials").select("id", { count: "exact", head: true });

  const { error } = await supabase
    .from("supply_materials")
    .delete()
    .gte("created_at", "1970-01-01");

  if (error) {
    console.error("삭제 실패:", error.message);
    process.exit(1);
  }

  console.log(`자재창고 ${beforeCount ?? 0}건 삭제 완료.`);
}

main();
