"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Inquiry = {
  id: string;
  consumer_id: string;
  provider_id: string;
  project_id: string | null;
  project_title: string | null;
  category: string | null;
  category_subs: string[] | null;
  category_schedule_date: string | null;
  title: string;
  content: string;
  file_urls: string[];
  consumer_name: string | null;
  consumer_phone: string | null;
  consumer_email: string | null;
  status: string;
  answer: string | null;
  answer_file_urls: string[] | null;
  answered_at: string | null;
  read_at: string | null;
  created_at: string;
};

type InquiryWithProvider = Inquiry & { providerBusinessName: string };

const PAGE_SIZE = 10;

function isImageUrl(url: string): boolean {
  const ext = url.split(".").pop()?.toLowerCase().split("?")[0] ?? "";
  return ["jpg", "jpeg", "png", "gif", "webp"].includes(ext);
}

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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm" onClick={onClose}>
      <button onClick={onClose} className="absolute right-4 top-4 z-10 rounded-full bg-white/10 p-2.5 text-white transition hover:bg-white/20">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      {urls.length > 1 && (
        <>
          <button onClick={(e) => { e.stopPropagation(); setCur((c) => Math.max(c - 1, 0)); }} disabled={cur === 0}
            className="absolute left-4 z-10 rounded-full bg-white/10 p-2.5 text-white transition hover:bg-white/20 disabled:opacity-30">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <button onClick={(e) => { e.stopPropagation(); setCur((c) => Math.min(c + 1, urls.length - 1)); }} disabled={cur === urls.length - 1}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-10 rounded-full bg-white/10 p-2.5 text-white transition hover:bg-white/20 disabled:opacity-30">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={urls[cur]} alt="" onClick={(e) => e.stopPropagation()} className="max-h-[85vh] max-w-[90vw] rounded-xl object-contain shadow-2xl" />
      {urls.length > 1 && <p className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs text-white">{cur + 1} / {urls.length}</p>}
    </div>
  );
}

export default function ConsumerProviderInquiriesPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [inquiries, setInquiries] = useState<InquiryWithProvider[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [detail, setDetail] = useState<InquiryWithProvider | null>(null);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  const initializedRef = useRef(false);

  const fetchInquiries = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    const from = (currentPage - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from("consumer_provider_inquiries")
      .select("id, consumer_id, provider_id, project_id, project_title, category, category_subs, category_schedule_date, title, content, file_urls, consumer_name, consumer_phone, consumer_email, status, answer, answer_file_urls, answered_at, read_at, created_at", { count: "exact" })
      .eq("consumer_id", userId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (appliedSearch.trim()) {
      query = query.or(`title.ilike.%${appliedSearch.trim()}%,content.ilike.%${appliedSearch.trim()}%`);
    }

    const { data, count } = await query;
    const rows = (data ?? []) as Inquiry[];

    if (rows.length === 0) {
      setInquiries([]);
      setTotalCount(count ?? 0);
      setIsLoading(false);
      return;
    }

    const providerIds = [...new Set(rows.map((r) => r.provider_id))];
    const { data: profData } = await supabase
      .from("profiles")
      .select("user_id, business_name")
      .in("user_id", providerIds);
    const profMap = new Map((profData ?? []).map((r) => [r.user_id, r.business_name ?? "업체"]));

    const withProvider: InquiryWithProvider[] = rows.map((r) => ({
      ...r,
      providerBusinessName: profMap.get(r.provider_id) ?? "업체",
    }));

    setInquiries(withProvider);
    setTotalCount(count ?? 0);
    setIsLoading(false);
  }, [userId, currentPage, appliedSearch]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setUserId(data.session.user.id);
    });
  }, []);

  useEffect(() => {
    if (userId) fetchInquiries();
  }, [userId, fetchInquiries]);

  const handleSearch = () => {
    setCurrentPage(1);
    setAppliedSearch(search);
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-800">업체 문의 내역</h1>
        <p className="mt-0.5 text-sm text-gray-500">시공업체에게 보낸 문의와 답변을 확인하세요.</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="제목·내용 검색"
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
        <Link
          href="/dashboard/providers"
          className="shrink-0 rounded-xl border border-indigo-600 bg-white px-4 py-2 text-sm font-medium text-indigo-600 transition hover:bg-indigo-50"
        >
          시공업체견적확인에서 문의하기
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          </div>
        ) : inquiries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <svg className="text-gray-300" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <p className="mt-3 text-sm font-medium text-gray-400">아직 업체 문의가 없습니다.</p>
            <p className="mt-1 text-xs text-gray-300">
              <Link href="/dashboard/providers" className="text-indigo-600 hover:underline">시공업체견적확인</Link>에서 계약 완료된 업체에게 문의할 수 있습니다.
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
                      inq.status === "answered" ? "bg-blue-50 text-blue-700" : "bg-yellow-50 text-yellow-700"
                    }`}>
                      {inq.status === "answered" ? "답변완료" : "답변대기"}
                    </span>
                    <p className="truncate text-sm font-medium text-gray-800">{inq.title}</p>
                    {inq.file_urls?.length > 0 && (
                      <svg className="shrink-0 text-gray-400" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {inq.providerBusinessName}
                    {inq.project_title && <span> · {inq.project_title}</span>}
                    {inq.category && <span> · {inq.category}</span>}
                    <span> · {new Date(inq.created_at).toLocaleDateString("ko-KR")}</span>
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

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setDetail(null)}>
          <div className="flex w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl" style={{ maxHeight: "90vh" }} onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-gray-100 px-5 py-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${detail.status === "answered" ? "bg-blue-50 text-blue-700" : "bg-yellow-50 text-yellow-700"}`}>
                      {detail.status === "answered" ? "답변완료" : "답변대기"}
                    </span>
                    <h3 className="text-sm font-semibold text-gray-800 truncate">{detail.title}</h3>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{detail.providerBusinessName} 담당</p>
                </div>
                <button type="button" onClick={() => setDetail(null)} className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {/* 요청 공정 */}
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="mb-2 text-xs font-semibold text-gray-600">요청 공정</p>
                {detail.project_title && (
                  <p className="text-sm font-medium text-gray-800">{detail.project_title}</p>
                )}
                {detail.category && (
                  <div className="mt-2">
                    <p className="text-sm font-semibold text-gray-800">{detail.category}</p>
                    {(detail.category_subs || []).length > 0 && (
                      <ul className="mt-1.5 space-y-0.5 text-sm text-gray-600">
                        {(detail.category_subs || []).map((sub) => (
                          <li key={sub} className="flex items-center gap-1.5">
                            <span className="text-gray-400">·</span>
                            {sub}
                          </li>
                        ))}
                      </ul>
                    )}
                    {detail.category_schedule_date && (
                      <p className="mt-1.5 text-sm text-gray-600">
                        <span className="text-gray-500">공정진행일자:</span> {detail.category_schedule_date}
                      </p>
                    )}
                  </div>
                )}
                {!detail.project_title && !detail.category && (
                  <p className="text-sm text-gray-500">—</p>
                )}
              </div>
              {/* 내 문의 내용 */}
              <div className="rounded-xl bg-gray-50 p-4">
                <p className="mb-1 text-xs font-semibold text-gray-600">내 문의</p>
                <p className="mb-1 text-xs text-gray-400">{new Date(detail.created_at).toLocaleString("ko-KR")}</p>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{detail.content}</p>
              </div>
              {detail.file_urls?.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-gray-500">첨부 파일</p>
                  <div className="grid grid-cols-3 gap-2">
                    {detail.file_urls.map((url, i) => {
                      if (isImageUrl(url)) {
                        const imageUrls = detail.file_urls!.filter(isImageUrl);
                        const idx = imageUrls.indexOf(url);
                        return (
                          <button key={i} type="button" onClick={() => setLightbox({ urls: imageUrls, index: idx })}
                            className="overflow-hidden rounded-xl border border-gray-100 text-left">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt={`첨부${i + 1}`} className="h-24 w-full object-cover transition hover:opacity-90" />
                          </button>
                        );
                      }
                      return (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                          </svg>
                          파일 {i + 1}
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}
              {/* 업체 답변 */}
              {detail.answer ? (
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                  <p className="mb-1 text-xs font-semibold text-blue-600">업체 답변</p>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{detail.answer}</p>
                  {(detail.answer_file_urls || []).length > 0 && (
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {(detail.answer_file_urls || []).map((url, i) => (
                        <button key={i} type="button" onClick={() => setLightbox({ urls: detail.answer_file_urls!, index: i })}
                          className="overflow-hidden rounded-lg border border-gray-100 text-left">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt={`답변첨부${i + 1}`} className="h-20 w-full object-cover transition hover:opacity-90" />
                        </button>
                      ))}
                    </div>
                  )}
                  {detail.answered_at && (
                    <p className="mt-2 text-xs text-blue-400">{new Date(detail.answered_at).toLocaleString("ko-KR")}</p>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-sm text-gray-500">아직 답변이 없습니다. 업체에서 답변할 때까지 기다려 주세요.</p>
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
      {lightbox && <Lightbox urls={lightbox.urls} index={lightbox.index} onClose={() => setLightbox(null)} />}
    </div>
  );
}
