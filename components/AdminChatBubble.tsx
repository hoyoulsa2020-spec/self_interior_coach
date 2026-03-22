"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { compressImage } from "@/lib/imageCompress";
import ChatImageLightbox from "./ChatImageLightbox";
import AlertModal from "./AlertModal";

type Message = {
  id: string;
  content: string;
  sender_role: string;
  sender_id: string;
  created_at: string;
  image_urls?: string[] | null;
};

type AdminChatBubbleProps = {
  userRole: "consumer" | "provider";
  userId: string;
};

const isChatPage = (path: string) =>
  path.startsWith("/dashboard/chat") || path.startsWith("/dashboard/provider-chat") || path.startsWith("/provider/chat") || path.startsWith("/provider/consumer-chat");

export default function AdminChatBubble({ userRole, userId }: AdminChatBubbleProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const openRef = useRef(open);
  openRef.current = open;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  /* 모달 열림 시 body 스크롤 방지, position:fixed로 레이아웃 점프 방지 */
  useEffect(() => {
    if (open) {
      document.body.classList.add("chat-open");
      return () => document.body.classList.remove("chat-open");
    }
  }, [open]);

  const ensureThread = async () => {
    const { data: existing } = await supabase
      .from("admin_chat_threads")
      .select("id, ended_at")
      .eq("user_id", userId)
      .eq("user_role", userRole)
      .maybeSingle();

    if (existing) {
      setThreadId(existing.id);
      return existing.id;
    }

    const { data: inserted, error } = await supabase
      .from("admin_chat_threads")
      .insert({ user_id: userId, user_role: userRole })
      .select("id")
      .single();

    if (error) {
      console.error("Failed to create chat thread:", error);
      return null;
    }
    setThreadId(inserted.id);
    return inserted.id;
  };

  const loadMessages = async (tid: string) => {
    setLoading(true);
    const { data: thread } = await supabase
      .from("admin_chat_threads")
      .select("user_cleared_at, ended_at, ended_by")
      .eq("id", tid)
      .single();
    const clearedAt = thread?.user_cleared_at ?? (thread?.ended_by === "user" ? thread?.ended_at : null);
    let q = supabase
      .from("admin_chat_messages")
      .select("id, content, sender_role, sender_id, created_at, image_urls")
      .eq("thread_id", tid)
      .order("created_at", { ascending: true });
    if (clearedAt) {
      q = q.gt("created_at", clearedAt);
    }
    const { data } = await q;
    setMessages(data ?? []);
    setLoading(false);
  };

  const loadUnreadCount = async (tid: string) => {
    const { data: thread } = await supabase
      .from("admin_chat_threads")
      .select("user_read_at, user_cleared_at, ended_at, ended_by")
      .eq("id", tid)
      .single();
    const clearedAt = thread?.user_cleared_at ?? (thread?.ended_by === "user" ? thread?.ended_at : null);
    const candidates = [clearedAt, thread?.user_read_at].filter(Boolean) as string[];
    const after = candidates.length > 0 ? candidates.sort()[candidates.length - 1] : null;
    let q = supabase
      .from("admin_chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("thread_id", tid)
      .eq("sender_role", "admin");
    if (after) {
      q = q.gt("created_at", after);
    }
    const { count } = await q;
    setUnreadCount(count ?? 0);
  };

  const markUserRead = async (tid: string) => {
    await supabase
      .from("admin_chat_threads")
      .update({ user_read_at: new Date().toISOString() })
      .eq("id", tid);
    setUnreadCount(0);
  };

  useEffect(() => {
    if (!userId) return;

    const init = async () => {
      const tid = await ensureThread();
      if (tid) {
        await loadUnreadCount(tid);

        channelRef.current = supabase
          .channel(`admin-chat-${tid}`)
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "admin_chat_messages", filter: `thread_id=eq.${tid}` },
            async (payload) => {
              const role = (payload.new as { sender_role?: string })?.sender_role;
              if (openRef.current) {
                await loadMessages(tid);
                if (role === "admin") await markUserRead(tid);
              } else if (role === "admin") {
                await loadUnreadCount(tid);
              }
            }
          )
          .subscribe();
      }
    };
    init();
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [userId, userRole]);

  useEffect(() => {
    if (!open || !threadId) return;
    loadMessages(threadId);
    markUserRead(threadId);
  }, [open, threadId]);

  const sendMessage = async () => {
    const text = input.trim();
    const hasImages = pendingImages.length > 0;
    if ((!text && !hasImages) || !threadId || sending) return;

    setSending(true);

    const imageUrls: string[] = [];
    for (const file of pendingImages) {
      const blob = await compressImage(file);
      const ext = "jpg";
      const path = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
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
      thread_id: threadId,
      sender_id: userId,
      sender_role: userRole,
      content: text || " ",
      image_urls: imageUrls.length > 0 ? imageUrls : undefined,
    });

    if (!error) {
      // 초기화 후 새 메시지 전송 시 실시간 채팅으로 복귀
      await supabase
        .from("admin_chat_threads")
        .update({ ended_at: null, ended_by: null })
        .eq("id", threadId);
      setInput("");
      setPendingImages([]);
      await markUserRead(threadId);
      await loadMessages(threadId);
      try {
        const { data } = await supabase.auth.getSession();
        const session = data?.session;
        if (session?.access_token) {
          await fetch("/api/push/chat-notify", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
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


  const chatHref = userRole === "consumer" ? "/dashboard/chat" : "/provider/chat";
  const bubbleClass = `fixed right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition active:scale-95 sm:right-6 ${isChatPage(pathname ?? "") ? "bottom-[calc(8rem+var(--safe-bottom))] sm:bottom-[calc(12rem+var(--safe-bottom))]" : "bottom-[calc(3rem+var(--safe-bottom))] sm:bottom-[calc(3.5rem+var(--safe-bottom))]"}`;

  return (
    <>
      {/* 모바일: Link로 채팅 페이지 이동 (전체화면). 데스크톱: 버튼 + 모달 */}
      <Link
        href={chatHref}
        className={`${bubbleClass} bg-indigo-600 hover:bg-indigo-700 sm:hidden`}
        aria-label="셀인코치에 문의하기"
      >
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </Link>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${bubbleClass} hidden bg-indigo-600 hover:bg-indigo-700 sm:flex`}
        aria-label="셀인코치에 문의하기"
      >
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>

      {/* PC 전용: 채팅 모달 */}
      {open && (
        <div className="chat-modal-container">
          <div className="absolute inset-0 bg-black/30 sm:bg-black/40" onClick={() => setOpen(false)} aria-hidden />
          <div
            className="chat-app-shell relative z-10 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header: shrink-0, 항상 고정 */}
            <div className="chat-app-shell-header flex items-center justify-between px-4 py-3">
              <h3 className="text-base font-semibold text-gray-800">셀인코치</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100"
                aria-label="닫기"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* MessageList: flex-1 min-height-0, 이 영역만 스크롤 */}
            <div className="chat-app-shell-messages p-4">
              {loading ? (
                <div className="flex justify-center py-8 text-sm text-gray-500">메시지 불러오는 중...</div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center text-sm text-gray-500">
                  <p>셀인코치에 메시지를 보내보세요.</p>
                  <p className="mt-1 text-xs">빠른 시일 내에 답변 드리겠습니다.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {messages.map((m) => {
                    const isMe = m.sender_role === userRole;
                    const urls = (m.image_urls ?? []).filter(Boolean);
                    return (
                      <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[90%] min-w-0 rounded-2xl px-4 py-2.5 text-sm sm:max-w-[80%] ${
                            isMe ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-800"
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
                                  className="overflow-hidden rounded-lg border border-white/20 touch-manipulation"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={url} alt="" className="h-12 w-12 sm:h-14 sm:w-14 object-cover" />
                                </button>
                              ))}
                            </div>
                          )}
                          <p className={`mt-1 text-[10px] ${isMe ? "text-indigo-200" : "text-gray-400"}`}>
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

            {/* Composer: shrink-0, 하단 고정, safe-area 반영 */}
            <div className="chat-app-shell-composer p-3">
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
          </div>
        </div>
      )}
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
    </>
  );
}
