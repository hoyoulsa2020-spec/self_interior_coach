"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { compressImage } from "@/lib/imageCompress";
import AlertModal from "@/components/AlertModal";
import NoticeEditor from "@/components/NoticeEditor";

type Notice = {
  id: string;
  title: string;
  content: string;
  image_urls?: string[] | null;
  created_at: string;
  updated_at: string;
  view_count?: number;
};

type AdminNoticesPanelProps = {
  targetAudience: "provider" | "consumer";
  title: string;
  description: string;
};

export default function AdminNoticesPanel({ targetAudience, title, description }: AdminNoticesPanelProps) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Notice | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formImageUrls, setFormImageUrls] = useState<string[]>([]);
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; title: string } | null>(null);
  const [viewingNotice, setViewingNotice] = useState<Notice | null>(null);
  const [alert, setAlert] = useState<{ message: string; variant?: "info" | "warning" | "error" | "success" } | null>(null);
  const initializedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      .select("id, title, content, image_urls, created_at, updated_at, view_count")
      .eq("target_audience", targetAudience)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("공지 조회 오류:", error.message);
      setAlert({ message: "공지사항을 불러오지 못했습니다.", variant: "error" });
    }
    setNotices((data ?? []) as Notice[]);
    setIsLoading(false);
  }, [targetAudience]);

  useEffect(() => {
    fetchNotices();
  }, [fetchNotices]);

  const openCreate = () => {
    setEditing(null);
    setFormTitle("");
    setFormContent("");
    setFormImageUrls([]);
    setPendingImages([]);
    setSaveError(null);
    setShowForm(true);
  };

  const openEdit = (n: Notice) => {
    setEditing(n);
    setFormTitle(n.title);
    setFormContent(n.content);
    setFormImageUrls(n.image_urls ?? []);
    setPendingImages([]);
    setSaveError(null);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setFormTitle("");
    setFormContent("");
    setFormImageUrls([]);
    setPendingImages([]);
    setSaveError(null);
  };

  const uploadImages = async (): Promise<string[]> => {
    const urls: string[] = [];
    for (const file of pendingImages) {
      const blob = await compressImage(file);
      const path = `notices/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
      const { error } = await supabase.storage.from("notice-images").upload(path, blob, { contentType: "image/jpeg" });
      if (error) throw new Error(`이미지 업로드 실패: ${error.message}`);
      const { data } = supabase.storage.from("notice-images").getPublicUrl(path);
      urls.push(data.publicUrl);
    }
    return urls;
  };

  const handleSave = async () => {
    const title = formTitle.trim();
    const content = formContent.trim();
    if (!title) {
      setSaveError("제목을 입력하세요.");
      return;
    }
    const stripped = content.replace(/<[^>]+>/g, "").trim();
    if (!stripped) {
      setSaveError("내용을 입력하세요.");
      return;
    }
    setIsSaving(true);
    setSaveError(null);

    try {
      let allImageUrls = [...formImageUrls];
      if (pendingImages.length > 0) {
        allImageUrls = [...formImageUrls, ...(await uploadImages())];
      }

      if (editing) {
        const { error } = await supabase
          .from("notices")
          .update({
            title,
            content,
            image_urls: allImageUrls.length > 0 ? allImageUrls : null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editing.id);
        if (error) throw error;
        setAlert({ message: "공지가 수정되었습니다.", variant: "success" });
      } else {
        const { data } = await supabase.auth.getSession();
        const { error } = await supabase.from("notices").insert({
          title,
          content,
          image_urls: allImageUrls.length > 0 ? allImageUrls : null,
          target_audience: targetAudience,
          created_by: data.session?.user.id,
        });
        if (error) throw error;
        setAlert({ message: "공지가 등록되었습니다.", variant: "success" });
      }
      closeForm();
      fetchNotices();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "저장에 실패했습니다.");
    }
    setIsSaving(false);
  };

  const handleDeleteClick = (n: Notice) => {
    setDeleteConfirm({ id: n.id, title: n.title });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    const { id } = deleteConfirm;
    setDeleteConfirm(null);
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

  const addFiles = (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    setPendingImages((prev) => [...prev, ...list].slice(0, 10));
  };

  const removePendingImage = (idx: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const removeFormImage = (idx: number) => {
    setFormImageUrls((prev) => prev.filter((_, i) => i !== idx));
  };

  const formatDate = (s: string) => {
    const d = new Date(s);
    return d.toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const stripHtml = (html: string) => html.replace(/<[^>]+>/g, "").trim();
  const contentPreview = (n: Notice) => {
    const text = stripHtml(n.content);
    return text.length > 120 ? text.slice(0, 120) + "..." : text || "(내용 없음)";
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">{title}</h1>
          <p className="mt-0.5 text-sm text-gray-500">{description}</p>
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
                  <button
                    type="button"
                    onClick={() => setViewingNotice(n)}
                    className="min-w-0 flex-1 cursor-pointer text-left hover:opacity-90"
                  >
                    <h3 className="font-medium text-gray-800">{n.title}</h3>
                    <p className="mt-1 line-clamp-2 text-sm text-gray-600">
                      {contentPreview(n)}
                    </p>
                    {(n.image_urls?.length ?? 0) > 0 && (
                      <p className="mt-1 text-xs text-gray-400">이미지 {n.image_urls!.length}개 첨부</p>
                    )}
                    <p className="mt-1 text-xs text-gray-400">
                      {formatDate(n.created_at)}
                      {(n.view_count ?? 0) > 0 && <span className="ml-2">조회 {n.view_count}회</span>}
                    </p>
                  </button>
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
                      onClick={() => handleDeleteClick(n)}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-2xl md:max-w-4xl max-h-[95vh] rounded-2xl bg-white shadow-xl flex flex-col my-auto">
            <div className="shrink-0 border-b border-gray-100 px-4 py-3 sm:px-6">
              <h3 className="text-base font-semibold text-gray-800 sm:text-lg">{editing ? "공지 수정" : "공지 등록"}</h3>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto space-y-4 px-4 py-4 sm:px-6">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">제목</label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="공지 제목"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm sm:text-base outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">내용 (링크, 굵게, 기울임 등 지원)</label>
                <NoticeEditor
                  key={editing?.id ?? "new"}
                  content={formContent}
                  onChange={setFormContent}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">이미지 첨부 (드래그 앤 드롭 또는 클릭)</label>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    addFiles(e.dataTransfer.files);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex min-h-[100px] cursor-pointer flex-wrap items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 transition sm:min-h-[120px] ${
                    isDragging ? "border-indigo-500 bg-indigo-50" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      addFiles(e.target.files ?? []);
                      e.target.value = "";
                    }}
                  />
                  {(formImageUrls.length + pendingImages.length) === 0 ? (
                    <p className="text-center text-sm text-gray-500">이미지를 드래그하거나 클릭하여 추가 (최대 10장)</p>
                  ) : (
                    <>
                      {formImageUrls.map((url, i) => (
                        <div key={`saved-${i}`} className="relative group">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt="" className="h-16 w-16 sm:h-20 sm:w-20 rounded-lg object-cover" />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFormImage(i);
                            }}
                            className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      {pendingImages.map((f, i) => (
                        <div key={i} className="relative group">
                          <img
                            src={URL.createObjectURL(f)}
                            alt=""
                            className="h-16 w-16 sm:h-20 sm:w-20 rounded-lg object-cover"
                          />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removePendingImage(i);
                            }}
                            className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
              {saveError && <p className="text-sm text-red-600">{saveError}</p>}
            </div>
            <div className="shrink-0 flex gap-2 border-t border-gray-100 px-4 py-4 sm:px-6">
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

      {/* 상세보기 모달 */}
      {viewingNotice && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setViewingNotice(null)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 border-b border-gray-100 px-4 py-3 sm:px-6">
              <h2 className="text-lg font-semibold text-gray-800">{viewingNotice.title}</h2>
              <p className="mt-1 text-xs text-gray-500">
                {formatDate(viewingNotice.created_at)}
                {(viewingNotice.view_count ?? 0) > 0 && (
                  <span className="ml-2">조회 {viewingNotice.view_count}회</span>
                )}
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
              <div
                className="prose prose-sm max-w-none whitespace-pre-wrap text-gray-700 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_a]:text-indigo-600 [&_a]:underline [&_ul]:list-disc [&_ol]:list-decimal [&_li]:ml-4"
                dangerouslySetInnerHTML={{ __html: viewingNotice.content }}
              />
              {(viewingNotice.image_urls?.length ?? 0) > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {viewingNotice.image_urls!.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="max-h-48 rounded-lg object-cover" />
                    </a>
                  ))}
                </div>
              )}
            </div>
            <div className="shrink-0 border-t border-gray-100 px-4 py-3 sm:px-6">
              <button
                type="button"
                onClick={() => setViewingNotice(null)}
                className="w-full rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 삭제 확인 모달 */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </div>
            <h3 className="mt-4 text-base font-bold text-gray-900">공지 삭제</h3>
            <p className="mt-2 text-sm text-gray-600">
              &quot;{deleteConfirm.title}&quot; 공지를 삭제하시겠습니까?
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-medium text-white hover:bg-red-700"
              >
                삭제
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
