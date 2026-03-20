import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { sendPushToUser, initWebPush } from "@/lib/webPush";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://sel-ko.co.kr";

/** 시공업체가 견적 제출 시 소비자에게 푸시 발송 */
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

  if (profile?.role !== "provider") {
    return NextResponse.json({ error: "시공업체만 호출할 수 있습니다." }, { status: 403 });
  }

  let body: { projectId?: string; category?: string; consumerId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const { projectId, category, consumerId } = body;
  if (!projectId || !category || !consumerId) {
    return NextResponse.json({ error: "projectId, category, consumerId가 필요합니다." }, { status: 400 });
  }

  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return NextResponse.json(
      { error: "VAPID 키가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  try {
    initWebPush();
    const result = await sendPushToUser(
      consumerId,
      {
        title: "셀인코치",
        body: `${category} 공정에 시공업체가 금액을 제안했어요`,
        url: `${SITE_URL}/dashboard/projects`,
        tag: "estimate-submitted",
      },
      "estimate-submitted"
    );

    return NextResponse.json({
      success: true,
      sent: result.ok,
      failed: result.fail,
    });
  } catch (e) {
    console.error("[push/estimate-submitted]", e);
    return NextResponse.json({ error: "푸시 발송에 실패했습니다." }, { status: 500 });
  }
}
