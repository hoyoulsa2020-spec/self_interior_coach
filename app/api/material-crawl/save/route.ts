import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import type { SupabaseClient } from "@supabase/supabase-js";

async function fetchUploadImage(
  supabase: SupabaseClient,
  userId: string,
  imgUrl: string,
  index: number
): Promise<{ url: string | null }> {
  try {
    const res = await fetch(imgUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Bot/1.0)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.warn(`[material-crawl/save] Failed to fetch image ${index + 1}:`, res.status);
      return { url: null };
    }
    const blob = await res.blob();
    const contentType = blob.type || "image/jpeg";
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const path = `materials/${userId}/${Date.now()}_${index}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("material-images")
      .upload(path, blob, { contentType: contentType.startsWith("image/") ? contentType : "image/jpeg" });
    if (upErr) {
      console.warn(`[material-crawl/save] Upload failed for image ${index + 1}:`, upErr.message);
      return { url: null };
    }
    const { data: urlData } = supabase.storage.from("material-images").getPublicUrl(path);
    return { url: urlData.publicUrl };
  } catch (e) {
    console.warn(`[material-crawl/save] Error processing image ${index + 1}:`, e);
    return { url: null };
  }
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
    const { items, description, brand, category_id, imageUrls, material_id } = body;

    if (!category_id || typeof category_id !== "number") {
      return NextResponse.json({ error: "대공정을 선택해주세요." }, { status: 400 });
    }

    const trimmedDesc = description?.trim()?.slice(0, 1000) || null;
    const trimmedBrand = brand?.trim()?.slice(0, 100) || null;

    if (material_id && typeof material_id === "string" && material_id.trim()) {
      const addItems = Array.isArray(items) ? items : (Array.isArray(imageUrls) ? imageUrls.map((u: string) => ({ imageUrl: u, name: "" })) : []);
      if (addItems.length === 0) {
        return NextResponse.json({ error: "이미지를 1장 이상 선택해주세요." }, { status: 400 });
      }

      const uploadedUrls: string[] = [];
      const uploadedNames: string[] = [];
      for (let i = 0; i < addItems.length; i++) {
        const it = addItems[i];
        const imgUrl = typeof it === "object" && it?.imageUrl ? String(it.imageUrl).trim() : String(it).trim();
        if (!imgUrl) continue;
        const { url } = await fetchUploadImage(supabase, user.id, imgUrl, i);
        if (url) {
          uploadedUrls.push(url);
          uploadedNames.push(typeof it === "object" && it?.name ? String(it.name).trim().slice(0, 200) : "");
        }
      }

      if (uploadedUrls.length === 0) {
        return NextResponse.json({ error: "이미지를 저장할 수 없습니다. URL을 확인해주세요." }, { status: 400 });
      }

      const { data: existing, error: fetchErr } = await supabase
        .from("supply_materials")
        .select("id, image_urls, image_names")
        .eq("id", material_id.trim())
        .single();

      if (fetchErr || !existing) {
        return NextResponse.json({ error: "선택한 자재를 찾을 수 없습니다." }, { status: 400 });
      }

      const existingUrls = Array.isArray(existing.image_urls) ? existing.image_urls : [];
      const existingNames = Array.isArray(existing.image_names) ? existing.image_names : [];
      const newImageUrls = [...existingUrls, ...uploadedUrls];
      const newImageNames = [...existingNames, ...uploadedNames.map((n) => n || "")];

      const updatePayload: Record<string, unknown> = {
        description: trimmedDesc,
        brand: trimmedBrand,
        image_urls: newImageUrls,
      };
      if (newImageNames.some(Boolean)) {
        updatePayload.image_names = newImageNames;
      }

      const { error: updateErr } = await supabase
        .from("supply_materials")
        .update(updatePayload)
        .eq("id", material_id.trim());

      if (updateErr) {
        console.error("[material-crawl/save] Update error:", updateErr);
        return NextResponse.json({ error: "저장에 실패했습니다." }, { status: 500 });
      }
    } else {
      if (!Array.isArray(items) || items.length === 0) {
        return NextResponse.json({ error: "이미지를 1장 이상 선택해주세요." }, { status: 400 });
      }

      const uploadedUrls: string[] = [];
      const imageNames: string[] = [];
      const firstName = typeof items[0] === "object" && items[0]?.name
        ? String(items[0].name).trim().slice(0, 200) || "자재"
        : "자재";

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const imgUrl = typeof it === "object" && it?.imageUrl ? String(it.imageUrl).trim() : "";
        const name = typeof it === "object" && it?.name ? String(it.name).trim().slice(0, 200) || "" : "";
        if (!imgUrl) continue;

        const { url } = await fetchUploadImage(supabase, user.id, imgUrl, i);
        if (url) {
          uploadedUrls.push(url);
          imageNames.push(name || firstName);
        }
      }

      if (uploadedUrls.length === 0) {
        return NextResponse.json({ error: "이미지를 저장할 수 없습니다. URL을 확인해주세요." }, { status: 400 });
      }

      const { error: insertErr } = await supabase.from("supply_materials").insert({
        category_id,
        name: firstName,
        description: trimmedDesc,
        brand: trimmedBrand,
        image_urls: uploadedUrls,
        image_names: imageNames.length > 0 ? imageNames : null,
        thumbnail_index: 0,
      });

      if (insertErr) {
        console.error("[material-crawl/save] Insert error:", insertErr);
        return NextResponse.json({ error: "저장에 실패했습니다." }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[material-crawl/save]", e);
    return NextResponse.json({ error: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
