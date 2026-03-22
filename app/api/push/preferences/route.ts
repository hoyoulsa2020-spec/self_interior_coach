import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";

/** 현재 기기(PWA/앱) 푸시 구독 목록 조회 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: "인증에 실패했습니다." }, { status: 401 });
  }

  const { data } = await supabase
    .from("push_subscriptions")
    .select("endpoint, source, chat_push, progress_push, estimate_push")
    .eq("user_id", user.id)
    .eq("is_active", true);

  return NextResponse.json({ subscriptions: data ?? [] });
}

/** 푸시 알림 유형별 설정 업데이트 */
export async function PATCH(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: "인증에 실패했습니다." }, { status: 401 });
  }

  let body: { endpoint?: string; chat_push?: boolean; progress_push?: boolean; estimate_push?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const { endpoint, chat_push, progress_push, estimate_push } = body;
  if (!endpoint) {
    return NextResponse.json({ error: "endpoint가 필요합니다." }, { status: 400 });
  }

  const updates: Record<string, boolean> = {};
  if (typeof chat_push === "boolean") updates.chat_push = chat_push;
  if (typeof progress_push === "boolean") updates.progress_push = progress_push;
  if (typeof estimate_push === "boolean") updates.estimate_push = estimate_push;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: true });
  }

  const { error } = await supabase
    .from("push_subscriptions")
    .update(updates)
    .eq("user_id", user.id)
    .eq("endpoint", endpoint);

  if (error) {
    console.error("[push/preferences]", error);
    return NextResponse.json({ error: "설정 저장에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
