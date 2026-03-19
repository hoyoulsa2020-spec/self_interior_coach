"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";

type EstimateReview = {
  id: string;
  user_id: string;
  title: string;
  content: string | null;
  file_urls: string[];
  status: string;
  answer: string | null;
  answer_file_urls: string[];
  answered_at: string | null;
  created_at: string;
  profiles?: { name: string; email: string; phone: string } | null;
};

function normalizeReview(row: Record<string, unknown>): EstimateReview {
  const profiles = row.profiles;
  const profileObj = Array.isArray(profiles) && profiles.length > 0
    ? (profiles[0] as { name: string; email: string; phone: string })
    : (profiles as { name: string; email: string; phone: string } | null) ?? null;
  return { ...row, profiles: profileObj } as EstimateReview;
}

const PAGE_SIZE = 20;

function Lightbox({ urls, index, onClose }: { urls: string[]; index: number; onClose: () => void }) {
  const [cur, setCur] = useState(index);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setCur((c) => Math.min(c + 1, urls.length - 1));
      if (e.key === "ArrowLeft") setCur((c) => Math.max(c - 1, 0));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [urls.length, onClose]);
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85" onClick={onClose}>
      <button onClick={onClose} className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      {urls.length > 1 && <>
        <button onClick={(e) => { e.stopPropagation(); setCur((c) => Math.max(c - 1, 0)); }} disabled={cur === 0}
          className="absolute left-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 disabled:opacity-30">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <button onClick={(e) => { e.stopPropagation(); setCur((c) => Math.min(c + 1, urls.length - 1)); }} disabled={cur === urls.length - 1}
          className="absolute right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 disabled:opacity-30">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </>}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={urls[cur]} alt="" onClick={(e) => e.stopPropagation()} className="max-h-[85vh] max-w-[90vw] rounded-xl object-contain shadow-2xl" />
      {urls.length > 1 && <p className="absolute bottom-4 text-xs text-white/60">{cur + 1} / {urls.length}</p>}
    </div>
  );
}
const ACCEPT_TYPES = "image/*,.xlsx,.xls,.csv,.pdf";

function FileIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["xlsx","xls","csv"].includes(ext))
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-green-600">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    );
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500">
      <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function isImage(url: string) { return /\.(png|jpg|jpeg|gif|webp)(\?|$)/i.test(url); }
function fileName(url: string) {
  return decodeURIComponent(url.split("/").pop()?.split("?")[0] ?? url).replace(/^\d+_[\w]+\./, "파일.");
}

