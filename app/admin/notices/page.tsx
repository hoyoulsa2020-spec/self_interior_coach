"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import AlertModal from "@/components/AlertModal";

type Notice = {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
};

export default function AdminNoticesPage() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Notice | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [alert, setAlert] = useState<{ message: string; variant?: "info" | "warning" | "error" | "success" } | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const check = async () => {
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
      }
    };
    check();
  }, []);

  const fetchNotices = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("notices")
      .select("id, title, content, created_at, updated_at")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("공지 조회 오류:", error.message);
      setAlert({ message: "공지사항을 불러오지 못했습니다.", variant: "error" });
    }
    setNotices((data ?? []) as Notice[]);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchNotices();
  }, [fetchNotices]);

  const openCreate = () => {
    setEditing(null);
    setFormTitle("");
    setFormContent("");
    setSaveError(null);
    setShowForm(true);
  };

  const openEdit = (n: Notice) => {
    setEditing(n);
    setFormTitle(n.title);
    setFormContent(n.content);
    setSaveError(null);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setFormTitle("");
    setFormContent("");
    setSaveError(null);
  };

  const handleSave = async () => {
    const title = formTitle.trim();
    const content = formContent.trim();
    if (!title) {
      setSaveError("제목을 입력하세요.");
      return;
    }
    if (!content) {
      setSaveError("내용을 입력하세요.");
      return;
    }
    setIsSaving(true);
    setSaveError(null);

    if (editing) {
      const { error } = await supabase
        .from("notices")
        .update({ title, content, updated_at: new Date().toISOString() })
        .eq("id", editing.id);
      if (error) {
        setSaveError(error.message);
        setIsSaving(false);
        return;
      }
      setAlert({ message: "공지가 수정되었습니다.", variant: "success" });
    } else {
      const { data: session } = await supabase.auth.getSession();
      const { error } = await supabase
        .from("notices")
        .insert({ title, content, created_by: session.data.session?.user.id });
      if (error) {
        setSaveError(error.message);
        setIsSaving(false);
        return;
      }
      setAlert({ message: "공지가 등록되었습니다.", variant: "success" });
    }
    closeForm();
    fetchNotices();
    setIsSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("이 공지를 삭제하시겠습니까?")) return;
    setDeletingId(id);
    const { error } = await supabase.from("notices").delete().eq("id", id);
    setDeletingId(null);
    if (error) {
      setAlert({ message: "삭제에 실패했습니다.", variant: "error" });
      return;
    }
    setAlert({ message: "삭제되었습니다.", variant: "success" });
    fetchNotices();
  };

  const formatDate = (s: string) => {
    const d = new Date(s);
    return d.toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">공지사항</h1>
          <p className="mt-0.5 text-sm text-gray-500">공지사항을 등록하고 관리합니다.</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
        >
          공지 등록
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        </div>
      ) : notices.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white py-16 text-center text-sm text-gray-500">
          등록된 공지가 없습니다. 공지 등록 버튼을 눌러 추가하세요.
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <ul className="divide-y divide-gray-100">
            {notices.map((n) => (
              <li key={n.id} className="px-4 py-4 sm:px-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium text-gray-800">{n.title}</h3>
                    <p className="mt-1 line-clamp-2 text-sm text-gray-600">{n.content}</p>
                    <p className="mt-1 text-xs text-gray-400">{formatDate(n.created_at)}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(n)}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(n.id)}
                      disabled={deletingId === n.id}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      {deletingId === n.id ? "삭제 중..." : "삭제"}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 등록/수정 폼 모달 */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
            <div className="border-b border-gray-100 px-5 py-4">
              <h3 className="text-base font-semibold text-gray-800">{editing ? "공지 수정" : "공지 등록"}</h3>
            </div>
            <div className="space-y-4 px-5 py-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">제목</label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="공지 제목"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">내용</label>
                <textarea
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  placeholder="공지 내용"
                  rows={6}
                  className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
              {saveError && <p className="text-sm text-red-600">{saveError}</p>}
            </div>
            <div className="flex gap-2 border-t border-gray-100 px-5 py-4">
              <button
                type="button"
                onClick={closeForm}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {isSaving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      {alert && (
        <AlertModal
          message={alert.message}
          variant={alert.variant}
          onClose={() => setAlert(null)}
        />
      )}
    </div>
  );
}
