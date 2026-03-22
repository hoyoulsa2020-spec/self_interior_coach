"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { compressImage } from "@/lib/imageCompress";
import AlertModal from "@/components/AlertModal";
import ConfirmModal from "@/components/ConfirmModal";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type Category = { id: number; name: string };

type FormImageItem =
  | { id: string; type: "existing"; url: string }
  | { id: string; type: "new"; url: string; file: File };

type Material = {
  id: string;
  category_id: number;
  name: string;
  description: string | null;
  brand: string | null;
  image_urls: string[];
  image_names: string[] | null;
  thumbnail_index: number;
  sort_order: number;
  created_at: string;
  category?: { name: string };
};

const PAGE_SIZE = 24;
const STORAGE_KEY_SECTION_EXPANDED = "materials-section-expanded";

function MaterialViewModal({ material, onClose }: { material: Material; onClose: () => void }) {
  const [cur, setCur] = useState(material.thumbnail_index ?? 0);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const urls = material.image_urls ?? [];

  useEffect(() => {
    setCur(Math.min(material.thumbnail_index ?? 0, urls.length - 1));
  }, [material.id, material.thumbnail_index, urls.length]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setCur((c) => Math.min(c + 1, urls.length - 1));
      if (e.key === "ArrowLeft") setCur((c) => Math.max(c - 1, 0));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [urls.length, onClose]);

  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = () => {
    const diff = touchStartX.current - touchEndX.current;
    if (Math.abs(diff) > 50) {
      if (diff > 0) setCur((c) => Math.min(c + 1, urls.length - 1));
      else setCur((c) => Math.max(c - 1, 0));
    }
  };
  const handleTouchMove = (e: React.TouchEvent) => { touchEndX.current = e.touches[0].clientX; };

  const imageNames = material.image_names ?? [];
  const currentImageName = imageNames[cur]?.trim() || material.name;
  const displayName = [material.brand, currentImageName].filter(Boolean).join(" · ") || material.name;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black/95" onClick={onClose}>
      <div className="flex shrink-0 items-center justify-end border-b border-white/10 px-4 py-3">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="rounded-full p-2 text-white/80 transition hover:bg-white/10 hover:text-white"
          aria-label="닫기"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        <div
          className="relative flex flex-1 items-center justify-center px-4 py-4"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={(e) => e.stopPropagation()}
        >
          {urls.length > 0 && (
            <>
              {urls.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setCur((c) => Math.max(c - 1, 0)); }}
                    disabled={cur === 0}
                    className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2.5 text-white transition hover:bg-white/20 disabled:opacity-30 md:left-4"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setCur((c) => Math.min(c + 1, urls.length - 1)); }}
                    disabled={cur === urls.length - 1}
                    className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2.5 text-white transition hover:bg-white/20 disabled:opacity-30 md:right-4"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                </>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={urls[cur]}
                alt={material.name}
                className="max-h-[45vh] max-w-full rounded-lg object-contain md:max-h-[55vh]"
                draggable={false}
              />
              {urls.length > 1 && (
                <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs text-white/90">
                  {cur + 1} / {urls.length}
                </span>
              )}
            </>
          )}
        </div>

        <div className="shrink-0 px-4 py-4 text-center">
          <p className="text-base font-semibold text-white md:text-lg">
            {displayName}
          </p>
        </div>

        {material.description && (
          <div className="shrink-0 border-t border-white/10 bg-black/30 px-4 py-4 text-center">
            <p className="text-sm leading-relaxed text-white/90 whitespace-pre-line mx-auto max-w-2xl">
              {material.description}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function SortableMaterialCard({
  material,
  getThumbnailUrl,
  onEdit,
  onView,
  onDelete,
}: {
  material: Material;
  getThumbnailUrl: (m: Material) => string;
  onEdit: (m: Material) => void;
  onView: (m: Material) => void;
  onDelete: (m: Material) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: material.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md">
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="absolute left-2 top-2 z-10 flex h-8 w-8 cursor-grab items-center justify-center rounded-lg bg-white/90 text-gray-500 shadow-sm transition hover:bg-white hover:text-gray-700 active:cursor-grabbing"
        aria-label="순서 변경"
      >
        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
          <path d="M7 2a1 1 0 000 2h6a1 1 0 100-2H7zM7 8a1 1 0 000 2h6a1 1 0 100-2H7zM7 14a1 1 0 000 2h6a1 1 0 100-2H7z" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => onEdit(material)}
        className="block w-full text-left"
      >
        <div className="relative aspect-square overflow-hidden bg-gray-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={getThumbnailUrl(material)}
            alt={material.name}
            className="h-full w-full object-cover transition group-hover:scale-105"
          />
          {(material.image_urls?.length ?? 0) > 0 && (
            <span className="absolute right-2 top-2 flex h-7 min-w-[28px] items-center justify-center rounded-lg bg-black/70 px-2 text-xs font-semibold text-white shadow-sm">
              {(material.image_urls?.length ?? 0)}장
            </span>
          )}
        </div>
        <div className="p-3">
          <p className="truncate font-medium text-gray-800">
            {(material.image_names ?? [])[material.thumbnail_index ?? 0]?.trim() || material.name}
          </p>
          {material.category && (
            <p className="mt-0.5 truncate text-xs text-gray-500">{material.category.name}</p>
          )}
          {material.description && (
            <p className="mt-1 line-clamp-2 text-xs text-gray-500">{material.description}</p>
          )}
        </div>
      </button>
      <div className="flex gap-1 border-t border-gray-100 p-2">
        <button
          type="button"
          onClick={() => material.image_urls?.length && onView(material)}
          className="flex-1 min-h-[40px] rounded-lg py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 active:scale-[0.98] touch-manipulation sm:min-h-0 sm:py-1.5"
        >
          보기
        </button>
        <button
          type="button"
          onClick={() => onDelete(material)}
          className="min-h-[40px] rounded-lg px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 active:scale-[0.98] touch-manipulation sm:min-h-0 sm:py-1.5"
        >
          삭제
        </button>
      </div>
    </div>
  );
}

function SortableImageItem({
  item,
  isThumbnail,
  onSelectThumbnail,
  onRemove,
}: {
  item: FormImageItem;
  isThumbnail: boolean;
  onSelectThumbnail: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative">
      <button
        type="button"
        {...attributes}
        {...listeners}
        onClick={onSelectThumbnail}
        className={`block overflow-hidden rounded-lg border-2 touch-manipulation cursor-grab active:cursor-grabbing ${
          isThumbnail ? "border-indigo-500 ring-2 ring-indigo-200" : "border-gray-200"
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.url} alt="" className="h-14 w-14 object-cover sm:h-16 sm:w-16 pointer-events-none" draggable={false} />
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white"
      >
        ×
      </button>
    </div>
  );
}

export default function AdminMaterialsPage() {
  const [ready, setReady] = useState(false);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<number | "">("");
  const [currentPage, setCurrentPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [viewMaterial, setViewMaterial] = useState<Material | null>(null);
  const initializedRef = useRef(false);

  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCategoryId, setFormCategoryId] = useState<number | "">("");
  const [formImageItems, setFormImageItems] = useState<FormImageItem[]>([]);
  const [formThumbnailId, setFormThumbnailId] = useState<string | null>(null);
  const [formSaving, setFormSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [alertModal, setAlertModal] = useState<{ title?: string; message: string; variant?: "info" | "warning" | "error" | "success" } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ message: string; materialId: string } | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_SECTION_EXPANDED);
      const parsed = stored ? JSON.parse(stored) : null;
      if (Array.isArray(parsed) && parsed.length > 0) {
        setExpandedCategoryIds(new Set(parsed.map(Number)));
      }
    } catch { /* ignore */ }
  }, []);

  const toggleSectionExpand = useCallback((categoryId: number) => {
    setExpandedCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      try {
        localStorage.setItem(STORAGE_KEY_SECTION_EXPANDED, JSON.stringify([...next]));
      } catch { /* ignore */ }
      return next;
    });
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
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

  const fetchMaterials = useCallback(async () => {
    setIsLoading(true);
    const from = (currentPage - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const selectWithImageNames = "id, category_id, name, description, brand, image_urls, image_names, thumbnail_index, sort_order, created_at";
    const selectWithoutImageNames = "id, category_id, name, description, brand, image_urls, thumbnail_index, sort_order, created_at";

    const buildQuery = (cols: string) => {
      let q = supabase
        .from("supply_materials_ordered")
        .select(cols, { count: "exact" })
        .order("category_sort_order", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false })
        .range(from, to);
      if (categoryFilter !== "") q = q.eq("category_id", categoryFilter);
      if (appliedSearch.trim()) q = q.ilike("name", `%${appliedSearch.trim()}%`);
      return q;
    };

    let result = await buildQuery(selectWithImageNames);
    if (result.error?.message?.includes("image_names")) {
      result = await buildQuery(selectWithoutImageNames);
    }
    const { data, count, error } = result;
    if (error) console.error("자재 조회 오류:", error.message);

    const rows = (data ?? []) as unknown as Omit<Material, "category">[];
    const ids = rows.map((m) => m.category_id);
    const uniqueIds = [...new Set(ids)];
    const { data: catData } = await supabase
      .from("category")
      .select("id, name")
      .in("id", uniqueIds);
    const catMap = new Map((catData ?? []).map((c) => [c.id, c]));

    setMaterials(
      rows.map((m) => ({
        ...m,
        sort_order: m.sort_order ?? 0,
        category: catMap.get(m.category_id) as { name: string } | undefined,
      })) as Material[]
    );
    setTotalCount(count ?? 0);
    setIsLoading(false);
  }, [currentPage, appliedSearch, categoryFilter]);

  useEffect(() => {
    if (!ready) return;
    fetchMaterials();
  }, [ready, fetchMaterials]);

  const handleSearch = () => {
    setCurrentPage(1);
    setAppliedSearch(search);
  };

  const openCreateModal = () => {
    setEditingMaterial(null);
    setFormName("");
    setFormDescription("");
    setFormCategoryId(categories[0]?.id ?? "");
    setFormImageItems([]);
    setFormThumbnailId(null);
    setModalOpen(true);
  };

  const openEditModal = (m: Material) => {
    setEditingMaterial(m);
    setFormName(m.name);
    setFormDescription(m.description ?? "");
    setFormCategoryId(m.category_id);
    const urls = m.image_urls ?? [];
    const items: FormImageItem[] = urls.map((url, i) => ({
      id: `ex-${i}`,
      type: "existing",
      url,
    }));
    setFormImageItems(items);
    const thumbIdx = Math.min(m.thumbnail_index ?? 0, items.length - 1);
    setFormThumbnailId(items[thumbIdx]?.id ?? null);
    setModalOpen(true);
  };

  const addFiles = useCallback((files: File[]) => {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;
    setFormImageItems((prev) => {
      const capacity = 10 - prev.length;
      if (capacity <= 0) return prev;
      const newItems: FormImageItem[] = imageFiles.slice(0, capacity).map((file) => {
        const url = URL.createObjectURL(file);
        return {
          id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          type: "new",
          url,
          file,
        };
      });
      return [...prev, ...newItems];
    });
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    addFiles(Array.from(e.dataTransfer.files ?? []));
  }, [addFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes("Files")) {
      e.dataTransfer.dropEffect = "copy";
      setDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const removeImage = (id: string) => {
    const item = formImageItems.find((i) => i.id === id);
    if (item?.type === "new") URL.revokeObjectURL(item.url);
    setFormImageItems((prev) => prev.filter((i) => i.id !== id));
    if (formThumbnailId === id) {
      const remaining = formImageItems.filter((i) => i.id !== id);
      setFormThumbnailId(remaining[0]?.id ?? null);
    }
  };

  const handleFormDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = formImageItems.findIndex((i) => i.id === active.id);
    const newIndex = formImageItems.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    setFormImageItems((prev) => arrayMove(prev, oldIndex, newIndex));
  };

  const handleGalleryDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = materials.findIndex((m) => m.id === active.id);
    const newIndex = materials.findIndex((m) => m.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(materials, oldIndex, newIndex);
    setMaterials(reordered);
    const sortOrders = [...reordered.map((m) => m.sort_order)].sort((a, b) => a - b);
    setSavingOrder(true);
    try {
      await Promise.all(
        reordered.map((m, idx) =>
          supabase.from("supply_materials").update({ sort_order: sortOrders[idx] }).eq("id", m.id)
        )
      );
    } catch (e) {
      console.error("순서 저장 오류:", e);
      fetchMaterials();
    } finally {
      setSavingOrder(false);
    }
  };

  const saveMaterial = async () => {
    if (!formName.trim()) {
      setAlertModal({ message: "자재명을 입력하세요.", variant: "warning" });
      return;
    }
    if (formCategoryId === "") {
      setAlertModal({ message: "대공정을 선택하세요.", variant: "warning" });
      return;
    }
    if (formImageItems.length === 0) {
      setAlertModal({ message: "이미지를 1장 이상 등록하세요.", variant: "warning" });
      return;
    }
    setFormSaving(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const adminId = sessionData.session?.user.id;
    if (!adminId) {
      setFormSaving(false);
      return;
    }

    const imageUrls: string[] = [];
    for (const item of formImageItems) {
      if (item.type === "existing") {
        imageUrls.push(item.url);
      } else {
        const blob = await compressImage(item.file);
        const path = `materials/${adminId}/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
        const { error: upErr } = await supabase.storage.from("material-images").upload(path, blob, { contentType: "image/jpeg" });
        if (upErr) {
          console.error("이미지 업로드 오류:", upErr);
          setFormSaving(false);
          return;
        }
        const { data: urlData } = supabase.storage.from("material-images").getPublicUrl(path);
        imageUrls.push(urlData.publicUrl);
      }
    }

    const thumbIdx = formThumbnailId
      ? formImageItems.findIndex((i) => i.id === formThumbnailId)
      : 0;
    const safeThumbIdx = Math.max(0, Math.min(thumbIdx, imageUrls.length - 1));

    const payload = {
      category_id: formCategoryId,
      name: formName.trim(),
      description: formDescription.trim() || null,
      image_urls: imageUrls,
      thumbnail_index: safeThumbIdx,
      updated_at: new Date().toISOString(),
    };

    if (editingMaterial) {
      const { error } = await supabase.from("supply_materials").update(payload).eq("id", editingMaterial.id);
      if (error) {
        console.error("수정 오류:", error);
        setFormSaving(false);
        return;
      }
    } else {
      const { error } = await supabase.from("supply_materials").insert(payload);
      if (error) {
        console.error("등록 오류:", error);
        setFormSaving(false);
        return;
      }
    }

    setModalOpen(false);
    setFormSaving(false);
    fetchMaterials();
  };

  const openDeleteConfirm = (id: string) => {
    setConfirmModal({ message: "이 자재를 삭제하시겠습니까?", materialId: id });
  };

  const executeDelete = async () => {
    if (!confirmModal) return;
    const { materialId } = confirmModal;
    setConfirmModal(null);
    const { error } = await supabase.from("supply_materials").delete().eq("id", materialId);
    if (!error) fetchMaterials();
  };

  const getThumbnailUrl = (m: Material) => {
    const urls = m.image_urls ?? [];
    const idx = Math.min(m.thumbnail_index ?? 0, urls.length - 1);
    return urls[idx] ?? "/placeholder.svg";
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">자재창고</h1>
          <p className="mt-0.5 text-sm text-gray-500">대공정별 자재를 등록하고 관리합니다.</p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700"
        >
          자재 등록
        </button>
      </div>

      {/* 검색 및 필터 - 모바일: 세로 배치, PC: 가로 배치 */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
        <div className="flex gap-2 sm:flex-initial">
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value === "" ? "" : Number(e.target.value));
              setCurrentPage(1);
            }}
            className="min-h-[44px] flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400 sm:min-h-0 sm:flex-initial"
          >
            <option value="">전체 대공정</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="자재명 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="min-h-[44px] flex-1 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm outline-none placeholder:text-gray-400 focus:border-indigo-400 sm:min-h-0 sm:w-64"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSearch}
            className="min-h-[44px] flex-1 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700 active:scale-[0.98] sm:min-h-0 sm:flex-initial"
          >
            검색
          </button>
          {appliedSearch && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setAppliedSearch("");
                setCurrentPage(1);
              }}
              className="min-h-[44px] rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-500 hover:bg-gray-50 active:scale-[0.98] sm:min-h-0"
            >
              초기화
            </button>
          )}
          <span className="flex min-h-[44px] items-center shrink-0 text-xs text-gray-400 sm:min-h-0 sm:ml-auto">
            총 {totalCount}개
          </span>
        </div>
      </div>

      {/* 갤러리 */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        </div>
      ) : materials.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white py-20 text-center text-sm text-gray-400">
          {appliedSearch || categoryFilter !== "" ? "검색 결과가 없습니다." : "등록된 자재가 없습니다. 자재 등록 버튼을 눌러 추가하세요."}
        </div>
      ) : (
        <div className="relative">
          <p className="mb-3 text-xs text-gray-500">대공정별로 정렬됩니다. 카드 왼쪽 상단의 ⋮⋮ 아이콘을 드래그하여 순서를 변경할 수 있습니다.</p>
          {savingOrder && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/80">
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            </div>
          )}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleGalleryDragEnd}>
            <SortableContext items={materials.map((m) => m.id)} strategy={rectSortingStrategy}>
              <div className="space-y-8">
                {(() => {
                  const groups: { categoryId: number; categoryName: string; items: Material[] }[] = [];
                  let current: { categoryId: number; categoryName: string; items: Material[] } | null = null;
                  for (const m of materials) {
                    if (!current || current.categoryId !== m.category_id) {
                      current = {
                        categoryId: m.category_id,
                        categoryName: m.category?.name ?? `대공정 #${m.category_id}`,
                        items: [],
                      };
                      groups.push(current);
                    }
                    current.items.push(m);
                  }
                  return groups.map((g) => {
                    const isExpanded = expandedCategoryIds.has(g.categoryId);
                    return (
                      <div key={g.categoryId} className="space-y-3">
                        <button
                          type="button"
                          onClick={() => toggleSectionExpand(g.categoryId)}
                          className="flex w-full items-center justify-between gap-2 border-b border-gray-200 pb-2 text-left hover:bg-gray-50/50 -mx-1 px-1 rounded-lg transition"
                        >
                          <h3 className="text-sm font-semibold text-gray-600">
                            {g.categoryName}
                            <span className="ml-1.5 font-normal text-gray-400">({g.items.length}개)</span>
                          </h3>
                          <span className="shrink-0 text-xs text-gray-500">
                            {isExpanded ? "접기" : "펼치기"}
                          </span>
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            className={`shrink-0 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          >
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </button>
                        {isExpanded && (
                          <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                            {g.items.map((m) => (
                              <SortableMaterialCard
                                key={m.id}
                                material={m}
                                getThumbnailUrl={getThumbnailUrl}
                                onEdit={openEditModal}
                                onView={setViewMaterial}
                                onDelete={(mat) => openDeleteConfirm(mat.id)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}

      {/* 페이징 - 모바일 터치 영역 확대 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 py-2">
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="min-h-[44px] min-w-[80px] rounded-xl border border-gray-200 px-4 py-2.5 text-sm disabled:opacity-50 active:scale-[0.98] touch-manipulation sm:min-h-0 sm:min-w-0 sm:rounded-lg sm:py-1.5"
          >
            이전
          </button>
          <span className="min-w-[60px] text-center text-sm text-gray-600">
            {currentPage} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="min-h-[44px] min-w-[80px] rounded-xl border border-gray-200 px-4 py-2.5 text-sm disabled:opacity-50 active:scale-[0.98] touch-manipulation sm:min-h-0 sm:min-w-0 sm:rounded-lg sm:py-1.5"
          >
            다음
          </button>
        </div>
      )}

      {/* 등록/수정 모달 - 모바일: 전체화면, PC: 중앙 팝업 */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={() => setModalOpen(false)}>
          <div
            className="relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-w-lg sm:rounded-2xl sm:max-h-[85vh]"
            style={{ maxHeight: "min(90vh, calc(100svh - 2rem))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-1 overflow-y-auto overscroll-contain p-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:p-6">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white pb-4 -mt-1 pt-1 sm:static sm:border-0 sm:pb-0 sm:pt-0">
              <h3 className="text-lg font-semibold text-gray-800">{editingMaterial ? "자재 수정" : "자재 등록"}</h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 sm:hidden"
                aria-label="닫기"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">대공정</label>
                <select
                  value={formCategoryId}
                  onChange={(e) => setFormCategoryId(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400"
                >
                  <option value="">선택</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">자재명</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="자재명 입력"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">설명</label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="자재 설명 (선택)"
                  rows={3}
                  className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  이미지 (여러 장) · 썸네일 지정
                </label>
                <p className="mb-2 text-[11px] text-gray-400">
                  썸네일로 사용할 이미지를 클릭하여 지정하세요. 드래그로 순서 변경 가능.
                </p>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleFormDragEnd}>
                  <SortableContext items={formImageItems.map((i) => i.id)} strategy={rectSortingStrategy}>
                    <div
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      className={`flex flex-wrap items-center gap-3 rounded-xl border-2 border-dashed p-4 transition min-h-[100px] ${
                        dragOver
                          ? "border-indigo-500 bg-indigo-50"
                          : "border-gray-200 bg-gray-50/30"
                      }`}
                    >
                      {formImageItems.map((item) => (
                        <SortableImageItem
                          key={item.id}
                          item={item}
                          isThumbnail={formThumbnailId === item.id}
                          onSelectThumbnail={() => setFormThumbnailId(item.id)}
                          onRemove={() => removeImage(item.id)}
                        />
                      ))}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={handleFileChange}
                      />
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                        className="flex h-[72px] w-24 shrink-0 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-gray-300 bg-white text-gray-400 transition hover:border-indigo-400 hover:bg-indigo-50/30 hover:text-indigo-500 active:scale-[0.98] touch-manipulation"
                      >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                          <line x1="12" y1="5" x2="12" y2="19" />
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        <span className="text-center text-[10px] leading-tight whitespace-nowrap">클릭 또는 드롭</span>
                      </div>
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            </div>
            </div>

            <div className="shrink-0 border-t border-gray-100 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-6">
              <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="min-h-[48px] flex-1 rounded-xl border border-gray-200 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 active:scale-[0.98] touch-manipulation sm:min-h-0 sm:py-2.5"
              >
                취소
              </button>
              <button
                type="button"
                onClick={saveMaterial}
                disabled={formSaving}
                className="min-h-[48px] flex-1 rounded-xl bg-indigo-600 py-3 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 active:scale-[0.98] touch-manipulation sm:min-h-0 sm:py-2.5"
              >
                {formSaving ? "저장 중..." : editingMaterial ? "수정" : "등록"}
              </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {viewMaterial && (
        <MaterialViewModal
          material={viewMaterial}
          onClose={() => setViewMaterial(null)}
        />
      )}

      {alertModal && (
        <AlertModal
          title={alertModal.title}
          message={alertModal.message}
          variant={alertModal.variant}
          onClose={() => setAlertModal(null)}
        />
      )}
      {confirmModal && (
        <ConfirmModal
          title="자재 삭제"
          message={confirmModal.message}
          confirmLabel="삭제"
          cancelLabel="취소"
          variant="danger"
          onConfirm={executeDelete}
          onCancel={() => setConfirmModal(null)}
        />
      )}
    </div>
  );
}
