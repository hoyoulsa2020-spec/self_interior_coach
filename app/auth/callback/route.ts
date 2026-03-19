import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { sendWelcomeAlimtalk } from "@/lib/kakaoAlimtalk";

function getKstDateStr() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

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

      // OAuth 로그인 시 접속 기록 (UPDATE 방식)
      try {
        const admin = createAdminClient();
        const accessDate = getKstDateStr();
        const { data: existingLog } = await admin
          .from("daily_access_logs")
          .select("visit_count")
          .eq("user_id", user.id)
          .eq("access_date", accessDate)
          .maybeSingle();

        if (existingLog) {
          await admin
            .from("daily_access_logs")
            .update({
              last_visit_at: new Date().toISOString(),
              visit_count: (existingLog.visit_count ?? 1) + 1,
            })
            .eq("user_id", user.id)
            .eq("access_date", accessDate);
        } else {
          await admin.from("daily_access_logs").insert({
            user_id: user.id,
            access_date: accessDate,
            first_visit_at: new Date().toISOString(),
            last_visit_at: new Date().toISOString(),
            visit_count: 1,
          });
        }
      } catch {
        /* ignore */
      }
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
