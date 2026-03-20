import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";

/** 관리자 전용: 푸시 발송 이력 조회 */
export async function GET(request: NextRequest) {
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
    return NextResponse.json({ error: "관리자만 조회할 수 있습니다." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get("limit") ?? "20";
  const limit = [10, 20, 30].includes(parseInt(limitParam, 10)) ? parseInt(limitParam, 10) : 20;
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const offset = (page - 1) * limit;

  const [{ count: total }, { data: logs, error }] = await Promise.all([
    supabase.from("push_logs").select("id", { count: "exact", head: true }),
    supabase
      .from("push_logs")
      .select("id, recipient_user_id, title, body, url, tag, source, status, created_at")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1),
  ]);

  if (error) {
    console.error("[push/logs]", error);
    return NextResponse.json({ error: "조회에 실패했습니다." }, { status: 500 });
  }

  const userIds = [...new Set((logs ?? []).map((r) => r.recipient_user_id).filter(Boolean))];
  const profMap = new Map<string, { name?: string; email?: string; business_name?: string }>();
  if (userIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("user_id, name, email, business_name")
      .in("user_id", userIds);
    for (const p of profs ?? []) {
      profMap.set(p.user_id, p);
    }
  }

  const rows = (logs ?? []).map((row) => {
    const prof = profMap.get(row.recipient_user_id);
    return {
      id: row.id,
      recipient_user_id: row.recipient_user_id,
      recipient_name: prof?.business_name || prof?.name || "—",
      recipient_email: prof?.email ?? "—",
      title: row.title,
      body: row.body,
      url: row.url,
      tag: (row as { tag?: string }).tag ?? null,
      source: row.source,
      status: row.status,
      created_at: row.created_at,
    };
  });

  return NextResponse.json({
    logs: rows,
    total: total ?? 0,
    page,
    limit,
    totalPages: Math.ceil((total ?? 0) / limit),
  });
}
