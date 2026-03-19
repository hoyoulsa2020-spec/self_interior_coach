"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import PushNotificationToggle from "@/app/components/PushNotificationToggle";

type ProfileOption = { user_id: string; name: string; email: string | null; business_name: string | null };

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
  const dropdownRef = useRef<HTMLDivElement>(null);

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

      {/* 관리자 본인 푸시 구독 (테스트용) */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">내 푸시 알림</h2>
        <p className="mb-3 text-xs text-gray-500">발송 테스트를 위해 본인도 푸시를 켜두세요.</p>
        <PushNotificationToggle />
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
    </div>
  );
}
