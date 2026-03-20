import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { sendPushToUser, initWebPush } from "@/lib/webPush";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://sel-ko.co.kr";

/** 소비자가 고민중/계약체결 선택 시 해당 시공업체에게 푸시 발송 */
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

  if (profile?.role !== "consumer") {
    return NextResponse.json({ error: "소비자만 호출할 수 있습니다." }, { status: 403 });
  }

  let body: { providerId?: string; status?: "in_progress" | "completed" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const { providerId, status } = body;
  if (!providerId || !status) {
    return NextResponse.json({ error: "providerId와 status가 필요합니다." }, { status: 400 });
  }

  if (status !== "in_progress" && status !== "completed") {
    return NextResponse.json({ error: "status는 in_progress 또는 completed여야 합니다." }, { status: 400 });
  }

  const message = status === "in_progress"
    ? "소비자가 고민중이에요"
    : "소비자가 계약을 완료 하였어요";

  const url = status === "in_progress"
    ? `${SITE_URL}/provider/estimates`
    : `${SITE_URL}/provider/estimates/completed`;

  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return NextResponse.json(
      { error: "VAPID 키가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  try {
    initWebPush();
    const result = await sendPushToUser(
      providerId,
      {
        title: "셀인코치",
        body: message,
        url,
        tag: "bidder-status",
      },
      "bidder-status"
    );

    return NextResponse.json({
      success: true,
      sent: result.ok,
      failed: result.fail,
    });
  } catch (e) {
    console.error("[push/bidder-status]", e);
    return NextResponse.json({ error: "푸시 발송에 실패했습니다." }, { status: 500 });
  }
}
