"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ChatImageLightbox from "@/components/ChatImageLightbox";
import AlertModal from "@/components/AlertModal";

type Thread = {
  id: string;
  user_id: string;
  user_role: string;
  updated_at: string;
  ended_at: string | null;
  ended_by: string | null;
  profiles?: { name: string | null; business_name: string | null; email: string | null } | null;
};

type Message = {
  id: string;
  content: string;
  sender_role: string;
  sender_id: string;
  created_at: string;
  image_urls?: string[] | null;
};

export default function AdminChatEndedPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  const [deletingThreadId, setDeletingThreadId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deletePasswordError, setDeletePasswordError] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;
      if (!session) {
        window.location.href = "/login";
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (!profile || !["admin", "super_admin"].includes(profile.role)) {
        window.location.href = "/login";
        return;
      }
      setUserRole(profile.role);
    };
    init();
  }, []);

  const loadThreads = async () => {
    setLoading(true);
    const { data: threadData } = await supabase
      .from("admin_chat_threads")
      .select("id, user_id, user_role, updated_at, ended_at, ended_by")
      .not("ended_at", "is", null)
      .order("ended_at", { ascending: false });
    const list = threadData ?? [];
    if (list.length === 0) {
      setThreads([]);
      setLoading(false);
      return;
    }
    const userIds = [...new Set(list.map((t) => t.user_id))];
    const { data: profileData } = await supabase
      .from("profiles")
      .select("user_id, name, business_name, email")
      .in("user_id", userIds);
    const profileMap = new Map((profileData ?? []).map((p) => [p.user_id, p]));
    setThreads(
      list.map((t) => ({
        ...t,
        profiles: profileMap.get(t.user_id) ?? null,
      }))
    );
    setLoading(false);
  };

  useEffect(() => {
    loadThreads();
  }, []);

  useEffect(() => {
    if (!selectedThread) {
      setMessages([]);
      setMessagesLoading(false);
      return;
    }
    setMessagesLoading(true);
    supabase
      .from("admin_chat_messages")
      .select("id, content, sender_role, sender_id, created_at, image_urls")
      .eq("thread_id", selectedThread.id)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        setMessages(data ?? []);
        setMessagesLoading(false);
      });
  }, [selectedThread?.id]);

  const getThreadLabel = (t: Thread) => {
    const p = t.profiles;
    const name = t.user_role === "provider" ? (p?.business_name || p?.name) : p?.name;
    const roleLabel = t.user_role === "consumer" ? "소비자" : "공급업체";
    return `${name || "알 수 없음"} (${roleLabel})`;
  };

  const getEndedByLabel = (t: Thread) => {
    if (t.ended_by === "user") return "사용자 초기화";
    if (t.ended_by === "admin") return "관리자 종료";
    return "종료됨";
  };

  const handleDeleteThread = async () => {
    if (!selectedThread || deletingThreadId) return;
    setDeletePasswordError(null);
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData?.session;
    const email = session?.user?.email;
    if (!email) {
      setAlertMessage("이메일 로그인 계정만 삭제할 수 있습니다.");
      return;
    }
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: deletePassword });
    if (signInError) {
      setDeletePasswordError("비밀번호 확인해주세요");
      return;
    }
    setDeletingThreadId(selectedThread.id);
    const { error } = await supabase.from("admin_chat_threads").delete().eq("id", selectedThread.id);
    setDeletingThreadId(null);
    setShowDeleteConfirm(false);
    setDeletePassword("");
    if (!error) {
      setSelectedThread(null);
      await loadThreads();
    } else {
      setAlertMessage("채팅 삭제에 실패했습니다.");
    }
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4 overflow-hidden">
      {/* 목록 패널 - 모바일: 선택 전 전체, 선택 시 숨김. 데스크톱: 항상 표시 */}
      <div className={`flex w-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white md:w-72 md:shrink-0 ${selectedThread ? "hidden md:flex" : "flex"}`}>
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-800">종료된 채팅</h2>
          <p className="mt-0.5 text-xs text-gray-500">사용자 초기화 또는 관리자 종료된 채팅 로그</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-sm text-gray-500">불러오는 중...</div>
          ) : threads.length === 0 ? (
            <div className="p-4 text-center text-sm text-gray-500">종료된 채팅이 없습니다.</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {threads.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedThread(t)}
                    className={`relative w-full px-4 py-3 text-left text-sm transition ${
                      selectedThread?.id === t.id ? "bg-indigo-50 text-indigo-700" : "hover:bg-gray-50"
                    }`}
                  >
                    <p className="font-medium">{getThreadLabel(t)}</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {t.ended_at && new Date(t.ended_at).toLocaleString("ko-KR")} · {getEndedByLabel(t)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 채팅 영역 - 모바일: 선택 시 전체, 선택 전 숨김. 데스크톱: 항상 표시 */}
      <div className={`flex flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white ${selectedThread ? "flex" : "hidden md:flex"}`}>
        {selectedThread ? (
          <>
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
              <button
                type="button"
                onClick={() => setSelectedThread(null)}
                className="md:hidden shrink-0 rounded-lg p-2 text-gray-500 transition hover:bg-gray-100"
                aria-label="목록으로"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-base font-semibold text-gray-800">{getThreadLabel(selectedThread)}</h3>
                <p className="truncate text-xs text-gray-500">{getEndedByLabel(selectedThread)} · {selectedThread.ended_at && new Date(selectedThread.ended_at).toLocaleString("ko-KR")}</p>
              </div>
              {userRole === "super_admin" && (
                <button
                  type="button"
                  onClick={() => { setDeletePassword(""); setDeletePasswordError(null); setShowDeleteConfirm(true); }}
                  className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50"
                  title="채팅 완전 삭제"
                >
                  완전 삭제
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {messagesLoading ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <span className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                  <p className="mt-3 text-sm text-gray-500">채팅 불러오는 중...</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {messages.map((m) => {
                    const isAdmin = m.sender_role === "admin";
                    const urls = (m.image_urls ?? []).filter(Boolean);
                    return (
                      <div key={m.id} className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[90%] min-w-0 rounded-2xl px-4 py-2.5 text-sm sm:max-w-[75%] ${
                            isAdmin ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {m.content.trim() !== "" && m.content !== " " && (
                            <p className="whitespace-pre-wrap break-words">{m.content}</p>
                          )}
                          {urls.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {urls.map((url, i) => (
                                <button
                                  key={url}
                                  type="button"
                                  onClick={() => setLightbox({ urls, index: i })}
                                  className="overflow-hidden rounded-lg border border-white/20"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={url} alt="" className="h-14 w-14 object-cover" />
                                </button>
                              ))}
                            </div>
                          )}
                          <p className={`mt-1 text-[10px] ${isAdmin ? "text-indigo-200" : "text-gray-400"}`}>
                            {new Date(m.created_at).toLocaleString("ko-KR", {
                              month: "numeric",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-gray-500">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-4 opacity-50">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <p className="text-sm">종료된 채팅을 선택하세요</p>
          </div>
        )}
      </div>
      {lightbox && (
        <ChatImageLightbox
          urls={lightbox.urls}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      )}
      {alertMessage && (
        <AlertModal message={alertMessage} onClose={() => setAlertMessage(null)} variant="warning" />
      )}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 px-4" onClick={() => { setShowDeleteConfirm(false); setDeletePassword(""); setDeletePasswordError(null); }}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900">채팅 완전 삭제</h3>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">
              이 채팅을 완전히 삭제하면 복구할 수 없습니다. 정말 삭제하시겠습니까?
            </p>
            <p className="mt-3 text-xs text-gray-500">관리자 비밀번호를 입력하세요.</p>
            <div className="relative mt-2">
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => { setDeletePassword(e.target.value); setDeletePasswordError(null); }}
                placeholder="비밀번호"
                className={`w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-1 ${deletePasswordError ? "border-red-500 focus:border-red-500 focus:ring-red-500" : "border-gray-200 focus:border-red-500 focus:ring-red-500"}`}
                autoComplete="current-password"
              />
              {deletePasswordError && (
                <div className="absolute left-0 top-full z-10 mt-1.5">
                  <div className="relative rounded-lg bg-gray-800 px-3 py-2 text-xs text-white shadow-lg">
                    <span className="absolute -top-1.5 left-4 h-0 w-0 border-l-[6px] border-r-[6px] border-b-[6px] border-l-transparent border-r-transparent border-b-gray-800 border-t-0" />
                    {deletePasswordError}
                  </div>
                </div>
              )}
            </div>
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={() => { setShowDeleteConfirm(false); setDeletePassword(""); setDeletePasswordError(null); }}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleDeleteThread}
                disabled={!!deletingThreadId || !deletePassword.trim()}
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {deletingThreadId ? "삭제 중..." : "삭제"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
