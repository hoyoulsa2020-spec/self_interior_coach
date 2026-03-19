import { NextResponse } from "next/server";

export async function GET() {
  const hasSupabaseUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  const hasSupabaseAnon = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const hasServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  return NextResponse.json({
    ok: hasSupabaseUrl && hasSupabaseAnon,
    supabaseUrl: hasSupabaseUrl ? "설정됨" : "없음",
    supabaseAnon: hasSupabaseAnon ? "설정됨" : "없음",
    serviceRole: hasServiceRole ? "설정됨" : "없음",
  });
}
