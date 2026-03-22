import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { sendPushToUser, initWebPush } from "@/lib/webPush";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://sel-ko.co.kr";

function toArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return value.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

function categoryMatches(providerCat: string, projectCat: string): boolean {
  const a = (providerCat ?? "").trim();
  const b = (projectCat ?? "").trim();
  if (!a || !b) return false;
  return a === b;
}

function getProjectCategories(p: {
  work_tree?: { cat?: string }[] | null;
  work_details?: Record<string, unknown> | null;
  category?: string[] | null;
}): string[] {
  const tree = p.work_tree ?? [];
  if (tree.length > 0) return tree.map((g) => (g.cat ?? "").trim()).filter(Boolean);
  if (p.work_details && Object.keys(p.work_details).length > 0) return Object.keys(p.work_details).map((k) => k.trim()).filter(Boolean);
  if (p.category?.length) return (p.category as string[]).map((c) => String(c).trim()).filter(Boolean);
  return [];
}

/** 프로젝트가 견적대기 상태로 변경 시 소비자 및 해당 카테고리 시공업체에게 푸시 발송 (관리자/시스템 호출) */
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

  if (profile?.role !== "admin" && profile?.role !== "super_admin") {
    return NextResponse.json({ error: "관리자만 호출할 수 있습니다." }, { status: 403 });
  }

  let body: { projectId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const { projectId } = body;
  if (!projectId) {
    return NextResponse.json({ error: "projectId가 필요합니다." }, { status: 400 });
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, user_id, title, category, work_tree, work_details")
    .eq("id", projectId)
    .maybeSingle();

  if (projectError || !project) {
    return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
  }

  const consumerId = project.user_id;
  const projectCats = getProjectCategories(project);

  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return NextResponse.json(
      { error: "VAPID 키가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  try {
    initWebPush();
    let totalOk = 0;
    let totalFail = 0;

    // 1. 소비자에게 푸시 (진행상태 알림)
    const consumerResult = await sendPushToUser(
      consumerId,
      {
        title: "셀인코치",
        body: "등록하신 셀인 프로젝트가 견적대기 상태로 바뀌었습니다. 각 공정 시공업체에게 내용이 전달됩니다.",
        url: `${SITE_URL}/dashboard/projects`,
        tag: "estimate-waiting",
      },
      "estimate-waiting",
      "progress"
    );
    totalOk += consumerResult.ok;
    totalFail += consumerResult.fail;

    // 2. 해당 카테고리 시공업체들에게 푸시
    const { data: providers } = await supabase
      .from("profiles")
      .select("user_id, category")
      .eq("role", "provider");

    const providerIds = new Set<string>();
    const providerCats = (providers ?? []).map((p) => ({
      user_id: p.user_id,
      cats: toArray(p.category),
    }));

    for (const pc of projectCats) {
      for (const prov of providerCats) {
        if (prov.cats.some((c) => categoryMatches(c, pc))) {
          providerIds.add(prov.user_id);
        }
      }
    }

    if (providerIds.size > 0) {
      const providerUrl = `${SITE_URL}/provider/estimates`;
      for (const pid of providerIds) {
        const r = await sendPushToUser(
          pid,
          {
            title: "셀인코치",
            body: "견적대기 프로젝트가 등록되었습니다.",
            url: providerUrl,
            tag: "estimate-waiting",
          },
          "estimate-waiting",
          "estimate"
        );
        totalOk += r.ok;
        totalFail += r.fail;
      }
    }

    return NextResponse.json({
      success: true,
      sent: totalOk,
      failed: totalFail,
      consumerNotified: consumerResult.ok + consumerResult.fail > 0,
      providersNotified: providerIds.size,
    });
  } catch (e) {
    console.error("[push/estimate-waiting]", e);
    return NextResponse.json({ error: "푸시 발송에 실패했습니다." }, { status: 500 });
  }
}
