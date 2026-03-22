import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";

export async function POST(request: NextRequest) {
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

  let body: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    fcm_token?: string;
    source?: "pwa" | "app";
    chat_push?: boolean;
    progress_push?: boolean;
    estimate_push?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const { endpoint, keys, fcm_token, source = "pwa", chat_push, progress_push, estimate_push } = body;

  let endpointVal: string;
  let p256dhVal: string | null = null;
  let authVal: string | null = null;

  if (source === "app" && fcm_token?.trim()) {
    endpointVal = `fcm:${fcm_token.trim()}`;
  } else if (endpoint && keys?.p256dh && keys?.auth) {
    endpointVal = endpoint;
    p256dhVal = keys.p256dh;
    authVal = keys.auth;
  } else {
    return NextResponse.json({ error: "구독 정보가 올바르지 않습니다." }, { status: 400 });
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
  const role = (profile as { role?: string } | null)?.role ?? "consumer";

  const payload = {
    user_id: user.id,
    endpoint: endpointVal,
    p256dh: p256dhVal,
    auth: authVal,
    is_active: true,
    source: source === "app" ? "app" : "pwa",
    chat_push: chat_push ?? true,
    progress_push: progress_push ?? (role === "consumer"),
    estimate_push: estimate_push ?? (role === "provider"),
  };

  const { error } = await supabase.from("push_subscriptions").upsert(
    payload,
    { onConflict: "endpoint" }
  );

  if (error) {
    console.error("[push/subscribe] Supabase error:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return NextResponse.json(
      {
        error: "구독 저장에 실패했습니다.",
        detail: error.message,
        code: error.code,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
