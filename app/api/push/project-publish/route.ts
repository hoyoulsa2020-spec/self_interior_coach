import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { sendPushToAdmins, initWebPush } from "@/lib/webPush";

/** 소비자가 프로젝트 최종발행 요청 시 관리자들에게 푸시 발송 */
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

  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return NextResponse.json(
      { error: "VAPID 키가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  try {
    initWebPush();
    const result = await sendPushToAdmins(
      {
        title: "셀인코치",
        body: "새 프로젝트가 최종발행 요청되었습니다.",
        url: "/admin/projects",
        tag: "project-publish",
      },
      "project-publish"
    );

    return NextResponse.json({
      success: true,
      sent: result.ok,
      failed: result.fail,
    });
  } catch (e) {
    console.error("[push/project-publish]", e);
    return NextResponse.json({ error: "푸시 발송에 실패했습니다." }, { status: 500 });
  }
}
