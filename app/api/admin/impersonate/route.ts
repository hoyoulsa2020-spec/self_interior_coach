import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";

export async function GET(request: NextRequest) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "서버 설정이 필요합니다. SUPABASE_SERVICE_ROLE_KEY를 확인하세요." },
      { status: 500 }
    );
  }

  const userId = request.nextUrl.searchParams.get("userId");
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!userId || !token) {
    return NextResponse.json(
      { error: "userId와 인증 토큰이 필요합니다." },
      { status: 400 }
    );
  }

  const supabaseAdmin = createAdminClient();

  // 1. 토큰 검증 및 관리자 여부 확인
  const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !caller) {
    return NextResponse.json({ error: "인증에 실패했습니다." }, { status: 401 });
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("user_id", caller.id)
    .maybeSingle();

  if (profile?.role !== "admin" && profile?.role !== "super_admin") {
    return NextResponse.json({ error: "관리자만 사용할 수 있습니다." }, { status: 403 });
  }

  // 2. 대상 사용자 이메일 조회
  let targetEmail: string | null = null;

  const { data: targetProfile } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .eq("user_id", userId)
    .eq("role", "consumer")
    .maybeSingle();

  if (targetProfile?.email) {
    targetEmail = targetProfile.email;
  } else {
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
    targetEmail = authUser?.user?.email ?? null;
  }

  if (!targetEmail) {
    return NextResponse.json({ error: "대상 사용자를 찾을 수 없습니다." }, { status: 404 });
  }

  // 3. 매직 링크 생성
  const redirectTo = request.nextUrl.origin + "/dashboard";
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email: targetEmail,
    options: { redirectTo },
  });

  if (linkError) {
    console.error("generateLink 오류:", linkError);
    return NextResponse.json(
      { error: "대리 로그인 링크 생성에 실패했습니다." },
      { status: 500 }
    );
  }

  const data = linkData as Record<string, unknown>;
  const loginUrl =
    (data?.properties as Record<string, string> | undefined)?.action_link ??
    (data?.action_link as string | undefined);

  if (!loginUrl) {
    return NextResponse.json(
      { error: "로그인 링크를 생성할 수 없습니다." },
      { status: 500 }
    );
  }

  return NextResponse.json({ loginUrl });
}
