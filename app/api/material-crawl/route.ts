import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { load } from "cheerio";

const MIN_IMG_WIDTH = 80;
const MIN_IMG_HEIGHT = 80;
const MAX_ITEMS = 100;

export type CrawlItem = {
  imageUrl: string;
  name: string;
};

function resolveUrl(base: string, href: string): string {
  if (href.startsWith("http://") || href.startsWith("https://") || href.startsWith("//")) {
    return href.startsWith("//") ? `https:${href}` : href;
  }
  const baseUrl = new URL(base);
  return new URL(href, baseUrl).href;
}

export async function POST(request: NextRequest) {
  try {
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
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    const body = await request.json();
    const { url } = body;
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL을 입력해주세요." }, { status: 400 });
    }

    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return NextResponse.json({ error: "유효한 URL을 입력해주세요." }, { status: 400 });
    }

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      return NextResponse.json({ error: `페이지를 불러올 수 없습니다. (${res.status})` }, { status: 400 });
    }

    const html = await res.text();
    const $ = load(html);
    const baseUrl = `${parsed.protocol}//${parsed.host}`;
    const items: CrawlItem[] = [];
    const seen = new Set<string>();

    $("img").each((_, el) => {
      if (items.length >= MAX_ITEMS) return false;

      const src = $(el).attr("src") ?? $(el).attr("data-src") ?? $(el).attr("data-lazy-src");
      if (!src) return;

      const fullUrl = resolveUrl(baseUrl, src);
      if (!fullUrl.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i) && !fullUrl.includes("image") && !fullUrl.includes("upload")) return;

      if (seen.has(fullUrl)) return;
      seen.add(fullUrl);

      const width = parseInt($(el).attr("width") ?? "0", 10);
      const height = parseInt($(el).attr("height") ?? "0", 10);
      if (width > 0 && height > 0 && width < MIN_IMG_WIDTH && height < MIN_IMG_HEIGHT) return;

      const alt = $(el).attr("alt")?.trim() ?? "";
      let name = alt || "";

      if (!name) {
        const parent = $(el).closest("a, div, article, li, figure");
        const nameEl = parent.find("h1, h2, h3, h4, .title, .name, .product-name, [class*='title'], [class*='name']").first();
        if (nameEl.length) name = nameEl.text().trim().slice(0, 100);
        if (!name) name = parent.find("img").attr("alt")?.trim() ?? "";
      }
      if (!name) {
        const parent = $(el).parent();
        const next = parent.find("a, span, p, div").first();
        if (next.length) name = next.text().trim().slice(0, 100);
      }
      name = name || `이미지 ${items.length + 1}`;

      items.push({ imageUrl: fullUrl, name: name.slice(0, 200) });
    });

    return NextResponse.json({ items });
  } catch (e) {
    console.error("[material-crawl]", e);
    const msg = e instanceof Error ? e.message : "크롤링 중 오류가 발생했습니다.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
