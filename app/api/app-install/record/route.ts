import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";

/** 앱 첫 실행 시 설치 정보 기록 (인증 불필요) */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      install_id,
      platform,
      app_version,
      app_build,
      device_model,
      device_manufacturer,
      os_version,
      user_id,
    } = body;

    if (!install_id || typeof install_id !== "string" || install_id.length > 128) {
      return NextResponse.json({ error: "install_id 필요" }, { status: 400 });
    }
    if (!platform || !["android", "ios"].includes(platform)) {
      return NextResponse.json({ error: "platform 필요 (android|ios)" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { error } = await supabase.from("app_installs").insert({
      install_id: String(install_id).slice(0, 128),
      platform,
      app_version: app_version ? String(app_version).slice(0, 32) : null,
      app_build: app_build ? String(app_build).slice(0, 32) : null,
      device_model: device_model ? String(device_model).slice(0, 128) : null,
      device_manufacturer: device_manufacturer ? String(device_manufacturer).slice(0, 64) : null,
      os_version: os_version ? String(os_version).slice(0, 32) : null,
      user_id: user_id || null,
    });

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ success: true });
      }
      console.error("[app-install] insert error:", error);
      return NextResponse.json({ error: "저장 실패" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[app-install] error:", e);
    return NextResponse.json({ error: "요청 처리 실패" }, { status: 500 });
  }
}
