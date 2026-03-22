"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import AlertModal from "@/components/AlertModal";

type CrawlItem = {
  imageUrl: string;
  name: string;
};

type Category = { id: number; name: string };

type ExistingMaterial = { id: string; name: string; description: string | null; brand: string | null };

const STORAGE_KEY_LAST_SAVE = "material-crawl-last-save";

export default function AdminMaterialCrawlPage() {
  const [ready, setReady] = useState(false);
  const [url, setUrl] = useState("");
  const [items, setItems] = useState<CrawlItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewImage, setViewImage] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [saveBrand, setSaveBrand] = useState("");
  const [saveDescription, setSaveDescription] = useState("");
  const [saveCategoryId, setSaveCategoryId] = useState<number | "">("");
  const [saveTargetMaterialId, setSaveTargetMaterialId] = useState<string | "">("");
  const [existingMaterials, setExistingMaterials] = useState<ExistingMaterial[]>([]);
  const [existingMaterialsLoading, setExistingMaterialsLoading] = useState(false);
  const [saveSaving, setSaveSaving] = useState(false);
  const [alertModal, setAlertModal] = useState<{ message: string; variant?: "info" | "warning" | "error" | "success" } | null>(null);
  const [dragRect, setDragRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const skipNextClickRef = useRef(false);
  const dragRectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  const getItemsInRect = useCallback((r: { x: number; y: number; w: number; h: number }) => {
    const indices: number[] = [];
    gridRef.current?.querySelectorAll("[data-crawl-index]").forEach((el) => {
      const idx = parseInt((el as HTMLElement).dataset.crawlIndex ?? "-1", 10);
      if (idx < 0) return;
      const rect = el.getBoundingClientRect();
      const rx = Math.min(r.x, r.x + r.w);
      const rw = Math.abs(r.w);
      const ry = Math.min(r.y, r.y + r.h);
      const rh = Math.abs(r.h);
      if (rect.right >= rx && rect.left <= rx + rw && rect.bottom >= ry && rect.top <= ry + rh) {
        indices.push(idx);
      }
    });
    return indices;
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!dragStartRef.current) return;
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
      const dx = Math.abs(clientX - dragStartRef.current.x);
      const dy = Math.abs(clientY - dragStartRef.current.y);
      if (dx > 5 || dy > 5) dragStartRef.current.moved = true;
      if (dragStartRef.current.moved) {
        const rect = {
          x: Math.min(dragStartRef.current.x, clientX),
          y: Math.min(dragStartRef.current.y, clientY),
          w: clientX - dragStartRef.current.x,
          h: clientY - dragStartRef.current.y,
        };
        dragRectRef.current = rect;
        setDragRect(rect);
      }
    };
    const onUp = () => {
      if (!dragStartRef.current) return;
      const wasDrag = dragStartRef.current.moved;
      const rect = dragRectRef.current;
      dragStartRef.current = null;
      dragRectRef.current = null;
      setDragRect(null);

      if (wasDrag && rect && gridRef.current) {
        const indices = getItemsInRect(rect);
        if (indices.length > 0) {
          setSelected((prev) => {
            const next = new Set(prev);
            indices.forEach((i) => next.add(i));
            return next;
          });
        }
        skipNextClickRef.current = true;
      }
    };

    document.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onUp);
    };
  }, [getItemsInRect]);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        window.location.href = "/login";
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", data.session.user.id)
        .maybeSingle();
      if (profile?.role !== "admin" && profile?.role !== "super_admin") {
        window.location.href = "/login";
        return;
      }
      const { data: catData } = await supabase
        .from("category")
        .select("id, name")
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true });
      setCategories((catData ?? []) as Category[]);
      setReady(true);
    };
    init();
  }, []);

  const toggleSelect = (i: number) => {
    if (skipNextClickRef.current) {
      skipNextClickRef.current = false;
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const handleGridMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    dragStartRef.current = { x: e.clientX, y: e.clientY, moved: false };
  };
  const handleGridTouchStart = (e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    dragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, moved: false };
  };
  const handleGridClick = (e: React.MouseEvent) => {
    if (skipNextClickRef.current) {
      e.stopPropagation();
      skipNextClickRef.current = false;
    }
  };

  const openSaveModal = () => {
    const selectedItems = [...selected].sort((a, b) => a - b).map((i) => items[i]);
    if (selectedItems.length === 0) return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY_LAST_SAVE);
      const parsed = stored ? JSON.parse(stored) : null;
      setSaveBrand(parsed?.brand ?? "");
      setSaveDescription(parsed?.description ?? "");
      const lastCategoryId = parsed?.category_id;
      const validCategoryId = lastCategoryId != null && categories.some((c) => c.id === lastCategoryId)
        ? lastCategoryId
        : categories[0]?.id ?? "";
      setSaveCategoryId(validCategoryId);
    } catch {
      setSaveBrand("");
      setSaveDescription("");
      setSaveCategoryId(categories[0]?.id ?? "");
    }
    setSaveTargetMaterialId("");
    setExistingMaterials([]);
    setSaveModalOpen(true);
  };

  useEffect(() => {
    if (!saveModalOpen || !saveCategoryId) {
      setExistingMaterials([]);
      return;
    }
    const load = async () => {
      setExistingMaterialsLoading(true);
      const { data } = await supabase
        .from("supply_materials")
        .select("id, name, description, brand")
        .eq("category_id", saveCategoryId)
        .order("created_at", { ascending: false });
      setExistingMaterials((data ?? []) as ExistingMaterial[]);
      setExistingMaterialsLoading(false);
    };
    load();
  }, [saveModalOpen, saveCategoryId]);

  const closeSaveModal = (clearSelection = false) => {
    setSaveModalOpen(false);
    if (clearSelection) setSelected(new Set());
  };

  const handleSaveToWarehouse = async () => {
    if (saveCategoryId === "") {
      setAlertModal({ message: "대공정을 선택해주세요.", variant: "warning" });
      return;
    }
    const selectedItems = [...selected].sort((a, b) => a - b).map((i) => items[i]);
    if (selectedItems.length === 0) {
      setAlertModal({ message: "이미지를 선택해주세요.", variant: "warning" });
      return;
    }

    const hasValidNames = selectedItems.some((it) => it.name?.trim());
    if (!hasValidNames && selectedItems.length > 0) {
      setAlertModal({ message: "크롤링된 자재명이 없습니다.", variant: "warning" });
      return;
    }

    setSaveSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setAlertModal({ message: "로그인이 필요합니다.", variant: "error" });
        setSaveSaving(false);
        return;
      }

      const payload = saveTargetMaterialId
        ? {
            material_id: saveTargetMaterialId,
            items: selectedItems.map((it) => ({ imageUrl: it.imageUrl, name: it.name?.trim() || "" })),
            description: saveDescription.trim() || null,
            brand: saveBrand.trim() || null,
            category_id: saveCategoryId,
          }
        : {
            items: selectedItems.map((it) => ({ imageUrl: it.imageUrl, name: it.name?.trim() || "자재" })),
            description: saveDescription.trim() || null,
            brand: saveBrand.trim() || null,
            category_id: saveCategoryId,
          };

      const res = await fetch("/api/material-crawl/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setAlertModal({ message: data.error || "저장에 실패했습니다.", variant: "error" });
        setSaveSaving(false);
        return;
      }

      try {
        localStorage.setItem(STORAGE_KEY_LAST_SAVE, JSON.stringify({
          brand: saveBrand.trim() || "",
          description: saveDescription.trim() || "",
          category_id: saveCategoryId,
        }));
      } catch { /* ignore */ }
      setAlertModal({ message: "자재창고에 저장되었습니다.", variant: "success" });
      closeSaveModal(true);
    } catch (e) {
      console.error(e);
      setAlertModal({ message: "저장 중 오류가 발생했습니다.", variant: "error" });
    } finally {
      setSaveSaving(false);
    }
  };

  const handleCrawl = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      setError("사이트 주소를 입력해주세요.");
      return;
    }
    setError(null);
    setLoading(true);
    setItems([]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError("로그인이 필요합니다.");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/material-crawl", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ url: trimmed }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "크롤링에 실패했습니다.");
        setLoading(false);
        return;
      }

      setItems(data.items ?? []);
    } catch (e) {
      console.error(e);
      setError("크롤링 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  if (!ready) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <span className="text-gray-500">로딩 중...</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-800">자재 크롤링</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          사이트 URL을 입력하면 해당 페이지에서 자재 이미지와 이름을 수집합니다.
        </p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCrawl()}
            placeholder="https://example.com/products"
            className="min-h-[44px] flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none placeholder:text-gray-400 focus:border-indigo-400 sm:min-h-0"
          />
          <button
            type="button"
            onClick={handleCrawl}
            disabled={loading}
            className="min-h-[44px] shrink-0 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50 sm:min-h-0"
          >
            {loading ? "크롤링 중..." : "크롤링 시작"}
          </button>
        </div>

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}

        {items.length > 0 && (
          <p className="mt-3 text-sm text-gray-500">
            {items.length}개의 자재를 찾았습니다.
          </p>
        )}
      </div>

      {items.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-700">크롤링 결과</h2>
            {selected.size > 0 && (
              <button
                type="button"
                onClick={openSaveModal}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
              >
                자재창고 보내기 ({selected.size}개)
              </button>
            )}
          </div>
          <div
            ref={gridRef}
            className="relative grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
            onMouseDown={handleGridMouseDown}
            onTouchStart={handleGridTouchStart}
            onClick={handleGridClick}
          >
            {dragRect && (
              <div
                className="pointer-events-none fixed z-50 border-2 border-indigo-500 bg-indigo-500/20"
                style={{
                  left: dragRect.x,
                  top: dragRect.y,
                  width: Math.abs(dragRect.w),
                  height: Math.abs(dragRect.h),
                }}
              />
            )}
            {items.map((item, i) => (
              <div
                key={`${item.imageUrl}-${i}`}
                data-crawl-index={i}
                className={`overflow-hidden rounded-xl border-2 bg-white shadow-sm transition hover:shadow-md ${
                  selected.has(i) ? "border-indigo-500 ring-2 ring-indigo-200" : "border-gray-200"
                }`}
              >
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => toggleSelect(i)}
                    className="block w-full text-left"
                  >
                    <div className="aspect-square overflow-hidden bg-gray-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="h-full w-full object-cover transition hover:scale-105"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' fill='%23ddd'%3E%3Crect width='100' height='100'/%3E%3Ctext x='50' y='50' dominant-baseline='middle' text-anchor='middle' fill='%23999' font-size='12'%3E오류%3C/text%3E%3C/svg%3E";
                        }}
                      />
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setViewImage(item.imageUrl); }}
                    className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md bg-black/50 text-white transition hover:bg-black/70"
                    aria-label="크게 보기"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); toggleSelect(i); }}
                    className={`absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-md border-2 transition ${
                      selected.has(i)
                        ? "border-indigo-600 bg-indigo-600 text-white"
                        : "border-white bg-white/90 text-transparent hover:bg-gray-100 hover:text-gray-400"
                    }`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M5 12l5 5L20 7" />
                    </svg>
                  </button>
                </div>
                <div className="p-3">
                  <p className="line-clamp-2 text-sm font-medium text-gray-800">{item.name}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {saveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
          <div
            className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h3 className="text-lg font-semibold text-gray-800">자재창고에 저장</h3>
              <button type="button" onClick={() => closeSaveModal()} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <p className="text-xs text-gray-500">
                {saveTargetMaterialId ? "선택된 이미지를 기존 자재에 추가합니다" : "선택한 이미지가 한 개 자재로 합쳐져 등록됩니다. 보기에서 이미지 넘기며 자재명 확인 가능"}
              </p>
              <div className="flex flex-wrap gap-2">
                {[...selected].sort((a, b) => a - b).map((i) => (
                  <div key={i} className="flex flex-col">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-gray-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={items[i].imageUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    {!saveTargetMaterialId && (
                      <p className="mt-1 max-w-[72px] truncate text-[10px] text-gray-500" title={items[i].name}>
                        {items[i].name || "-"}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">대공정 *</label>
                <select
                  value={saveCategoryId}
                  onChange={(e) => {
                    setSaveCategoryId(e.target.value === "" ? "" : Number(e.target.value));
                    setSaveTargetMaterialId("");
                  }}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
                >
                  <option value="">선택</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              {saveCategoryId !== "" && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">저장할 위치</label>
                  <div className="space-y-2">
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        name="saveTarget"
                        checked={saveTargetMaterialId === ""}
                        onChange={() => {
                          setSaveTargetMaterialId("");
                          setSaveDescription("");
                        }}
                        className="h-4 w-4"
                      />
                      <span className="text-sm">새로 등록</span>
                    </label>
                    <label className={`flex items-center gap-2 ${existingMaterials.length === 0 ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
                      <input
                        type="radio"
                        name="saveTarget"
                        checked={saveTargetMaterialId !== ""}
                        disabled={existingMaterials.length === 0}
                        onChange={() => {
                          const first = existingMaterials[0];
                          if (first) {
                            setSaveTargetMaterialId(first.id);
                            setSaveBrand(first.brand ?? "");
                            setSaveDescription(first.description ?? "");
                          }
                        }}
                        className="h-4 w-4"
                      />
                      <span className="text-sm">기존 자재에 추가 {existingMaterials.length > 0 && `(${existingMaterials.length}개)`}</span>
                    </label>
                    {saveTargetMaterialId !== "" && (
                      <select
                        value={saveTargetMaterialId}
                        onChange={(e) => {
                          const id = e.target.value;
                          setSaveTargetMaterialId(id);
                          const m = existingMaterials.find((x) => x.id === id);
                          if (m) {
                            setSaveBrand(m.brand ?? "");
                            setSaveDescription(m.description ?? "");
                          }
                        }}
                        className="ml-6 mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
                      >
                        {existingMaterialsLoading ? (
                          <option>로딩 중...</option>
                        ) : existingMaterials.length === 0 ? (
                          <option value="">해당 대공정에 등록된 자재 없음</option>
                        ) : (
                          existingMaterials.map((m) => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))
                        )}
                      </select>
                    )}
                  </div>
                </div>
              )}
              {saveTargetMaterialId !== "" && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">기존 자재명</label>
                  <p className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700">
                    {existingMaterials.find((m) => m.id === saveTargetMaterialId)?.name ?? "-"}
                  </p>
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">브랜드명 (선택)</label>
                <input
                  type="text"
                  value={saveBrand}
                  onChange={(e) => setSaveBrand(e.target.value)}
                  placeholder="브랜드명 입력"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">자재 설명 (선택)</label>
                <textarea
                  value={saveDescription}
                  onChange={(e) => setSaveDescription(e.target.value)}
                  placeholder="자재 설명"
                  rows={3}
                  className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
                />
              </div>
            </div>
            <div className="flex gap-2 border-t border-gray-100 p-4">
              <button
                type="button"
                onClick={() => closeSaveModal()}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveToWarehouse}
                disabled={saveSaving}
                className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {saveSaving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      {alertModal && (
        <AlertModal
          message={alertModal.message}
          variant={alertModal.variant}
          onClose={() => setAlertModal(null)}
        />
      )}

      {viewImage && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90"
          onClick={() => setViewImage(null)}
        >
          <button
            type="button"
            onClick={() => setViewImage(null)}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20"
            aria-label="닫기"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={viewImage}
            alt=""
            className="max-h-[90vh] max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
            referrerPolicy="no-referrer"
          />
        </div>
      )}
    </div>
  );
}
