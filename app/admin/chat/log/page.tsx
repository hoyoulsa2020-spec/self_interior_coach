"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { RealtimeChannel } from "@supabase/supabase-js";
import ChatImageLightbox from "@/components/ChatImageLightbox";

type Thread = {
  id: string;
  consumer_id: string;
  provider_id: string;
  updated_at: string;
  ended_at: string | null;
  ended_by: string | null;
  consumerName: string;
  providerName: string;
  lastMessagePreview?: string;
};

type Message = {
  id: string;
  content: string;
  sender_role: string;
  sender_id: string;
  created_at: string;
  image_urls?: string[] | null;
};

function formatDate(s: string) {
  const d = new Date(s);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AdminChatLogPage() {
  const router = useRouter();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showMobileDetail, setShowMobileDetail] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => { scrollToBottom(); }, [messages]);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;
      if (!session) {
        router.push("/login");
        return;
      }
      const { data: profile } = await supabase.from("profiles").select("role").eq("user_id", session.user.id).maybeSingle();
      if (!profile || !["admin", "super_admin"].includes(profile.role)) {
        router.push("/login");
        return;
      }
    };
    init();
  }, [router]);

  const loadThreads = useCallback(async () => {
    setLoading(true);
    const { data: threadData } = await supabase
      .from("consumer_provider_chat_threads")
      .select("id, consumer_id, provider_id, updated_at, ended_at, ended_by")
      .order("updated_at", { ascending: false })
      .limit(200);
    const list = threadData ?? [];
    if (list.length === 0) {
      setThreads([]);
      setLoading(false);
      return;
    }
    const consumerIds = [...new Set(list.map((t) => t.consumer_id))];
    const providerIds = [...new Set(list.map((t) => t.provider_id))];
    const { data: profileData } = await supabase
      .from("profiles")
      .select("user_id, name, business_name")
      .in("user_id", [...consumerIds, ...providerIds]);
    const profileMap = new Map((profileData ?? []).map((p) => [p.user_id, p]));

    const threadIds = list.map((t) => t.id);
    const { data: lastMsgs } = await supabase
      .from("consumer_provider_chat_messages")
      .select("thread_id, content")
      .in("thread_id", threadIds)
      .order("created_at", { ascending: false });
    const lastByThread = new Map<string, string>();
    for (const m of lastMsgs ?? []) {
      if (!lastByThread.has(m.thread_id)) {
        lastByThread.set(m.thread_id, (m.content ?? "").slice(0, 40));
      }
    }

    setThreads(
      list
        .filter((t) => lastByThread.has(t.id))
        .map((t) => {
          const consumerProf = profileMap.get(t.consumer_id);
          const providerProf = profileMap.get(t.provider_id);
          return {
            ...t,
            consumerName: consumerProf?.name?.trim() || "소비자",
            providerName: providerProf?.business_name?.trim() || providerProf?.name?.trim() || "시공업체",
            lastMessagePreview: lastByThread.get(t.id),
          };
        })
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    const ch = supabase
      .channel("admin-chat-log")
      .on("postgres_changes", { event: "*", schema: "public", table: "consumer_provider_chat_threads" }, () => loadThreads())
      .on("postgres_changes", { event: "*", schema: "public", table: "consumer_provider_chat_messages" }, () => loadThreads())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [loadThreads]);

  useEffect(() => {
    if (!selectedThread) {
      setMessages([]);
      setMessagesLoading(false);
      return;
    }
    setMessagesLoading(true);
    supabase
      .from("consumer_provider_chat_messages")
      .select("id, content, sender_role, sender_id, created_at, image_urls")
      .eq("thread_id", selectedThread.id)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        setMessages(data ?? []);
        setMessagesLoading(false);
      });
  }, [selectedThread?.id]);

  useEffect(() => {
    if (!selectedThread) return;
    const ch = supabase
      .channel(`admin-log-${selectedThread.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "consumer_provider_chat_messages", filter: `thread_id=eq.${selectedThread.id}` }, async () => {
        const { data } = await supabase
          .from("consumer_provider_chat_messages")
          .select("id, content, sender_role, sender_id, created_at, image_urls")
          .eq("thread_id", selectedThread.id)
          .order("created_at", { ascending: true });
        setMessages(data ?? []);
      })
      .subscribe();
    channelRef.current = ch;
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [selectedThread?.id]);

  const filteredThreads = threads.filter((t) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return t.consumerName.toLowerCase().includes(q) || t.providerName.toLowerCase().includes(q);
  });

  const selectThread = (t: Thread) => {
    setSelectedThread(t);
    setShowMobileDetail(true);
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col lg:flex-row lg:gap-0">
      {/* PC: 좌측 스레드 목록 / 모바일: 목록 또는 상세 */}
      <div
        className={`flex flex-col border-r border-gray-200 bg-white lg:w-80 lg:shrink-0
          ${showMobileDetail ? "hidden lg:flex" : "flex"}`}
      >
        <div className="shrink-0 border-b border-gray-100 p-3">
          <h1 className="text-base font-bold text-gray-800">채팅로그</h1>
          <p className="mt-0.5 text-xs text-gray-500">소비자-시공업체 채팅 모니터링</p>
          <input
            type="text"
            placeholder="소비자/업체명 검색"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none placeholder:text-gray-400 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            </div>
          ) : filteredThreads.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500">채팅 내역이 없습니다.</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filteredThreads.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => selectThread(t)}
                    className={`w-full px-4 py-3 text-left transition
                      ${selectedThread?.id === t.id ? "bg-indigo-50" : "hover:bg-gray-50"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-gray-800">{t.consumerName}</span>
                      <span className="shrink-0 text-[10px] text-gray-400">{formatDate(t.updated_at)}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500">
                      <span className="shrink-0">↔</span>
                      <span className="truncate">{t.providerName}</span>
                    </div>
                    {t.lastMessagePreview && (
                      <p className="mt-0.5 truncate text-[11px] text-gray-400">{t.lastMessagePreview}</p>
                    )}
                    {t.ended_at && (
                      <span className="mt-1 inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">종료</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* PC: 우측 메시지 / 모바일: 상세 보기 */}
      <div
        className={`flex flex-1 flex-col bg-gray-50 lg:bg-white
          ${showMobileDetail ? "flex" : "hidden lg:flex"}`}
      >
        {selectedThread ? (
          <>
            <div className="flex shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-4 py-3">
              <button
                type="button"
                onClick={() => setShowMobileDetail(false)}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 lg:hidden"
                aria-label="뒤로"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-sm font-semibold text-gray-800">
                  {selectedThread.consumerName} ↔ {selectedThread.providerName}
                </h2>
                <p className="text-xs text-gray-500">읽기 전용 · 실시간 갱신</p>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {messagesLoading ? (
                <div className="flex justify-center py-12">
                  <span className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
                </div>
              ) : messages.length === 0 ? (
                <div className="py-12 text-center text-sm text-gray-500">메시지가 없습니다.</div>
              ) : (
                <div className="space-y-3">
                  {messages.map((m) => {
                    const isConsumer = m.sender_role === "consumer";
                    const urls = (m.image_urls ?? []).filter(Boolean);
                    return (
                      <div key={m.id} className={`flex ${isConsumer ? "justify-start" : "justify-end"}`}>
                        <div
                          className={`max-w-[85%] rounded-2xl px-4 py-2 ${
                            isConsumer ? "bg-white text-gray-800 shadow-sm" : "bg-indigo-600 text-white"
                          }`}
                        >
                          <p className="text-[10px] font-medium opacity-80">
                            {isConsumer ? selectedThread.consumerName : selectedThread.providerName}
                          </p>
                          {m.content?.trim() && <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{m.content}</p>}
                          {urls.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {urls.map((url, i) => (
                                <button key={i} type="button" onClick={() => setLightbox({ urls, index: i })}>
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={url} alt="" className="h-16 w-16 rounded-lg object-cover" />
                                </button>
                              ))}
                            </div>
                          )}
                          <p className="mt-1 text-[10px] opacity-70">{formatDate(m.created_at)}</p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="hidden flex-1 items-center justify-center lg:flex">
            <div className="text-center text-gray-400">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-3 opacity-50">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <p className="text-sm">채팅을 선택하세요</p>
            </div>
          </div>
        )}
      </div>

      {lightbox && <ChatImageLightbox urls={lightbox.urls} index={lightbox.index} onClose={() => setLightbox(null)} />}
    </div>
  );
}
