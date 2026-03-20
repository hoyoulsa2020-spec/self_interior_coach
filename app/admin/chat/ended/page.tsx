"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ChatImageLightbox from "@/components/ChatImageLightbox";

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

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      <div className="flex w-72 shrink-0 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white">
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

      <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white">
        {selectedThread ? (
          <>
            <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3">
              <div>
                <h3 className="text-base font-semibold text-gray-800">{getThreadLabel(selectedThread)}</h3>
                <p className="text-xs text-gray-500">{getEndedByLabel(selectedThread)} · {selectedThread.ended_at && new Date(selectedThread.ended_at).toLocaleString("ko-KR")}</p>
              </div>
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
                          className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
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
    </div>
  );
}
