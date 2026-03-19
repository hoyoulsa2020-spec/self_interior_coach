"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";

type EstimateReview = {
  id: string;
  title: string;
  content: string | null;
  file_urls: string[];
  status: string;
  answer: string | null;
  answer_file_urls: string[];
  answered_at: string | null;
  created_at: string;
};

const PAGE_SIZE = 10;
const ACCEPT_TYPES = "image/*,.xlsx,.xls,.csv,.pdf";

function FileIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["xlsx", "xls", "csv"].includes(ext))
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-green-600">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
      </svg>
    );
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500">
      <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function isImage(url: string) {
  return /\.(png|jpg|jpeg|gif|webp)(\?|$)/i.test(url);
}

function fileName(url: string) {
  return decodeURIComponent(url.split("/").pop()?.split("?")[0] ?? url).replace(/^\d+_[\w]+\./, "파일.");
}

export default function EstimatesPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [reviews, setReviews] = useState<EstimateReview[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  const [detail, setDetail] = useState<EstimateReview | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formFiles, setFormFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setUserId(data.session.user.id);
    });
  }, []);

  const fetchReviews = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    const from = (currentPage - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    let query = supabase
      .from("estimate_reviews")
      .select("id, title, content, file_urls, status, answer, answer_file_urls, answered_at, created_at", { count: "exact" })
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(from, to);
    if (appliedSearch.trim()) query = query.ilike("title", `%${appliedSearch.trim()}%`);
    const { data, count } = await query;
    setReviews(data ?? []);
    setTotalCount(count ?? 0);
    setIsLoading(false);
  }, [userId, currentPage, appliedSearch]);

  useEffect(() => { if (userId) fetchReviews(); }, [userId, fetchReviews]);

  const handleSearch = () => { setCurrentPage(1); setAppliedSearch(search); };
  const removeFile = (idx: number) => setFormFiles((prev) => prev.filter((_, i) => i !== idx));

  const addFiles = (files: File[]) => {
    const valid = files.filter((f) =>
      f.type.startsWith("image/") ||
      ["xlsx","xls","csv","pdf"].includes(f.name.split(".").pop()?.toLowerCase() ?? "")
    );
    setFormFiles((prev) => [...prev, ...valid]);
  };

  const handleSubmit = async () => {
    if (!userId) return;
    if (!formTitle.trim()) { setFormError("제목을 입력해주세요."); return; }
    if (formFiles.length === 0) { setFormError("파일을 1개 이상 첨부해주세요."); return; }
    setFormError(null);
    setIsSubmitting(true);

    const fileUrls: string[] = [];
    for (const file of formFiles) {
      const ext = file.name.split(".").pop();
      const path = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("estimate-files").upload(path, file);
      if (uploadError) { setFormError(`업로드 오류: ${uploadError.message}`); setIsSubmitting(false); return; }
      const { data: urlData } = supabase.storage.from("estimate-files").getPublicUrl(path);
      fileUrls.push(urlData.publicUrl);
    }

    const { error } = await supabase.from("estimate_reviews").insert({
      user_id: userId,
      title: formTitle.trim(),
      content: formContent.trim() || null,
      file_urls: fileUrls,
    });

    if (error) { setFormError(error.message); setIsSubmitting(false); return; }

    setFormTitle(""); setFormContent(""); setFormFiles([]);
    setShowForm(false); setIsSubmitting(false);
    setCurrentPage(1); setAppliedSearch(""); setSearch("");
    await fetchReviews();
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">견적서 검토요청</h1>
          <p className="mt-0.5 text-sm text-gray-500">타사 견적서를 업로드하면 셀인코치가 검토 후 답변드립니다.</p>
        </div>
        <button type="button" onClick={() => { setShowForm(true); setFormError(null); }}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 active:scale-95">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span className="hidden sm:inline">타사 견적서 업로드</span>
          <span className="sm:hidden">업로드</span>
        </button>
      </div>

      {/* 검색 */}
      <div className="flex gap-2">
        <input type="text" placeholder="제목으로 검색" value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm outline-none placeholder:text-gray-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 sm:w-72" />
        <button type="button" onClick={handleSearch}
          className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700">검색</button>
      </div>

      {/* 목록 */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          </div>
        ) : reviews.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-gray-400">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
            <p className="mt-3 text-sm text-gray-500">{appliedSearch ? "검색 결과가 없습니다." : "아직 검토 요청 내역이 없습니다."}</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {reviews.map((r) => (
              <li key={r.id} onClick={() => setDetail(r)}
                className="flex cursor-pointer items-center gap-3 px-5 py-4 transition hover:bg-gray-50">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${r.status === "reviewed" ? "bg-blue-50 text-blue-700" : "bg-yellow-50 text-yellow-700"}`}>
                      {r.status === "reviewed" ? "검토완료" : "검토대기"}
                    </span>
                    <p className="truncate text-sm font-medium text-gray-800">{r.title}</p>
                    {r.file_urls?.length > 0 && (
                      <span className="shrink-0 text-xs text-gray-400">📎 {r.file_urls.length}</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString("ko-KR")}</p>
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
                if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("..."); acc.push(p); return acc;
              }, [])
              .map((item, idx) => item === "..." ? (
                <span key={`e${idx}`} className="px-2 py-1.5 text-sm text-gray-400">…</span>
              ) : (
                <button key={item} type="button" onClick={() => setCurrentPage(item as number)}
                  className={`min-w-[32px] rounded-lg border px-2 py-1.5 text-sm ${currentPage === item ? "border-indigo-600 bg-indigo-600 font-semibold text-white" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}>
                  {item}
                </button>
              ))}
          </div>
          <button type="button" disabled={currentPage === totalPages} onClick={() => setCurrentPage((p) => p + 1)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40">다음</button>
        </div>
      )}

      {/* ── 상세 모달 ── */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="flex w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl" style={{ maxHeight: "90vh" }}>
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${detail.status === "reviewed" ? "bg-blue-50 text-blue-700" : "bg-yellow-50 text-yellow-700"}`}>
                  {detail.status === "reviewed" ? "검토완료" : "검토대기"}
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
              {detail.content && (
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-xs text-gray-400 mb-1">{new Date(detail.created_at).toLocaleString("ko-KR")}</p>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{detail.content}</p>
                </div>
              )}

              {/* 첨부 파일 */}
              {detail.file_urls?.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-gray-500">첨부 파일</p>
                  <div className="space-y-2">
                    {detail.file_urls.map((url, i) => isImage(url) ? (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                        <img src={url} alt={`첨부${i + 1}`} className="w-full rounded-xl border border-gray-100 object-cover hover:opacity-90" style={{ maxHeight: 200 }} />
                      </a>
                    ) : (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-700 hover:bg-gray-100">
                        <FileIcon name={url} />
                        <span className="truncate">{fileName(url)}</span>
                        <svg className="ml-auto shrink-0 text-gray-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* 검토 답변 */}
              {detail.answer || (detail.answer_file_urls?.length > 0) ? (
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 space-y-2">
                  <p className="text-xs font-semibold text-blue-600">셀인코치 검토 답변</p>
                  {detail.answer && <p className="text-sm text-gray-800 whitespace-pre-wrap">{detail.answer}</p>}
                  {detail.answer_file_urls?.length > 0 && (
                    <div className="space-y-2 pt-1">
                      {detail.answer_file_urls.map((url, i) => isImage(url) ? (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                          <img src={url} alt={`답변첨부${i + 1}`} className="w-full rounded-xl border border-blue-100 object-cover hover:opacity-90" style={{ maxHeight: 200 }} />
                        </a>
                      ) : (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 rounded-xl border border-blue-100 bg-white px-4 py-3 text-sm text-gray-700 hover:bg-blue-50">
                          <FileIcon name={url} />
                          <span className="truncate">{fileName(url)}</span>
                          <svg className="ml-auto shrink-0 text-gray-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                          </svg>
                        </a>
                      ))}
                    </div>
                  )}
                  {detail.answered_at && <p className="text-xs text-blue-400">{new Date(detail.answered_at).toLocaleString("ko-KR")}</p>}
                </div>
              ) : (
                <div className="rounded-xl border border-yellow-100 bg-yellow-50 px-4 py-3 text-xs text-yellow-700">
                  검토 중입니다. 조금만 기다려 주세요.
                </div>
              )}
            </div>
            <div className="border-t border-gray-100 px-5 py-4">
              <button type="button" onClick={() => setDetail(null)}
                className="w-full rounded-xl border border-gray-200 py-2 text-sm text-gray-600 hover:bg-gray-50">닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 업로드 모달 ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="flex w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl" style={{ maxHeight: "90vh" }}>
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h3 className="text-sm font-semibold text-gray-800">타사 견적서 업로드</h3>
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-600">제목 <span className="text-red-500">*</span></label>
                <input type="text" placeholder="견적서 제목을 입력하세요" value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm outline-none placeholder:text-gray-400 focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-600">요청 내용 (선택)</label>
                <textarea placeholder="검토 시 참고할 내용을 입력해주세요." value={formContent}
                  onChange={(e) => setFormContent(e.target.value)} rows={3}
                  className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm outline-none placeholder:text-gray-400 focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100" />
              </div>

              {/* 파일 드롭존 */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-600">파일 첨부 <span className="text-red-500">*</span></label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => { e.preventDefault(); setIsDragging(false); addFiles(Array.from(e.dataTransfer.files)); }}
                  className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed py-8 transition
                    ${isDragging ? "border-indigo-400 bg-indigo-50 text-indigo-500 scale-[1.01]" : "border-gray-200 text-gray-400 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-500"}`}
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="16 16 12 12 8 16" /><line x1="12" y1="12" x2="12" y2="21" />
                    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
                  </svg>
                  {isDragging ? (
                    <p className="mt-2 text-xs font-medium text-indigo-500">여기에 놓으세요!</p>
                  ) : (
                    <>
                      <p className="mt-2 text-xs font-medium">파일을 드래그하거나 클릭하여 추가</p>
                      <p className="mt-0.5 text-[11px] text-gray-300">엑셀(xlsx, xls, csv), 이미지, PDF 지원</p>
                    </>
                  )}
                </div>
                <input ref={fileInputRef} type="file" accept={ACCEPT_TYPES} multiple className="hidden"
                  onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />

                {formFiles.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {formFiles.map((file, i) => (
                      <li key={i} className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
                        <FileIcon name={file.name} />
                        <span className="flex-1 truncate text-xs text-gray-700">{file.name}</span>
                        <span className="shrink-0 text-[10px] text-gray-400">{(file.size / 1024).toFixed(0)}KB</span>
                        <button type="button" onClick={() => removeFile(i)}
                          className="shrink-0 rounded-lg p-1 text-gray-300 hover:text-red-500">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {formError && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{formError}</p>}
            </div>
            <div className="flex gap-2 border-t border-gray-100 px-5 py-4">
              <button type="button" onClick={() => setShowForm(false)}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm text-gray-600 hover:bg-gray-50">취소</button>
              <button type="button" onClick={handleSubmit} disabled={isSubmitting}
                className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                {isSubmitting ? "업로드 중..." : "검토 요청"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
