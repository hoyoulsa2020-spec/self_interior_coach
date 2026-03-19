"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import ProviderSearchBar from "@/components/ProviderSearchBar";

type Inquiry = {
  id: string;
  title: string;
  content: string;
  image_urls: string[];
  status: string;
  answer: string | null;
  answered_at: string | null;
  created_at: string;
};

const PAGE_SIZE = 10;

export default function ProviderContactPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  const [detail, setDetail] = useState<Inquiry | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formFiles, setFormFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setUserId(data.session.user.id);
    });
  }, []);

  const fetchInquiries = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    const from = (currentPage - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from("provider_inquiries")
      .select("id, title, content, image_urls, status, answer, answered_at, created_at", { count: "exact" })
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (appliedSearch.trim()) {
      query = query.ilike("title", `%${appliedSearch.trim()}%`);
    }

    const { data, count } = await query;
    setInquiries(data ?? []);
    setTotalCount(count ?? 0);
    setIsLoading(false);
  }, [userId, currentPage, appliedSearch]);

  useEffect(() => {
    if (userId) fetchInquiries();
  }, [userId, fetchInquiries]);

  const handleSearch = () => {
    setCurrentPage(1);
    setAppliedSearch(search);
  };

  const removeFile = (idx: number) =>
    setFormFiles((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = async () => {
    if (!userId) return;
    if (!formTitle.trim() || !formContent.trim()) {
      setFormError("제목과 내용을 모두 입력해주세요.");
      return;
    }
    setFormError(null);
    setIsSubmitting(true);

    const imageUrls: string[] = [];
    for (const file of formFiles) {
      const ext = file.name.split(".").pop();
      const path = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("inquiry-images")
        .upload(path, file);
      if (uploadError) {
        setFormError(`이미지 업로드 오류: ${uploadError.message}`);
        setIsSubmitting(false);
        return;
      }
      const { data: urlData } = supabase.storage.from("inquiry-images").getPublicUrl(path);
      imageUrls.push(urlData.publicUrl);
    }

    const { error } = await supabase.from("provider_inquiries").insert({
      user_id: userId,
      title: formTitle.trim(),
      content: formContent.trim(),
      image_urls: imageUrls,
    });

    if (error) {
      setFormError(error.message);
      setIsSubmitting(false);
      return;
    }

    setFormTitle("");
    setFormContent("");
    setFormFiles([]);
    setShowForm(false);
    setIsSubmitting(false);
    setCurrentPage(1);
    setAppliedSearch("");
    setSearch("");
    await fetchInquiries();
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">셀인코치에게 문의</h1>
          <p className="mt-0.5 text-sm text-gray-500">궁금한 점을 문의하시면 빠르게 답변드립니다.</p>
        </div>
        <button
          type="button"
          onClick={() => { setShowForm(true); setFormError(null); }}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 active:scale-95"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span className="hidden sm:inline">셀인코치에게 문의하기</span>
          <span className="sm:hidden">문의하기</span>
        </button>
      </div>

      {/* 검색 */}
      <ProviderSearchBar
        value={search}
        onChange={setSearch}
        placeholder="제목으로 검색"
        onSearch={handleSearch}
      />

      {/* 목록 */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          </div>
        ) : inquiries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-gray-400">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <p className="mt-3 text-sm text-gray-500">
              {appliedSearch ? "검색 결과가 없습니다." : "아직 문의 내역이 없습니다."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {inquiries.map((inq) => (
              <li
                key={inq.id}
                onClick={() => setDetail(inq)}
                className="flex cursor-pointer items-center gap-3 px-5 py-4 transition hover:bg-gray-50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      inq.status === "answered"
                        ? "bg-blue-50 text-blue-700"
                        : "bg-yellow-50 text-yellow-700"
                    }`}>
                      {inq.status === "answered" ? "답변완료" : "답변대기"}
                    </span>
                    <p className="truncate text-sm font-medium text-gray-800">{inq.title}</p>
                    {inq.image_urls?.length > 0 && (
                      <svg className="shrink-0 text-gray-400" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {new Date(inq.created_at).toLocaleDateString("ko-KR")}
                  </p>
                </div>
                <svg className="shrink-0 text-gray-300" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button type="button" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => p - 1)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40">이전</button>
          <div className="flex gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
              .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
                acc.push(p); return acc;
              }, [])
              .map((item, idx) => item === "..." ? (
                <span key={`e${idx}`} className="px-2 py-1.5 text-sm text-gray-400">…</span>
              ) : (
                <button key={item} type="button" onClick={() => setCurrentPage(item as number)}
                  className={`min-w-[32px] rounded-lg border px-2 py-1.5 text-sm transition ${currentPage === item ? "border-indigo-600 bg-indigo-600 font-semibold text-white" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}>
                  {item}
                </button>
              ))}
          </div>
          <button type="button" disabled={currentPage === totalPages} onClick={() => setCurrentPage((p) => p + 1)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40">다음</button>
        </div>
      )}

      {/* 상세 보기 모달 */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="flex w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl" style={{ maxHeight: "90vh" }}>
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${detail.status === "answered" ? "bg-blue-50 text-blue-700" : "bg-yellow-50 text-yellow-700"}`}>
                  {detail.status === "answered" ? "답변완료" : "답변대기"}
                </span>
                <h3 className="text-sm font-semibold text-gray-800">{detail.title}</h3>
              </div>
              <button type="button" onClick={() => setDetail(null)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div className="rounded-xl bg-gray-50 p-4">
                <p className="mb-1 text-xs text-gray-400">{new Date(detail.created_at).toLocaleString("ko-KR")}</p>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{detail.content}</p>
              </div>
              {detail.image_urls?.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-gray-500">첨부 이미지</p>
                  <div className="grid grid-cols-3 gap-2">
                    {detail.image_urls.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                        <img src={url} alt={`첨부${i + 1}`} className="h-24 w-full rounded-xl object-cover border border-gray-100 hover:opacity-90" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {detail.answer ? (
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                  <p className="mb-1 text-xs font-semibold text-blue-600">셀인코치 답변</p>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{detail.answer}</p>
                  {detail.answered_at && (
                    <p className="mt-2 text-xs text-blue-400">{new Date(detail.answered_at).toLocaleString("ko-KR")}</p>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-yellow-100 bg-yellow-50 px-4 py-3 text-xs text-yellow-700">
                  답변을 준비 중입니다. 조금만 기다려 주세요.
                </div>
              )}
            </div>
            <div className="border-t border-gray-100 px-5 py-4">
              <button type="button" onClick={() => setDetail(null)}
                className="w-full rounded-xl border border-gray-200 py-2 text-sm text-gray-600 hover:bg-gray-50">
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 새 문의 모달 */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="flex w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl" style={{ maxHeight: "90vh" }}>
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h3 className="text-sm font-semibold text-gray-800">셀인코치에게 문의하기</h3>
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-600">제목 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  placeholder="문의 제목을 입력하세요"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm outline-none placeholder:text-gray-400 focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-600">내용 <span className="text-red-500">*</span></label>
                <textarea
                  placeholder="문의 내용을 자세히 입력해주세요"
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  rows={6}
                  className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm outline-none placeholder:text-gray-400 focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-600">이미지 첨부 (선택)</label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
                    if (files.length) setFormFiles((prev) => [...prev, ...files]);
                  }}
                  className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed py-8 text-gray-400 transition
                    ${isDragging ? "border-indigo-400 bg-indigo-50 text-indigo-500 scale-[1.01]" : "border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-500"}`}
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="16 16 12 12 8 16" />
                    <line x1="12" y1="12" x2="12" y2="21" />
                    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
                  </svg>
                  {isDragging ? (
                    <p className="mt-2 text-xs font-medium text-indigo-500">여기에 놓으세요!</p>
                  ) : (
                    <>
                      <p className="mt-2 text-xs font-medium">이미지를 드래그하거나 클릭하여 추가</p>
                      <p className="mt-0.5 text-[11px] text-gray-300">PNG, JPG, WEBP 지원</p>
                    </>
                  )}
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    setFormFiles((prev) => [...prev, ...files]);
                    e.target.value = "";
                  }}
                />
                {formFiles.length > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {formFiles.map((file, i) => (
                      <div key={i} className="relative">
                        <img src={URL.createObjectURL(file)} alt={file.name} className="h-24 w-full rounded-xl object-cover border border-gray-100" />
                        <button type="button" onClick={() => removeFile(i)}
                          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {formError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{formError}</p>
              )}
            </div>
            <div className="flex gap-2 border-t border-gray-100 px-5 py-4">
              <button type="button" onClick={() => setShowForm(false)}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm text-gray-600 hover:bg-gray-50">
                취소
              </button>
              <button type="button" onClick={handleSubmit} disabled={isSubmitting}
                className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                {isSubmitting ? "제출 중..." : "문의 제출"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
