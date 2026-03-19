import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";

/** 관리자 전용: 푸시 구독자 수 조회 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: "인증에 실패했습니다." }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin" && profile?.role !== "super_admin") {
    return NextResponse.json({ error: "관리자만 사용할 수 있습니다." }, { status: 403 });
  }

  const { count, error } = await supabase
    .from("push_subscriptions")
    .select("*", { count: "exact", head: true })
    .eq("is_active", true);

  if (error) {
    console.error("[push/subscriptions-count]", error);
    return NextResponse.json({ error: error.message, count: 0 }, { status: 500 });
  }

  return NextResponse.json({ count: count ?? 0 });
}
