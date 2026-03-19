import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";

/** 로그인 시 접속 기록 (UPDATE 방식: user_id + date 당 1 row) */
export async function POST(request: NextRequest) {
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

  // KST 기준 오늘 날짜
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const accessDate = kst.toISOString().slice(0, 10);

  const { data: existing } = await supabase
    .from("daily_access_logs")
    .select("visit_count")
    .eq("user_id", user.id)
    .eq("access_date", accessDate)
    .maybeSingle();

  if (existing) {
    const { error: updateError } = await supabase
      .from("daily_access_logs")
      .update({
        last_visit_at: new Date().toISOString(),
        visit_count: (existing.visit_count ?? 1) + 1,
      })
      .eq("user_id", user.id)
      .eq("access_date", accessDate);

    if (updateError) {
      console.error("[access-log] update error:", updateError);
      return NextResponse.json({ error: "접속 기록 실패" }, { status: 500 });
    }
  } else {
    const { error: insertError } = await supabase.from("daily_access_logs").insert({
      user_id: user.id,
      access_date: accessDate,
      first_visit_at: new Date().toISOString(),
      last_visit_at: new Date().toISOString(),
      visit_count: 1,
    });

    if (insertError) {
      console.error("[access-log] insert error:", insertError);
      return NextResponse.json({ error: "접속 기록 실패" }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
