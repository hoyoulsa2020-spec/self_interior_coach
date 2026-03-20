import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { sendPushToUser, initWebPush } from "@/lib/webPush";

/** 소비자↔공급업체 채팅 메시지 전송 시 상대방에게 푸시 발송 */
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

  if (profile?.role !== "consumer" && profile?.role !== "provider") {
    return NextResponse.json({ error: "소비자 또는 공급업체만 호출할 수 있습니다." }, { status: 403 });
  }

  let body: { recipientUserId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const { recipientUserId } = body;
  if (!recipientUserId) {
    return NextResponse.json({ error: "recipientUserId가 필요합니다." }, { status: 400 });
  }

  const { data: recipientProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", recipientUserId)
    .maybeSingle();

  const url = recipientProfile?.role === "provider" ? "/provider/consumer-chat" : "/dashboard/provider-chat";

  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return NextResponse.json(
      { error: "VAPID 키가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  try {
    initWebPush();
    const result = await sendPushToUser(
      recipientUserId,
      {
        title: "셀인코치",
        body: recipientProfile?.role === "consumer" ? "시공업체에서 새 메시지가 도착했습니다." : "고객님께서 새 메시지를 보내셨습니다.",
        url,
        tag: "selco-cp-chat",
      },
      "consumer-provider-chat-notify"
    );

    return NextResponse.json({
      success: true,
      sent: result.ok,
      failed: result.fail,
    });
  } catch (e) {
    console.error("[push/consumer-provider-chat-notify]", e);
    return NextResponse.json({ error: "푸시 발송에 실패했습니다." }, { status: 500 });
  }
}
