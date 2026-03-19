import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendWelcomeAlimtalk } from "@/lib/kakaoAlimtalk";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      const user = data.user;
      const metadata = user.user_metadata as Record<string, string>;
      const name = metadata.full_name ?? metadata.name ?? "";
      const phone = metadata.phone ?? "";

      const { data: existing } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("user_id", user.id)
        .single();

      if (!existing) {
        await supabase.from("profiles").insert({
          user_id: user.id,
          email: user.email ?? "",
          name,
          phone,
          role: metadata.userType ?? "consumer",
          status: "pending",
        });

        // 가입 환영 알림톡 (전화번호 있으면 카카오톡으로 채널 친구추가 안내)
        if (phone?.trim()) {
          sendWelcomeAlimtalk(phone.trim(), name).catch((e) =>
            console.error("[auth/callback] 알림톡 발송 실패:", e)
          );
        }
      }

      return NextResponse.redirect(`${origin}/dashboard`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
