import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { sendPushToUser, sendPushToAll, initWebPush } from "@/lib/webPush";

/** 관리자 전용: 푸시 발송 (테스트 또는 공지) */
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin" && profile?.role !== "super_admin") {
    return NextResponse.json({ error: "관리자만 사용할 수 있습니다." }, { status: 403 });
  }

  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return NextResponse.json(
      { error: "VAPID 키가 설정되지 않았습니다. .env에 NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY를 추가하세요." },
      { status: 500 }
    );
  }

  let data: { userId?: string; title?: string; body?: string; url?: string };
  try {
    data = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const { userId, title = "셀인코치", body = "테스트 알림입니다.", url = "/" } = data;

  try {
    initWebPush();
    let result: { ok: number; fail: number };

    if (userId) {
      result = await sendPushToUser(userId, { title, body, url });
    } else {
      result = await sendPushToAll({ title, body, url });
    }

    return NextResponse.json({
      success: true,
      sent: result.ok,
      failed: result.fail,
    });
  } catch (e) {
    console.error("[push/send]", e);
    return NextResponse.json({ error: "푸시 발송에 실패했습니다." }, { status: 500 });
  }
}
