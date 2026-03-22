"use client";

import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import PushNotificationToggle from "@/app/components/PushNotificationToggle";

type ProfileOption = { user_id: string; name: string; email: string | null; business_name: string | null };

type PushLogRow = {
  id: string;
  recipient_user_id: string;
  recipient_name: string;
  recipient_email: string;
  title: string;
  body: string | null;
  url: string | null;
  tag: string | null;
  source: string;
  status: string;
  created_at: string;
};

const SOURCE_LABELS: Record<string, string> = {
  "admin-send": "관리자 발송",
  "chat-reply": "채팅 답변",
  "chat-notify": "채팅 알림(관리자용)",
  "consumer-provider-chat-notify": "시공업체/소비자 채팅",
};

export default function AdminPushPage() {
  const [title, setTitle] = useState("셀인코치");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("/");
  const [userId, setUserId] = useState("");
  const [nameQuery, setNameQuery] = useState("");
  const [nameResults, setNameResults] = useState<ProfileOption[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedUser, setSelectedUser] = useState<ProfileOption | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subsCount, setSubsCount] = useState<number | null>(null);
  const [logs, setLogs] = useState<PushLogRow[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsExpanded, setLogsExpanded] = useState(true);
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 구독자 수 조회
  const fetchSubsCount = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    const res = await fetch("/api/push/subscriptions-count", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const data = await res.json();
    if (res.ok) setSubsCount(data.count ?? 0);
  };

  useEffect(() => {
    fetchSubsCount();
    const interval = setInterval(fetchSubsCount, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchLogs = async () => {
    setLogsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/push/logs?limit=${pageSize}&page=${page}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setLogs(data.logs ?? []);
        setTotal(data.total ?? 0);
        setTotalPages(data.totalPages ?? 0);
      }
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, pageSize]);

  // 이름 검색 (디바운스)
  useEffect(() => {
    if (!nameQuery.trim()) {
      setNameResults([]);
      setShowDropdown(false);
      return;
    }
    const t = setTimeout(async () => {
      const q = nameQuery.trim();
      const { data } = await supabase
        .from("profiles")
        .select("user_id, name, email, business_name")
        .or(`name.ilike.%${q}%,business_name.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(10);
      setNameResults((data ?? []) as ProfileOption[]);
      setShowDropdown(true);
    }, 300);
    return () => clearTimeout(t);
  }, [nameQuery]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  const selectUser = (p: ProfileOption) => {
    setUserId(p.user_id);
    setSelectedUser(p);
    setNameQuery("");
    setNameResults([]);
    setShowDropdown(false);
  };

  const clearUser = () => {
    setUserId("");
    setSelectedUser(null);
    setNameQuery("");
  };

  const handleSend = async () => {
    if (!body.trim()) {
      setError("내용을 입력해주세요.");
      return;
    }
    setError(null);
    setResult(null);
    setIsSending(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError("로그인이 필요합니다.");
        setIsSending(false);
        return;
      }

      const res = await fetch("/api/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          title: title.trim() || "셀인코치",
          body: body.trim(),
          url: url.trim() || "/",
          userId: userId.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "발송에 실패했습니다.");
        setIsSending(false);
        return;
      }

      setResult({ sent: data.sent ?? 0, failed: data.failed ?? 0 });
      fetchLogs();
    } catch (e) {
      console.error(e);
      setError("발송 중 오류가 발생했습니다.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-800">푸시 알림 발송</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          전체 구독자 또는 특정 사용자에게 푸시 알림을 보냅니다.
        </p>
      </div>

      {/* 구독자 수 + 관리자 본인 푸시 구독 */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">내 푸시 알림</h2>
          {subsCount !== null && (
            <span className="text-xs text-gray-500">전체 구독자: <strong>{subsCount}명</strong></span>
          )}
        </div>
        <p className="mb-3 text-xs text-gray-500">발송 테스트를 위해 본인도 푸시를 켜두세요. 토글 켜면 DB에 저장됩니다.</p>
        <PushNotificationToggle />
        <button
          type="button"
          onClick={fetchSubsCount}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
            <path d="M16 21h5v-5" />
          </svg>
          구독자 수 새로고침
        </button>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">제목</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="셀인코치"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">내용 *</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="알림 내용을 입력하세요"
              rows={3}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">클릭 시 이동 URL</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="/"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <div ref={dropdownRef} className="relative">
            <label className="mb-1 block text-xs font-medium text-gray-500">특정 사용자 (이름/업체명/이메일 검색, 비우면 전체 발송)</label>
            {selectedUser ? (
              <div className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2.5">
                <span className="text-sm font-medium text-indigo-800">
                  {selectedUser.business_name || selectedUser.name || selectedUser.email || "—"}
                </span>
                {selectedUser.business_name && selectedUser.name && (
                  <span className="text-xs text-indigo-600">({selectedUser.name})</span>
                )}
                <button
                  type="button"
                  onClick={clearUser}
                  className="ml-auto rounded p-1 text-indigo-500 hover:bg-indigo-100"
                  aria-label="선택 해제"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  value={nameQuery}
                  onChange={(e) => setNameQuery(e.target.value)}
                  onFocus={() => nameResults.length > 0 && setShowDropdown(true)}
                  placeholder="이름, 업체명, 이메일 검색"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
                {showDropdown && nameResults.length > 0 && (
                  <ul className="absolute top-full left-0 right-0 z-10 mt-1 max-h-48 overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
                    {nameResults.map((p) => (
                      <li key={p.user_id}>
                        <button
                          type="button"
                          onClick={() => selectUser(p)}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-indigo-50"
                        >
                          <span className="font-medium text-gray-800">
                            {p.business_name || p.name || "—"}
                          </span>
                          {p.business_name && p.name && (
                            <span className="ml-1 text-gray-500">({p.name})</span>
                          )}
                          {p.email && (
                            <span className="ml-1 block text-xs text-gray-400">{p.email}</span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}
          {result && (
            <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
              발송 완료: 성공 {result.sent}건, 실패 {result.failed}건
            </p>
          )}

          <div className="flex justify-center">
            <button
              type="button"
              onClick={handleSend}
              disabled={isSending}
              className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSending ? "발송 중..." : "발송하기"}
            </button>
          </div>
        </div>
      </div>

      {/* 발송 이력 */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setLogsExpanded((e) => !e)}
          className="flex w-full items-center justify-between px-5 py-4 text-left"
        >
          <div>
            <h2 className="text-sm font-semibold text-gray-700">발송 이력</h2>
            <p className="mt-0.5 text-xs text-gray-500">발송된 모든 푸시 메시지와 종류를 저장합니다. 총 {total}건</p>
          </div>
          <span className="text-gray-400">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${logsExpanded ? "rotate-180" : ""}`}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </button>
        {logsExpanded && (
          <div className="border-t border-gray-100 px-5 pb-5 pt-2">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">페이지당</span>
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                  className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                >
                  <option value={10}>10개</option>
                  <option value={20}>20개</option>
                  <option value={30}>30개</option>
                </select>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); fetchLogs(); }}
                  disabled={logsLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={logsLoading ? "animate-spin" : ""}>
                    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                    <path d="M16 21h5v-5" />
                  </svg>
                  {logsLoading ? "불러오는 중..." : "새로고침"}
                </button>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || logsLoading}
                  className="rounded-lg border border-gray-200 px-2 py-1 text-xs disabled:opacity-50"
                >
                  이전
                </button>
                <span className="px-2 text-xs text-gray-600">
                  {page} / {totalPages || 1}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages || 1, p + 1))}
                  disabled={page >= totalPages || logsLoading}
                  className="rounded-lg border border-gray-200 px-2 py-1 text-xs disabled:opacity-50"
                >
                  다음
                </button>
              </div>
            </div>
            {logs.length === 0 && !logsLoading ? (
              <div className="py-8 text-center text-sm text-gray-500">발송 이력이 없습니다.</div>
            ) : logs.length === 0 && logsLoading ? (
              <div className="flex py-12 items-center justify-center gap-2 text-sm text-gray-500">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                  <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                  <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                  <path d="M16 21h5v-5" />
                </svg>
                불러오는 중...
              </div>
            ) : (
              <div className="relative">
                {logsLoading && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/80 backdrop-blur-[1px]">
                    <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-gray-600 shadow-md">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                        <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                        <path d="M3 3v5h5" />
                        <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                        <path d="M16 21h5v-5" />
                      </svg>
                      불러오는 중...
                    </span>
                  </div>
                )}
                {/* 모바일: 간략 카드 목록 */}
                <div className="max-h-96 overflow-y-auto md:hidden">
                  <ul className="space-y-2">
                    {logs.map((row) => (
                      <li
                        key={row.id}
                        className={`rounded-lg border border-gray-100 px-3 py-2.5 text-xs ${row.status === "success" ? "bg-white" : "bg-red-50/50"}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-gray-500">
                            {new Date(row.created_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <span className={row.status === "success" ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                            {row.status === "success" ? "성공" : "실패"}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate font-medium text-gray-800">{row.recipient_name}</p>
                        <p className="mt-0.5 truncate text-gray-600">{(row.title || row.body || "—").slice(0, 30)}{(row.title || row.body || "").length > 30 ? "…" : ""}</p>
                        <p className="mt-0.5 text-gray-400">{SOURCE_LABELS[row.source] ?? row.source}</p>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* 데스크톱: 전체 테이블 */}
                <div className="max-h-96 overflow-y-auto hidden md:block">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-gray-50">
                      <tr>
                        <th className="w-8 px-2 py-2" />
                        <th className="px-3 py-2 font-medium text-gray-600">발송 시각</th>
                        <th className="px-3 py-2 font-medium text-gray-600">유형</th>
                        <th className="px-3 py-2 font-medium text-gray-600">수신자</th>
                        <th className="px-3 py-2 font-medium text-gray-600">제목</th>
                        <th className="px-3 py-2 font-medium text-gray-600">내용</th>
                        <th className="px-3 py-2 font-medium text-gray-600">결과</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((row) => (
                        <React.Fragment key={row.id}>
                          <tr
                            className={`cursor-pointer border-t border-gray-100 transition ${expandedRowId === row.id ? "bg-gray-50" : "hover:bg-gray-50/50"}`}
                            onClick={() => setExpandedRowId((id) => (id === row.id ? null : row.id))}
                          >
                            <td className="px-2 py-2">
                              <span className="inline-block text-gray-400">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${expandedRowId === row.id ? "rotate-90" : ""}`}>
                                  <polyline points="9 18 15 12 9 6" />
                                </svg>
                              </span>
                            </td>
                            <td className="px-3 py-2 text-gray-600">
                              {new Date(row.created_at).toLocaleString("ko-KR", {
                                month: "numeric",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </td>
                            <td className="px-3 py-2 text-gray-600">{SOURCE_LABELS[row.source] ?? row.source}</td>
                            <td className="px-3 py-2">
                              <span className="font-medium text-gray-800">{row.recipient_name}</span>
                              {row.recipient_email && row.recipient_email !== "—" && (
                                <span className="ml-1 block text-xs text-gray-500">{row.recipient_email}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-gray-700">{row.title}</td>
                            <td className="max-w-[200px] truncate px-3 py-2 text-gray-600" title={row.body ?? ""}>
                              {row.body || "—"}
                            </td>
                            <td className="px-3 py-2">
                              <span className={row.status === "success" ? "text-green-600" : "text-red-600"}>
                                {row.status === "success" ? "성공" : "실패"}
                              </span>
                            </td>
                          </tr>
                          {expandedRowId === row.id && (
                            <tr className="border-t-0 bg-gray-50/80">
                              <td colSpan={7} className="px-4 py-3">
                                <div className="space-y-1 text-xs">
                                  <p><span className="font-medium text-gray-600">제목:</span> {row.title}</p>
                                  <p><span className="font-medium text-gray-600">내용:</span> {row.body || "—"}</p>
                                  <p><span className="font-medium text-gray-600">URL:</span> {row.url || "—"}</p>
                                  <p><span className="font-medium text-gray-600">태그:</span> {row.tag || "—"}</p>
                                  <p><span className="font-medium text-gray-600">유형(source):</span> {row.source}</p>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