export default function AdminEstimatesPage() {
  const [adminId, setAdminId] = useState<string | null>(null);
  const [reviews, setReviews] = useState<EstimateReview[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all"|"pending"|"reviewed">("all");

  const [detail, setDetail] = useState<EstimateReview | null>(null);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [answerFiles, setAnswerFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { window.location.href = "/login"; return; }
      setAdminId(data.session.user.id);
      const { data: p } = await supabase.from("profiles").select("role").eq("user_id", data.session.user.id).maybeSingle();
      if (p?.role !== "admin" && p?.role !== "super_admin") window.location.href = "/login";
    };
    check();
  }, []);

  const fetchReviews = useCallback(async () => {
    setIsLoading(true);
    const from = (currentPage - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    let query = supabase
      .from("estimate_reviews")
      .select(`id, user_id, title, content, file_urls, status, answer, answer_file_urls, answered_at, created_at,
        profiles!estimate_reviews_user_id_profiles_fkey(name, email, phone)`, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);
    if (appliedSearch.trim()) query = query.ilike("title", `%${appliedSearch.trim()}%`);
    if (statusFilter !== "all") query = query.eq("status", statusFilter);
    const { data, count, error } = await query;
    if (error) console.error("견적서 검토 조회 오류:", error.message, error.details, error.hint);
    setReviews((data ?? []).map(normalizeReview));
    setTotalCount(count ?? 0);
    setIsLoading(false);
  }, [currentPage, appliedSearch, statusFilter]);

  useEffect(() => { fetchReviews(); }, [fetchReviews]);

  const handleSearch = () => { setCurrentPage(1); setAppliedSearch(search); };

  const addFiles = (files: File[]) => {
    const valid = files.filter((f) =>
      f.type.startsWith("image/") ||
      ["xlsx","xls","csv","pdf"].includes(f.name.split(".").pop()?.toLowerCase() ?? "")
    );
    setAnswerFiles((prev) => [...prev, ...valid]);
  };

  const openDetail = (r: EstimateReview) => {
    setDetail(r);
    setAnswerText(r.answer ?? "");
    setAnswerFiles([]);
    setSaveError(null);
  };

  const saveAnswer = async () => {
    if (!detail || !adminId) return;
    if (!answerText.trim() && answerFiles.length === 0) {
      setSaveError("답변 내용 또는 파일을 입력해주세요."); return;
    }
    setSaveError(null);
    setIsSaving(true);

    // 기존 답변 파일 유지 + 새 파일 업로드
    const newUrls: string[] = [];
    for (const file of answerFiles) {
      const ext = file.name.split(".").pop();
      const path = `answers/${adminId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("estimate-files").upload(path, file);
      if (uploadError) { setSaveError(`업로드 오류: ${uploadError.message}`); setIsSaving(false); return; }
      const { data: urlData } = supabase.storage.from("estimate-files").getPublicUrl(path);
      newUrls.push(urlData.publicUrl);
    }

    const allAnswerFiles = [...(detail.answer_file_urls ?? []), ...newUrls];

    const { error } = await supabase.from("estimate_reviews").update({
      answer: answerText.trim() || null,
      answer_file_urls: allAnswerFiles,
      status: "reviewed",
      answered_at: new Date().toISOString(),
    }).eq("id", detail.id);

    if (error) { setSaveError(error.message); setIsSaving(false); return; }

    const updated = { ...detail, answer: answerText.trim() || null, answer_file_urls: allAnswerFiles, status: "reviewed", answered_at: new Date().toISOString() };
    setAnswerFiles([]);
    setReviews((prev) => prev.map((r) => r.id === detail.id ? updated : r));
    setIsSaving(false);
    setDetail(null);
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-800">견적서 검토 관리</h1>
        <p className="mt-0.5 text-sm text-gray-500">고객이 업로드한 타사 견적서를 검토하고 답변합니다.</p>
      </div>

      {/* 검색 + 필터 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <input type="text" placeholder="제목으로 검색" value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm outline-none placeholder:text-gray-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 sm:w-64" />
          <button onClick={handleSearch}
            className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700">검색</button>
        </div>
        <div className="flex items-center gap-2">
          {(["all","pending","reviewed"] as const).map((s) => (
            <button key={s} type="button"
              onClick={() => { setStatusFilter(s); setCurrentPage(1); }}
              className={`rounded-xl px-3 py-1.5 text-xs font-medium transition ${statusFilter === s ? "bg-indigo-600 text-white" : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}>
              {s === "all" ? "전체" : s === "pending" ? "검토대기" : "검토완료"}
            </button>
          ))}
          <span className="text-xs text-gray-400">총 {totalCount}건</span>
        </div>
      </div>

      {/* 테이블 */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          </div>
        ) : reviews.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">{appliedSearch ? "검색 결과가 없습니다." : "검토 요청이 없습니다."}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold text-gray-500">
                  <th className="px-4 py-3">상태</th>
                  <th className="px-4 py-3">제목</th>
                  <th className="hidden px-4 py-3 sm:table-cell">고객명</th>
                  <th className="hidden px-4 py-3 md:table-cell">등록일</th>
                  <th className="hidden px-4 py-3 lg:table-cell">검토완료일</th>
                  <th className="px-4 py-3">검토</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reviews.map((r) => (
                  <tr key={r.id} className="cursor-pointer transition hover:bg-gray-50" onClick={() => openDetail(r)}>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${r.status === "reviewed" ? "bg-blue-50 text-blue-700" : "bg-yellow-50 text-yellow-700"}`}>
                        {r.status === "reviewed" ? "검토완료" : "검토대기"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-gray-800 line-clamp-1">{r.title}</span>
                        {r.file_urls?.length > 0 && <span className="text-xs text-gray-400">📎{r.file_urls.length}</span>}
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 text-gray-500 sm:table-cell">{r.profiles?.name || "—"}</td>
                    <td className="hidden px-4 py-3 text-gray-400 md:table-cell">{new Date(r.created_at).toLocaleDateString("ko-KR")}</td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      {r.answered_at
                        ? <span className="text-xs text-blue-600">{new Date(r.answered_at).toLocaleDateString("ko-KR")}</span>
                        : <span className="text-xs text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <button type="button" onClick={(e) => { e.stopPropagation(); openDetail(r); }}
                        className={`rounded-lg px-3 py-1 text-xs font-medium transition ${r.status === "reviewed" ? "border border-blue-100 bg-blue-50 text-blue-600 hover:bg-blue-100" : "border border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100"}`}>
                        {r.status === "reviewed" ? "수정" : "검토하기"}
                      </button>
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

      {/* ── 검토 답변 모달 ── */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="flex w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl" style={{ maxHeight: "90vh" }}>
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${detail.status === "reviewed" ? "bg-blue-50 text-blue-700" : "bg-yellow-50 text-yellow-700"}`}>
                    {detail.status === "reviewed" ? "검토완료" : "검토대기"}
                  </span>
                  <h3 className="text-sm font-semibold text-gray-800">{detail.title}</h3>
                </div>
                <p className="mt-0.5 text-xs text-gray-400">{detail.profiles?.name} · {new Date(detail.created_at).toLocaleString("ko-KR")}</p>
              </div>
              <button type="button" onClick={() => setDetail(null)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {/* 고객 첨부 파일 */}
              <div>
                <p className="mb-2 text-xs font-medium text-gray-500">고객 첨부 파일 ({detail.file_urls?.length ?? 0}개)</p>
                <div className="space-y-2">
                  {(() => {
                    const imageUrls = (detail.file_urls ?? []).filter(isImage);
                    return (detail.file_urls ?? []).map((url, i) => isImage(url) ? (
                      <button key={i} type="button" className="w-full"
                        onClick={() => setLightbox({ urls: imageUrls, index: imageUrls.indexOf(url) })}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={`첨부${i+1}`} className="w-full rounded-xl border border-gray-100 object-cover hover:opacity-90 transition" style={{ maxHeight: 200 }} />
                      </button>
                    ) : (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-700 hover:bg-gray-100">
                        <FileIcon name={url} />
                        <span className="flex-1 truncate text-xs">{fileName(url)}</span>
                        <svg className="shrink-0 text-gray-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                      </a>
                    ));
                  })()}
                </div>
              </div>

              {/* 고객 요청 내용 */}
              {detail.content && (
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="mb-1 text-xs font-medium text-gray-500">요청 내용</p>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{detail.content}</p>
                </div>
              )}

              <hr className="border-gray-100" />

              {/* 검토 답변 텍스트 */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-600">검토 답변</label>
                <textarea value={answerText} onChange={(e) => setAnswerText(e.target.value)}
                  placeholder="검토 의견을 입력해주세요." rows={4}
                  className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm outline-none placeholder:text-gray-400 focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100" />
              </div>

              {/* 답변 파일 첨부 */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-600">수정 견적서 첨부 (선택)</label>

                {/* 기존 답변 파일 */}
                {detail.answer_file_urls?.length > 0 && (
                  <div className="mb-2 space-y-1.5">
                    {detail.answer_file_urls.map((url, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2">
                        <FileIcon name={url} />
                        <span className="flex-1 truncate text-xs text-gray-700">{fileName(url)}</span>
                        <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">보기</a>
                      </div>
                    ))}
                  </div>
                )}

                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => { e.preventDefault(); setIsDragging(false); addFiles(Array.from(e.dataTransfer.files)); }}
                  className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed py-5 transition
                    ${isDragging ? "border-indigo-400 bg-indigo-50 text-indigo-500" : "border-gray-200 text-gray-400 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-500"}`}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="16 16 12 12 8 16" /><line x1="12" y1="12" x2="12" y2="21" />
                    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
                  </svg>
                  <p className="mt-1.5 text-xs">{isDragging ? "여기에 놓으세요!" : "파일 드래그 또는 클릭"}</p>
                </div>
                <input ref={fileInputRef} type="file" accept={ACCEPT_TYPES} multiple className="hidden"
                  onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />

                {answerFiles.length > 0 && (
                  <ul className="mt-2 space-y-1.5">
                    {answerFiles.map((file, i) => (
                      <li key={i} className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                        <FileIcon name={file.name} />
                        <span className="flex-1 truncate text-xs text-gray-700">{file.name}</span>
                        <button type="button" onClick={() => setAnswerFiles((prev) => prev.filter((_, j) => j !== i))}
                          className="text-gray-300 hover:text-red-500">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {saveError && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{saveError}</p>}
            </div>

            <div className="flex gap-2 border-t border-gray-100 px-5 py-4">
              <button type="button" onClick={() => setDetail(null)}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm text-gray-600 hover:bg-gray-50">닫기</button>
              <button type="button" onClick={saveAnswer} disabled={isSaving}
                className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                {isSaving ? "저장 중..." : detail.status === "reviewed" ? "검토 수정" : "검토 완료"}
              </button>
            </div>
          </div>
        </div>
      )}
      {lightbox && <Lightbox urls={lightbox.urls} index={lightbox.index} onClose={() => setLightbox(null)} />}
    </div>
  );
}
