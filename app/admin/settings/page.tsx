"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import AlertModal from "@/components/AlertModal";
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
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type CategoryRow = {
  id: number;
  name: string;
  sort_order: number;
};

type ProcessRow = {
  id: string;
  category_id: number;
  name: string;
  sort_order: number;
};

type UserRow = {
  user_id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  created_at: string;
};

const ROLES = [
  { value: "consumer", label: "개인고객", color: "bg-blue-50 text-blue-700" },
  { value: "admin", label: "관리자", color: "bg-orange-50 text-orange-700" },
  { value: "super_admin", label: "최고관리자", color: "bg-red-50 text-red-700" },
];

const PAGE_SIZE_OPTIONS = [10, 20, 30];

function RoleBadge({ role }: { role: string }) {
  const found = ROLES.find((r) => r.value === role);
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${found?.color ?? "bg-gray-100 text-gray-500"}`}>
      {found?.label ?? role}
    </span>
  );
}

function SortableCategoryItem({
  cat,
  idx,
  editingCat,
  setEditingCat,
  setCatError,
  saveEditCategory,
  deletingCatId,
  deleteCategory,
  onProcessClick,
  refreshTrigger,
}: {
  cat: CategoryRow;
  idx: number;
  editingCat: { id: number; name: string } | null;
  setEditingCat: (v: { id: number; name: string } | null) => void;
  setCatError: (v: string | null) => void;
  saveEditCategory: () => void;
  deletingCatId: number | null;
  deleteCategory: (id: number) => void;
  onProcessClick: (cat: CategoryRow) => void;
  refreshTrigger?: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: String(cat.id) });

  const [expanded, setExpanded] = useState(false);
  const [processes, setProcesses] = useState<ProcessRow[]>([]);
  const [loadingProc, setLoadingProc] = useState(false);
  const [deletingProcId, setDeletingProcId] = useState<string | null>(null);

  useEffect(() => {
    if (refreshTrigger !== undefined && expanded) {
      loadProcesses();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);

  const loadProcesses = async () => {
    setLoadingProc(true);
    const { data } = await supabase
      .from("process")
      .select("id, category_id, name, sort_order")
      .eq("category_id", cat.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    setProcesses(data ?? []);
    setLoadingProc(false);
  };

  const toggleExpand = async () => {
    if (!expanded && processes.length === 0) {
      await loadProcesses();
    }
    setExpanded((v) => !v);
  };

  const deleteProcess = async (id: string) => {
    setDeletingProcId(id);
    await supabase.from("process").delete().eq("id", id);
    setProcesses((prev) => prev.filter((p) => p.id !== id));
    setDeletingProcId(null);
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li ref={setNodeRef} style={style}>
      {/* 메인 행 */}
      <div className="flex items-center gap-3 py-2.5">
        {/* 드래그 핸들 */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none text-gray-300 hover:text-gray-500 active:cursor-grabbing"
          aria-label="순서 변경"
        >
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M7 2a1 1 0 000 2h6a1 1 0 100-2H7zM7 8a1 1 0 000 2h6a1 1 0 100-2H7zM7 14a1 1 0 000 2h6a1 1 0 100-2H7z" />
          </svg>
        </button>

        <span className="w-5 text-center text-xs text-gray-400">{idx + 1}</span>

        {editingCat?.id === cat.id ? (
          <>
            <input
              type="text"
              value={editingCat.name}
              onChange={(e) => setEditingCat({ ...editingCat, name: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && saveEditCategory()}
              autoFocus
              className="flex-1 rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-100"
            />
            <button
              type="button"
              onClick={saveEditCategory}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
            >
              저장
            </button>
            <button
              type="button"
              onClick={() => { setEditingCat(null); setCatError(null); }}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
            >
              취소
            </button>
          </>
        ) : (
          <>
            {/* 클릭 시 공정 펼침 */}
            <button
              type="button"
              onClick={toggleExpand}
              className="flex flex-1 items-center gap-1.5 text-left"
            >
              <span className="text-sm font-medium text-gray-800 hover:text-indigo-600">{cat.name}</span>
              <svg
                className={`h-3.5 w-3.5 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => onProcessClick(cat)}
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100"
            >
              공정등록
            </button>
            <button
              type="button"
              onClick={() => { setEditingCat({ id: cat.id, name: cat.name }); setCatError(null); }}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 transition hover:bg-gray-50"
            >
              수정
            </button>
            <button
              type="button"
              disabled={deletingCatId === cat.id}
              onClick={() => deleteCategory(cat.id)}
              className="rounded-lg border border-red-100 px-3 py-1.5 text-xs text-red-500 transition hover:bg-red-50 disabled:opacity-40"
            >
              {deletingCatId === cat.id ? "삭제 중..." : "삭제"}
            </button>
          </>
        )}
      </div>

      {/* 공정 목록 (펼침) */}
      {expanded && (
        <div className="mb-2 ml-12 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
          {loadingProc ? (
            <div className="flex justify-center py-3">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
            </div>
          ) : processes.length === 0 ? (
            <p className="py-2 text-center text-xs text-gray-400">등록된 공정이 없습니다.</p>
          ) : (
            <ul className="space-y-0.5">
              {processes.map((p, i) => (
                <li key={p.id} className="flex items-center gap-2 py-1">
                  <span className="text-xs text-gray-400">{i + 1}.</span>
                  <span className="flex-1 text-xs text-gray-700">{p.name}</span>
                  <button
                    type="button"
                    disabled={deletingProcId === p.id}
                    onClick={() => deleteProcess(p.id)}
                    className="shrink-0 rounded p-0.5 text-gray-300 transition hover:text-red-500 disabled:opacity-40"
                  >
                    {deletingProcId === p.id ? (
                      <span className="h-3 w-3 animate-spin rounded-full border border-gray-400 border-t-transparent inline-block" />
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

/* ── 공정 관리 모달 ── */
function ProcessModal({
  category,
  onClose,
}: {
  category: CategoryRow;
  onClose: (catId?: number) => void;
}) {
  const [processes, setProcesses] = useState<ProcessRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [inputs, setInputs] = useState<string[]>([""]);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchProcesses = useCallback(async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from("process")
      .select("id, category_id, name, sort_order")
      .eq("category_id", category.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    setProcesses(data ?? []);
    setIsLoading(false);
  }, [category.id]);

  useEffect(() => { fetchProcesses(); }, [fetchProcesses]);

  const addInput = () => setInputs((prev) => [...prev, ""]);
  const updateInput = (idx: number, val: string) =>
    setInputs((prev) => prev.map((v, i) => (i === idx ? val : v)));
  const removeInput = (idx: number) =>
    setInputs((prev) => prev.filter((_, i) => i !== idx));

  const save = async () => {
    const names = inputs.map((v) => v.trim()).filter(Boolean);
    if (names.length === 0) return;
    setError(null);
    setIsSaving(true);

    const maxOrder = processes.reduce((m, p) => Math.max(m, p.sort_order ?? 0), 0);
    const rows = names.map((name, i) => ({
      category_id: category.id,
      name,
      sort_order: maxOrder + i + 1,
    }));

    const { error: insertError } = await supabase.from("process").insert(rows);
    if (insertError) {
      setError(insertError.message);
    } else {
      setInputs([""]);
      await fetchProcesses();
    }
    setIsSaving(false);
  };

  const deleteProcess = async (id: string) => {
    setDeletingId(id);
    await supabase.from("process").delete().eq("id", id);
    await fetchProcesses();
    setDeletingId(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="flex w-full max-w-md flex-col rounded-2xl bg-white shadow-xl" style={{ maxHeight: "85vh" }}>
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">공정 등록</h3>
            <p className="text-xs text-gray-400">{category.name} 카테고리의 공정 목록</p>
          </div>
          <button
            type="button"
            onClick={() => onClose(category.id)}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* 기존 공정 목록 */}
          <div>
            <p className="mb-2 text-xs font-medium text-gray-500">등록된 공정</p>
            {isLoading ? (
              <div className="flex justify-center py-6">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
              </div>
            ) : processes.length === 0 ? (
              <p className="py-4 text-center text-xs text-gray-400">등록된 공정이 없습니다.</p>
            ) : (
              <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100">
                {processes.map((p, i) => (
                  <li key={p.id} className="flex items-center gap-2 px-3 py-2.5">
                    <span className="w-5 text-center text-xs text-gray-400">{i + 1}</span>
                    <span className="flex-1 text-sm text-gray-800">{p.name}</span>
                    <button
                      type="button"
                      disabled={deletingId === p.id}
                      onClick={() => deleteProcess(p.id)}
                      className="rounded-lg p-1 text-gray-300 hover:text-red-500 disabled:opacity-40"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 새 공정 입력 */}
          <div>
            <p className="mb-2 text-xs font-medium text-gray-500">새 공정 추가</p>
            {error && (
              <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
            )}
            <div className="space-y-2">
              {inputs.map((val, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder={`공정명 입력 (예: 1차 철거)`}
                    value={val}
                    onChange={(e) => updateInput(idx, e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && idx === inputs.length - 1 && addInput()}
                    className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none placeholder:text-gray-400 focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                  />
                  {inputs.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeInput(idx)}
                      className="shrink-0 rounded-lg p-1.5 text-gray-300 hover:text-red-500"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addInput}
              className="mt-2 flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              항목 추가
            </button>
          </div>
        </div>

        {/* 푸터 */}
        <div className="flex gap-2 border-t border-gray-100 px-5 py-4">
          <button
            type="button"
            onClick={() => onClose(category.id)}
            className="flex-1 rounded-xl border border-gray-200 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={save}
            disabled={isSaving || inputs.every((v) => !v.trim())}
            className="flex-1 rounded-xl bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {isSaving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [ready, setReady] = useState(false);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  // 역할 변경 상태
  const [changingId, setChangingId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{ user: UserRow; newRole: string } | null>(null);
  const [alertModal, setAlertModal] = useState<{ message: string } | null>(null);

  // 전문분야 관리 상태
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [newCatName, setNewCatName] = useState("");
  const [isAddingCat, setIsAddingCat] = useState(false);
  const [deletingCatId, setDeletingCatId] = useState<number | null>(null);
  const [editingCat, setEditingCat] = useState<{ id: number; name: string } | null>(null);
  const [catError, setCatError] = useState<string | null>(null);
  const [processModalCat, setProcessModalCat] = useState<CategoryRow | null>(null);
  const [refreshCatId, setRefreshCatId] = useState<number | null>(null);
  const [catVisibleCount, setCatVisibleCount] = useState(10);

  const sensors = useSensors(useSensor(PointerSensor));

  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const init = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      if (!session) { window.location.href = "/login"; return; }

      const { data: profileData } = await supabase
        .from("profiles").select("role").eq("user_id", session.user.id).maybeSingle();

      if (profileData?.role !== "admin" && profileData?.role !== "super_admin") {
        window.location.href = "/login";
        return;
      }
      setReady(true);
    };
    init();
  }, []);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from("profiles")
        .select("user_id, name, email, phone, role, status, created_at", { count: "exact" })
        .neq("role", "provider")
        .order("created_at", { ascending: false })
        .range(from, to);

      if (appliedSearch.trim()) {
        // 검색 시: 모든 역할(provider 제외) 대상으로 검색
        const kw = appliedSearch.trim();
        query = query.or(`name.ilike.%${kw}%,email.ilike.%${kw}%,phone.ilike.%${kw}%`);
      } else {
        // 검색 없을 때: 관리자·최고관리자만 표시
        query = query.in("role", ["admin", "super_admin"]);
      }

      const { data, count, error: fetchError } = await query;

      if (fetchError) {
        setError(`조회 오류: ${fetchError.message}`);
      } else {
        setUsers(data ?? []);
        setTotalCount(count ?? 0);
      }
    } catch (err) {
      console.error(err);
      setError("데이터를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, pageSize, appliedSearch]);

  useEffect(() => {
    if (!ready) return;
    fetchUsers();
  }, [ready, fetchUsers]);

  const handleSearch = () => {
    setCurrentPage(1);
    setAppliedSearch(search);
  };

  // 역할 변경 실행
  const applyRoleChange = async () => {
    if (!confirmTarget) return;
    const { user, newRole } = confirmTarget;
    setConfirmTarget(null);
    setChangingId(user.user_id);

    // optimistic update
    setUsers((prev) =>
      prev.map((u) => u.user_id === user.user_id ? { ...u, role: newRole } : u),
    );

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ role: newRole })
      .eq("user_id", user.user_id);

    if (updateError) {
      console.error("역할 변경 오류:", updateError);
      setUsers((prev) =>
        prev.map((u) => u.user_id === user.user_id ? { ...u, role: user.role } : u),
      );
      setAlertModal({ message: "역할 변경에 실패했습니다." });
    }

    setChangingId(null);
  };

  // 전문분야 목록 조회
  const fetchCategories = useCallback(async () => {
    const { data } = await supabase
      .from("category")
      .select("id, name, sort_order")
      .neq("name", "")
      .not("name", "is", null)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true });
    setCategories(data ?? []);
  }, []);

  useEffect(() => {
    if (ready) fetchCategories();
  }, [ready, fetchCategories]);

  // 전문분야 추가
  const addCategory = async () => {
    const name = newCatName.trim();
    if (!name) return;
    setCatError(null);
    setIsAddingCat(true);

    const maxOrder = categories.reduce((m, c) => Math.max(m, c.sort_order ?? 0), 0);
    const { error } = await supabase
      .from("category")
      .insert({ name, sort_order: maxOrder + 1 });

    if (error) {
      setCatError(error.code === "23505" ? "이미 존재하는 전문분야입니다." : error.message);
    } else {
      setNewCatName("");
      await fetchCategories();
    }
    setIsAddingCat(false);
  };

  // 전문분야 이름 수정
  const saveEditCategory = async () => {
    if (!editingCat) return;
    const name = editingCat.name.trim();
    if (!name) return;
    setCatError(null);

    const { error } = await supabase
      .from("category")
      .update({ name })
      .eq("id", editingCat.id);

    if (error) {
      setCatError(error.message);
    } else {
      setEditingCat(null);
      await fetchCategories();
    }
  };

  // 전문분야 삭제
  const deleteCategory = async (id: number) => {
    setDeletingCatId(id);
    await supabase.from("category").delete().eq("id", id);
    await fetchCategories();
    setDeletingCatId(null);
  };

  // 드래그 앤 드롭으로 순서 변경
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = categories.findIndex((c) => String(c.id) === String(active.id));
    const newIndex = categories.findIndex((c) => String(c.id) === String(over.id));
    const reordered = arrayMove(categories, oldIndex, newIndex);

    // 즉시 UI 업데이트
    setCategories(reordered);

    // sort_order 일괄 업데이트
    await Promise.all(
      reordered.map((cat, idx) =>
        supabase.from("category").update({ sort_order: idx + 1 }).eq("id", cat.id),
      ),
    );
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  if (!ready && isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-gray-800">설정</h1>
        <p className="mt-0.5 text-sm text-gray-500">회원 권한 및 전문분야를 관리합니다.</p>
      </div>

      {/* ── 권한 설정 ── */}
      <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">권한 설정</h2>
          <p className="mt-0.5 text-xs text-gray-400">
            회원의 역할(권한)을 변경할 수 있습니다. 관리자 권한 부여 시 신중하게 처리하세요.
          </p>
        </div>

        {/* 역할 범례 */}
        <div className="flex flex-wrap gap-2">
          {ROLES.map((r) => (
            <span key={r.value} className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${r.color}`}>
              {r.label}
            </span>
          ))}
        </div>

        {/* 검색 + 페이지당 개수 */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="개인고객 이름 / 이메일 / 전화번호로 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm outline-none placeholder:text-gray-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 sm:w-72"
            />
            <button
              type="button"
              onClick={handleSearch}
              className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
            >
              검색
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">페이지당</span>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
              className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-700 outline-none focus:border-indigo-400"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>{n}개</option>
              ))}
            </select>
            <span className="text-xs text-gray-400">전체 {totalCount}명</span>
          </div>
        </div>

        {/* 테이블 */}
        <div className="overflow-hidden rounded-xl border border-gray-200">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            </div>
          ) : error ? (
            <div className="py-16 text-center text-sm text-red-500">{error}</div>
          ) : users.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">
              {appliedSearch ? "검색 결과가 없습니다." : "등록된 관리자가 없습니다."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold text-gray-500">
                    <th className="px-4 py-3">이름</th>
                    <th className="px-4 py-3">이메일</th>
                    <th className="hidden px-4 py-3 sm:table-cell">전화번호</th>
                    <th className="px-4 py-3">현재 역할</th>
                    <th className="hidden px-4 py-3 md:table-cell">가입일</th>
                    <th className="px-4 py-3">역할 변경</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map((user) => (
                    <tr key={user.user_id} className="transition hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">{user.name || "—"}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{user.email || "—"}</td>
                      <td className="hidden px-4 py-3 text-gray-600 sm:table-cell">{user.phone || "—"}</td>
                      <td className="px-4 py-3"><RoleBadge role={user.role} /></td>
                      <td className="hidden px-4 py-3 text-gray-500 md:table-cell">
                        {user.created_at ? new Date(user.created_at).toLocaleDateString("ko-KR") : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={user.role}
                          disabled={changingId === user.user_id}
                          onChange={(e) => setConfirmTarget({ user, newRole: e.target.value })}
                          className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-indigo-400 disabled:opacity-50"
                        >
                          {ROLES.map((r) => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => p - 1)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              이전
            </button>
            <div className="flex gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
                .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                  if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
                  acc.push(p);
                  return acc;
                }, [])
                .map((item, idx) =>
                  item === "..." ? (
                    <span key={`el-${idx}`} className="px-2 py-1.5 text-sm text-gray-400">…</span>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setCurrentPage(item as number)}
                      className={`min-w-[32px] rounded-lg border px-2 py-1.5 text-sm transition ${
                        currentPage === item
                          ? "border-indigo-600 bg-indigo-600 font-semibold text-white"
                          : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {item}
                    </button>
                  ),
                )}
            </div>
            <button
              type="button"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              다음
            </button>
          </div>
        )}
      </section>

      {/* ── 전문분야 관리 ── */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-gray-800">전문분야 관리</h2>
          <p className="text-xs text-gray-400">공급업체 온보딩 시 선택 가능한 전문분야 목록입니다.</p>
        </div>

        {catError && (
          <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{catError}</p>
        )}

        {/* 추가 입력 */}
        <div className="mb-4 flex gap-2">
          <input
            type="text"
            placeholder="새 전문분야 이름 입력"
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCategory()}
            className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2 text-sm outline-none placeholder:text-gray-400 focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
          />
          <button
            type="button"
            onClick={addCategory}
            disabled={isAddingCat || !newCatName.trim()}
            className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {isAddingCat ? "추가 중..." : "추가"}
          </button>
        </div>

        {/* 목록 */}
        {categories.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">등록된 전문분야가 없습니다.</p>
        ) : (
          <>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={categories.slice(0, catVisibleCount).map((c) => String(c.id))} strategy={verticalListSortingStrategy}>
                <ul className="divide-y divide-gray-100">
                  {categories.slice(0, catVisibleCount).map((cat, idx) => (
                    <SortableCategoryItem
                      key={cat.id}
                      cat={cat}
                      idx={idx}
                      editingCat={editingCat}
                      setEditingCat={setEditingCat}
                      setCatError={setCatError}
                      saveEditCategory={saveEditCategory}
                      deletingCatId={deletingCatId}
                      deleteCategory={deleteCategory}
                      onProcessClick={setProcessModalCat}
                      refreshTrigger={refreshCatId === cat.id ? refreshCatId : undefined}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>

            {catVisibleCount < categories.length && (
              <button
                type="button"
                onClick={() => setCatVisibleCount((n) => n + 10)}
                className="mt-3 w-full rounded-xl border border-gray-200 py-2 text-xs text-gray-500 transition hover:bg-gray-50"
              >
                더보기 ({categories.length - catVisibleCount}개 더 있음)
              </button>
            )}
            {catVisibleCount >= categories.length && categories.length > 10 && (
              <button
                type="button"
                onClick={() => setCatVisibleCount(10)}
                className="mt-3 w-full rounded-xl border border-gray-200 py-2 text-xs text-gray-400 transition hover:bg-gray-50"
              >
                접기
              </button>
            )}
          </>
        )}
      </section>

      {/* 공정 관리 모달 */}
      {processModalCat && (
        <ProcessModal
          category={processModalCat}
          onClose={(catId) => { setProcessModalCat(null); setRefreshCatId(catId ?? null); }}
        />
      )}

      {/* 역할 변경 확인 모달 */}
      {confirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold text-gray-800">역할 변경 확인</h3>
            <p className="mt-3 text-sm text-gray-600">
              <span className="font-medium text-gray-800">{confirmTarget.user.name || confirmTarget.user.email}</span>님의
              역할을{" "}
              <RoleBadge role={confirmTarget.user.role} />
              {" → "}
              <RoleBadge role={confirmTarget.newRole} />
              (으)로 변경하시겠습니까?
            </p>
            {(confirmTarget.newRole === "admin" || confirmTarget.newRole === "super_admin") && (
              <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                ⚠️ 관리자 권한은 시스템 전체에 접근 가능합니다. 신중하게 부여하세요.
              </p>
            )}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmTarget(null)}
                className="flex-1 rounded-xl border border-gray-200 py-2 text-sm text-gray-600 transition hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={applyRoleChange}
                className="flex-1 rounded-xl bg-indigo-600 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
              >
                변경하기
              </button>
            </div>
          </div>
        </div>
      )}

      {alertModal && (
        <AlertModal
          title="알림"
          message={alertModal.message}
          variant="error"
          onClose={() => setAlertModal(null)}
        />
      )}
    </div>
  );
}
