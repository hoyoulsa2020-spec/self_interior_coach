"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ChatImageLightbox from "./ChatImageLightbox";
import CollapsiblePanel from "./CollapsiblePanel";

type Message = {
  id: string;
  content: string;
  sender_role: string;
  sender_id: string;
  created_at: string;
  image_urls?: string[] | null;
};

type Thread = { id: string; ended_at: string | null; ended_by: string | null };

type UserChatEndedPageProps = {
  userRole: "consumer" | "provider";
  userId: string;
};

export default function UserChatEndedPage({ userRole, userId }: UserChatEndedPageProps) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("admin_chat_threads")
        .select("id, ended_at, ended_by")
        .eq("user_id", userId)
        .eq("user_role", userRole)
        .not("ended_at", "is", null)
        .order("ended_at", { ascending: false });
      setThreads(data ?? []);
      setLoading(false);
    };
    load();
  }, [userId, userRole]);

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

  const getEndedByLabel = (t: Thread) => {
    if (t.ended_by === "user") return "사용자 초기화";
    if (t.ended_by === "admin") return "관리자 종료";
    return "종료됨";
  };

  return (
    <CollapsiblePanel
      title="종료된 채팅 (셀인코치)"
      subtitle="초기화 또는 관리자 종료된 채팅 보관"
      defaultCollapsed={true}
      storageKey={userRole === "provider" ? "provider-admin-chat-ended" : "consumer-admin-chat-ended"}
    >
      <div className="flex min-h-[320px] gap-4 overflow-hidden">
        {/* 목록 패널 - 모바일: 선택 전 전체, 선택 시 숨김. 데스크톱: 항상 표시 */}
        <div className={`flex w-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-gray-50 md:w-56 md:shrink-0 ${selectedThread ? "hidden md:flex" : "flex"}`}>
          <div className="border-b border-gray-200 px-3 py-2">
            <h3 className="text-xs font-semibold text-gray-600">채팅 목록</h3>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-3 text-center text-xs text-gray-500">불러오는 중...</div>
            ) : threads.length === 0 ? (
              <div className="p-4 text-center text-xs text-gray-500">종료된 채팅이 없습니다.</div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {threads.map((t, i) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedThread(t)}
                      className={`w-full px-3 py-2.5 text-left text-sm transition ${selectedThread?.id === t.id ? "bg-indigo-50 text-indigo-700" : "hover:bg-white"}`}
                    >
                      <p className="font-medium">채팅 #{threads.length - i}</p>
                      <p className="mt-0.5 text-[10px] text-gray-500">
                        {t.ended_at && new Date(t.ended_at).toLocaleDateString("ko-KR")} · {getEndedByLabel(t)}
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
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="flex shrink-0 items-center gap-2 border-b border-gray-200 px-4 py-2">
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
                <p className="min-w-0 flex-1 truncate text-xs text-gray-500">
                  {getEndedByLabel(selectedThread)} · {selectedThread.ended_at && new Date(selectedThread.ended_at).toLocaleString("ko-KR")}
                </p>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {messagesLoading ? (
                  <div className="flex justify-center py-8 text-sm text-gray-500">메시지 불러오는 중...</div>
                ) : (
                  <div className="space-y-3">
                    {messages.map((m) => {
                      const isMe = m.sender_role === userRole;
                      const urls = (m.image_urls ?? []).filter(Boolean);
                      return (
                        <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[90%] min-w-0 rounded-2xl px-4 py-2.5 text-sm sm:max-w-[80%] ${isMe ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-800"}`}>
                            {m.content.trim() !== "" && m.content !== " " && <p className="whitespace-pre-wrap break-words">{m.content}</p>}
                            {urls.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {urls.map((url, i) => (
                                  <button key={url} type="button" onClick={() => setLightbox({ urls, index: i })} className="overflow-hidden rounded-lg border border-white/20">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={url} alt="" className="h-14 w-14 object-cover" />
                                  </button>
                                ))}
                              </div>
                            )}
                            <p className={`mt-1 text-[10px] ${isMe ? "text-indigo-200" : "text-gray-400"}`}>
                              {new Date(m.created_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center text-gray-500">
              <p className="text-sm">채팅을 선택하세요</p>
            </div>
          )}
        </div>
      </div>
      {lightbox && <ChatImageLightbox urls={lightbox.urls} index={lightbox.index} onClose={() => setLightbox(null)} />}
    </CollapsiblePanel>
  );
}
