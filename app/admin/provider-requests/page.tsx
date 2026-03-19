"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";

type Inquiry = {
  id: string;
  user_id: string;
  title: string;
  content: string;
  image_urls: string[];
  status: string;
  answer: string | null;
  answered_at: string | null;
  created_at: string;
  profiles?: { name: string; email: string; phone: string; business_name: string } | null;
};

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

export default function ProviderRequestsPage() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "answered">("all");

  const [detail, setDetail] = useState<Inquiry | null>(null);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { window.location.href = "/login"; return; }
      const { data: profile } = await supabase
        .from("profiles").select("role").eq("user_id", data.session.user.id).maybeSingle();
      if (profile?.role !== "admin" && profile?.role !== "super_admin") {
        window.location.href = "/login";
      }
    };
    check();
  }, []);

  const fetchInquiries = useCallback(async () => {
    setIsLoading(true);
    const from = (currentPage - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from("provider_inquiries")
      .select("id, user_id, title, content, image_urls, status, answer, answered_at, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (appliedSearch.trim()) {
      query = query.ilike("title", `%${appliedSearch.trim()}%`);
    }
    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    const { data, count, error } = await query;
    if (error) {
      console.error("업체상담 조회 오류:", error.message, error.details, error.hint);
      setIsLoading(false);
      return;
    }

    const rows = (data ?? []) as Omit<Inquiry, "profiles">[];

    // 프로필 별도 조회
    const userIds = [...new Set(rows.map((r) => r.user_id))];
    let profileMap: Record<string, Inquiry["profiles"]> = {};
    if (userIds.length > 0) {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("user_id, name, email, phone, business_name")
        .in("user_id", userIds);
      (profileData ?? []).forEach((p) => {
        profileMap[p.user_id] = { name: p.name, email: p.email, phone: p.phone, business_name: p.business_name };
      });
    }

    setInquiries(rows.map((r) => ({ ...r, profiles: profileMap[r.user_id] ?? null })));
    setTotalCount(count ?? 0);
    setIsLoading(false);
  }, [currentPage, appliedSearch, statusFilter]);

  useEffect(() => { fetchInquiries(); }, [fetchInquiries]);

  const handleSearch = () => { setCurrentPage(1); setAppliedSearch(search); };

  const openDetail = (inq: Inquiry) => {
    setDetail(inq);
    setAnswerText(inq.answer ?? "");
    setSaveError(null);
  };

  const saveAnswer = async () => {
    if (!detail) return;
    if (!answerText.trim()) { setSaveError("답변 내용을 입력해주세요."); return; }
    setSaveError(null);
    setIsSaving(true);

    const { error } = await supabase
      .from("provider_inquiries")
      .update({
        answer: answerText.trim(),
        status: "answered",
        answered_at: new Date().toISOString(),
      })
      .eq("id", detail.id);

    if (error) {
      setSaveError(error.message);
      setIsSaving(false);
      return;
    }

    const updated = { ...detail, answer: answerText.trim(), status: "answered", answered_at: new Date().toISOString() };
    setInquiries((prev) => prev.map((i) => i.id === detail.id ? updated : i));
    setIsSaving(false);
    setDetail(null);
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-800">업체상담요청 관리</h1>
        <p className="mt-0.5 text-sm text-gray-500">공급업체의 문의 내역을 확인하고 답변합니다.</p>
      </div>

      {/* 검색 + 필터 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="제목으로 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm outline-none placeholder:text-gray-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 sm:w-64"
          />
          <button onClick={handleSearch}
            className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700">
            검색
          </button>
        </div>
        <div className="flex items-center gap-2">
          {(["all", "pending", "answered"] as const).map((s) => (
            <button key={s} type="button"
              onClick={() => { setStatusFilter(s); setCurrentPage(1); }}
              className={`rounded-xl px-3 py-1.5 text-xs font-medium transition ${
                statusFilter === s
                  ? "bg-indigo-600 text-white"
                  : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              }`}>
              {s === "all" ? "전체" : s === "pending" ? "답변대기" : "답변완료"}
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
        ) : inquiries.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">
            {appliedSearch ? "검색 결과가 없습니다." : "문의 내역이 없습니다."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold text-gray-500">
                  <th className="px-4 py-3">상태</th>
                  <th className="px-4 py-3">제목</th>
                  <th className="hidden px-4 py-3 sm:table-cell">업체명</th>
                  <th className="hidden px-4 py-3 md:table-cell">등록일</th>
                  <th className="hidden px-4 py-3 lg:table-cell">답변완료일</th>
                  <th className="px-4 py-3">답변</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {inquiries.map((inq) => (
                  <tr key={inq.id} className="cursor-pointer transition hover:bg-gray-50" onClick={() => openDetail(inq)}>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        inq.status === "answered" ? "bg-blue-50 text-blue-700" : "bg-yellow-50 text-yellow-700"
                      }`}>
                        {inq.status === "answered" ? "답변완료" : "답변대기"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-gray-800 line-clamp-1">{inq.title}</span>
                        {inq.image_urls?.length > 0 && (
                          <svg className="shrink-0 text-gray-400" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <polyline points="21 15 16 10 5 21" />
                          </svg>
                        )}
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 text-gray-500 sm:table-cell">
                      {inq.profiles?.business_name || inq.profiles?.name || "—"}
                    </td>
                    <td className="hidden px-4 py-3 text-gray-400 md:table-cell">
                      {new Date(inq.created_at).toLocaleDateString("ko-KR")}
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      {inq.answered_at
                        ? <span className="text-xs text-blue-600">{new Date(inq.answered_at).toLocaleDateString("ko-KR")}</span>
                        : <span className="text-xs text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); openDetail(inq); }}
                        className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
                          inq.status === "answered"
                            ? "border border-blue-100 bg-blue-50 text-blue-600 hover:bg-blue-100"
                            : "border border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
                        }`}
                      >
                        {inq.status === "answered" ? "수정" : "답변하기"}
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
                if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
                acc.push(p); return acc;
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

      {/* 답변 모달 */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="flex w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl" style={{ maxHeight: "90vh" }}>
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${detail.status === "answered" ? "bg-blue-50 text-blue-700" : "bg-yellow-50 text-yellow-700"}`}>
                    {detail.status === "answered" ? "답변완료" : "답변대기"}
                  </span>
                  <h3 className="text-sm font-semibold text-gray-800">{detail.title}</h3>
                </div>
                <p className="mt-0.5 text-xs text-gray-400">
                  {detail.profiles?.business_name || detail.profiles?.name} · {new Date(detail.created_at).toLocaleString("ko-KR")}
                </p>
              </div>
              <button type="button" onClick={() => setDetail(null)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div className="rounded-xl bg-gray-50 p-4">
                <p className="mb-1 text-xs font-medium text-gray-500">문의 내용</p>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{detail.content}</p>
              </div>

              {detail.image_urls?.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-gray-500">첨부 이미지 ({detail.image_urls.length}장)</p>
                  <div className="grid grid-cols-3 gap-2">
                    {detail.image_urls.map((url, i) => (
                      <button key={i} type="button" onClick={() => setLightbox({ urls: detail.image_urls, index: i })}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={`첨부${i + 1}`} className="h-24 w-full rounded-xl object-cover border border-gray-100 hover:opacity-90 transition" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-600">
                  답변 내용 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={answerText}
                  onChange={(e) => setAnswerText(e.target.value)}
                  placeholder="업체에게 전달할 답변을 입력해주세요."
                  rows={6}
                  className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm outline-none placeholder:text-gray-400 focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              {saveError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{saveError}</p>
              )}
            </div>

            <div className="flex gap-2 border-t border-gray-100 px-5 py-4">
              <button type="button" onClick={() => setDetail(null)}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm text-gray-600 hover:bg-gray-50">
                닫기
              </button>
              <button type="button" onClick={saveAnswer} disabled={isSaving}
                className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                {isSaving ? "저장 중..." : detail.status === "answered" ? "답변 수정" : "답변 등록"}
              </button>
            </div>
          </div>
        </div>
      )}
      {lightbox && <Lightbox urls={lightbox.urls} index={lightbox.index} onClose={() => setLightbox(null)} />}
    </div>
  );
}
