"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { compressImage } from "@/lib/imageCompress";
import ChatImageLightbox from "@/components/ChatImageLightbox";
import AlertModal from "@/components/AlertModal";

type Thread = {
  id: string;
  user_id: string;
  user_role: string;
  updated_at: string;
  admin_read_at: string | null;
  ended_at: string | null;
  ended_by: string | null;
  last_sender_role?: string | null;
  profiles?: { name: string | null; business_name: string | null; email: string | null } | null;
  unreadCount?: number;
};

type Message = {
  id: string;
  content: string;
  sender_role: string;
  sender_id: string;
  created_at: string;
  image_urls?: string[] | null;
};

export default function AdminChatPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [adminId, setAdminId] = useState<string | null>(null);
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
      setAdminId(session.user.id);
    };
    init();
  }, []);

  const loadThreads = useCallback(async () => {
    setLoading(true);
    try {
      const { data: threadData } = await supabase
        .from("admin_chat_threads")
        .select("id, user_id, user_role, updated_at, admin_read_at, ended_at, ended_by, last_sender_role")
        .is("ended_at", null)
        .order("updated_at", { ascending: false });
      const rawList = threadData ?? [];
      if (rawList.length === 0) {
        setThreads([]);
        return;
      }
      const threadIds = rawList.map((t) => t.id);
      const { data: msgCounts } = await supabase
        .from("admin_chat_messages")
        .select("thread_id")
        .in("thread_id", threadIds);
      const threadIdsWithMsgs = new Set((msgCounts ?? []).map((m) => m.thread_id));
      const list = rawList.filter((t) => threadIdsWithMsgs.has(t.id));
      if (list.length === 0) {
        setThreads([]);
        return;
      }
      const userIds = [...new Set(list.map((t) => t.user_id))];
      const { data: profileData } = await supabase
        .from("profiles")
        .select("user_id, name, business_name, email")
        .in("user_id", userIds);
      const profileMap = new Map((profileData ?? []).map((p) => [p.user_id, p]));

      const unreadCounts = await Promise.all(
        list.map(async (t) => {
          let q = supabase
            .from("admin_chat_messages")
            .select("id", { count: "exact", head: true })
            .eq("thread_id", t.id)
            .in("sender_role", ["consumer", "provider"]);
          if (t.admin_read_at) {
            q = q.gt("created_at", t.admin_read_at);
          }
          const { count } = await q;
          return count ?? 0;
        })
      );

      setThreads(
        list.map((t, i) => {
          const msgCount = unreadCounts[i] ?? 0;
          const userSentLast = t.last_sender_role && ["consumer", "provider"].includes(t.last_sender_role);
          const unreadCount = msgCount > 0 ? msgCount : (userSentLast ? 1 : 0);
          return {
            ...t,
            profiles: profileMap.get(t.user_id) ?? null,
            unreadCount,
          };
        })
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  const loadMessages = async (threadId: string) => {
    setMessagesLoading(true);
    const { data } = await supabase
      .from("admin_chat_messages")
      .select("id, content, sender_role, sender_id, created_at, image_urls")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
    setMessages(data ?? []);
    setMessagesLoading(false);
  };

  useEffect(() => {
    if (!selectedThread) {
      setMessages([]);
      setMessagesLoading(false);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      return;
    }

    setMessages([]);
    setMessagesLoading(true);
    loadMessages(selectedThread.id);

    // 관리자가 채팅 열면 읽음 처리
    supabase
      .from("admin_chat_threads")
      .update({ admin_read_at: new Date().toISOString() })
      .eq("id", selectedThread.id)
      .then(() => {
        setThreads((prev) =>
          prev.map((t) =>
            t.id === selectedThread.id ? { ...t, admin_read_at: new Date().toISOString(), unreadCount: 0 } : t
          )
        );
      });

    const tid = selectedThread.id;
    const ch = supabase
      .channel(`admin-chat-${tid}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "admin_chat_messages",
          filter: `thread_id=eq.${tid}`,
        },
        async (payload) => {
          await loadMessages(tid);
          const role = (payload.new as { sender_role?: string })?.sender_role;
          if (role && role !== "admin") {
            await supabase
              .from("admin_chat_threads")
              .update({ admin_read_at: new Date().toISOString() })
              .eq("id", tid);
            setThreads((prev) =>
              prev.map((t) =>
                t.id === tid ? { ...t, admin_read_at: new Date().toISOString(), unreadCount: 0 } : t
              )
            );
          }
        }
      )
      .subscribe();
    channelRef.current = ch;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [selectedThread?.id]);

  // 다른 스레드에 새 메시지 오면 목록 새로고침 (row 뱃지 갱신)
  useEffect(() => {
    const ch = supabase
      .channel("admin-chat-all-threads")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "admin_chat_messages" },
        (payload) => {
          const threadId = (payload.new as { thread_id?: string })?.thread_id;
          if (threadId && threadId !== selectedThread?.id) {
            loadThreads();
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [selectedThread?.id, loadThreads]);

  const sendMessage = async () => {
    const text = input.trim();
    const hasImages = pendingImages.length > 0;
    if ((!text && !hasImages) || !selectedThread || !adminId || sending) return;

    setSending(true);

    const imageUrls: string[] = [];
    for (const file of pendingImages) {
      const blob = await compressImage(file);
      const path = `${adminId}/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("chat-images")
        .upload(path, blob, { contentType: "image/jpeg" });
      if (uploadError) {
        console.error("이미지 업로드 오류:", uploadError);
        setSending(false);
        return;
      }
      const { data: urlData } = supabase.storage.from("chat-images").getPublicUrl(path);
      imageUrls.push(urlData.publicUrl);
    }

    const { error } = await supabase.from("admin_chat_messages").insert({
      thread_id: selectedThread.id,
      sender_id: adminId,
      sender_role: "admin",
      content: text || " ",
      image_urls: imageUrls.length > 0 ? imageUrls : undefined,
    });

    if (!error) {
      setInput("");
      setPendingImages([]);
      await supabase
        .from("admin_chat_threads")
        .update({ admin_read_at: new Date().toISOString() })
        .eq("id", selectedThread.id);
      await loadThreads();
      try {
        const { data } = await supabase.auth.getSession();
        const session = data?.session;
        if (session?.access_token) {
          await fetch("/api/push/chat-reply", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ userId: selectedThread.user_id }),
          });
        }
      } catch {
        /* 푸시 실패해도 채팅은 정상 동작 */
      }
    }
    setSending(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/"));
    setPendingImages((prev) => {
      const next = [...prev, ...files].slice(0, 3);
      if (prev.length + files.length > 3) {
        setAlertMessage("사진은 최대 3장까지만 가능합니다.");
      }
      return next;
    });
    e.target.value = "";
  };

  const removePendingImage = (idx: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const getThreadLabel = (t: Thread) => {
    const p = t.profiles;
    const name = t.user_role === "provider" ? (p?.business_name || p?.name) : p?.name;
    const roleLabel = t.user_role === "consumer" ? "소비자" : "시공업체";
    return `${name || "알 수 없음"} (${roleLabel})`;
  };

  const [closingThreadId, setClosingThreadId] = useState<string | null>(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  const handleCloseThread = async () => {
    if (!selectedThread || closingThreadId) return;
    setClosingThreadId(selectedThread.id);
    const { count } = await supabase
      .from("admin_chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("thread_id", selectedThread.id);
    const hasMessages = (count ?? 0) > 0;
    if (!hasMessages) {
      const { error: delError } = await supabase.from("admin_chat_threads").delete().eq("id", selectedThread.id);
      setClosingThreadId(null);
      setShowCloseConfirm(false);
      if (!delError) {
        setSelectedThread(null);
        await loadThreads();
      } else {
        setAlertMessage("채팅 삭제에 실패했습니다.");
      }
      return;
    }
    const { error } = await supabase
      .from("admin_chat_threads")
      .update({ ended_at: new Date().toISOString(), ended_by: "admin" })
      .eq("id", selectedThread.id);
    setClosingThreadId(null);
    setShowCloseConfirm(false);
    if (!error) {
      setSelectedThread(null);
      await loadThreads();
    } else {
      setAlertMessage("채팅 종료에 실패했습니다.");
    }
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4 overflow-hidden">
      {/* 스레드 목록 - 모바일: 선택 전 전체, 선택 시 숨김. 데스크톱: 항상 표시 */}
      <div className={`flex w-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white md:w-72 md:shrink-0 ${selectedThread ? "hidden md:flex" : "flex"}`}>
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-800">채팅 목록</h2>
          <p className="mt-0.5 text-xs text-gray-500">소비자·시공업체와 1:1 채팅</p>
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-visible">
          {loading ? (
            <div className="p-4 text-center text-sm text-gray-500">불러오는 중...</div>
          ) : threads.length === 0 ? (
            <div className="p-4 text-center text-sm text-gray-500">채팅이 없습니다.</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {threads.map((t) => (
                <li key={t.id} className="relative">
                  <button
                    type="button"
                    onClick={() => setSelectedThread(t)}
                    className={`flex w-full items-center gap-2 px-4 py-3 text-left text-sm transition ${
                      selectedThread?.id === t.id ? "bg-indigo-50 text-indigo-700" : "hover:bg-gray-50"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{getThreadLabel(t)}</p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {new Date(t.updated_at).toLocaleString("ko-KR")}
                      </p>
                    </div>
                    {(t.unreadCount ?? 0) > 0 && (
                      <span className="shrink-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
                        {t.unreadCount! > 99 ? "99+" : t.unreadCount}
                      </span>
                    )}
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
              <h3 className="min-w-0 flex-1 truncate text-base font-semibold text-gray-800">{getThreadLabel(selectedThread)}</h3>
              <button
                type="button"
                onClick={() => setShowCloseConfirm(true)}
                className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-amber-600 transition hover:bg-amber-50"
                title="채팅 종료"
              >
                채팅 종료
              </button>
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
                <div ref={messagesEndRef} />
              </div>
              )}
            </div>

            <div className="shrink-0 border-t border-gray-200 p-3">
              {pendingImages.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1">
                  {pendingImages.map((f, i) => (
                    <div key={i} className="relative">
                      <img
                        src={URL.createObjectURL(f)}
                        alt=""
                        className="h-12 w-12 rounded-lg object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removePendingImage(i)}
                        className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleFileChange}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={pendingImages.length >= 3}
                  className="shrink-0 rounded-xl border border-gray-200 px-3 py-2.5 text-gray-500 transition hover:bg-gray-50 disabled:opacity-50"
                  title="이미지 첨부 (최대 3장)"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                </button>
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                  placeholder="메시지를 입력하세요..."
                  className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={sendMessage}
                  disabled={(!input.trim() && pendingImages.length === 0) || sending}
                  className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600"
                >
                  전송
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-gray-500">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-4 opacity-50">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <p className="text-sm">채팅을 선택하세요</p>
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
        <AlertModal
          message={alertMessage}
          onClose={() => setAlertMessage(null)}
          variant="warning"
        />
      )}
      {showCloseConfirm && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 px-4" onClick={() => setShowCloseConfirm(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900">채팅 종료</h3>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">
              이 채팅을 종료하면 종료된 채팅 목록으로 이동합니다. 계속하시겠습니까?
            </p>
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={() => setShowCloseConfirm(false)}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleCloseThread}
                disabled={!!closingThreadId}
                className="flex-1 rounded-xl bg-amber-600 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:opacity-50"
              >
                {closingThreadId ? "처리 중..." : "종료"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
