"use client";

import { useState, useEffect, useRef } from "react";
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

type UserChatPageProps = {
  userRole: "consumer" | "provider";
  userId: string;
};

export default function UserChatPage({ userRole, userId }: UserChatPageProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showEndedMessage, setShowEndedMessage] = useState(false);
  const [resetting, setResetting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const ensureThread = async () => {
    const { data: existing } = await supabase
      .from("admin_chat_threads")
      .select("id, ended_at, ended_by")
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
    if (error) return null;
    setThreadId(inserted.id);
    return inserted.id;
  };

  const getClearedAt = (thread: { user_cleared_at?: string | null; ended_at?: string | null; ended_by?: string | null } | null) =>
    thread?.user_cleared_at ?? (thread?.ended_by === "user" ? thread?.ended_at : null);

  const loadMessages = async (tid: string) => {
    setLoading(true);
    const { data: thread } = await supabase
      .from("admin_chat_threads")
      .select("user_cleared_at, ended_at, ended_by")
      .eq("id", tid)
      .single();
    const clearedAt = getClearedAt(thread);
    let q = supabase
      .from("admin_chat_messages")
      .select("id, content, sender_role, sender_id, created_at, image_urls")
      .eq("thread_id", tid)
      .order("created_at", { ascending: true });
    if (clearedAt) q = q.gt("created_at", clearedAt);
    const { data } = await q;
    setMessages(data ?? []);
    setLoading(false);
  };

  const markUserRead = async (tid: string) => {
    await supabase.from("admin_chat_threads").update({ user_read_at: new Date().toISOString() }).eq("id", tid);
  };

  const handleResetChat = async () => {
    if (!threadId || resetting) return;
    setResetting(true);
    const clearedAt = new Date().toISOString();
    const { error } = await supabase
      .from("admin_chat_threads")
      .update({ ended_at: clearedAt, ended_by: "user", user_cleared_at: clearedAt })
      .eq("id", threadId);
    setResetting(false);
    setShowResetConfirm(false);
    if (!error) {
      setMessages([]);
      setShowEndedMessage(true);
    } else {
      setAlertMessage("채팅 종료에 실패했습니다.");
    }
  };

  useEffect(() => {
    if (!userId) return;
    const init = async () => {
      const tid = await ensureThread();
      if (tid) {
        await loadMessages(tid);
        channelRef.current = supabase
          .channel(`user-chat-${tid}`)
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "admin_chat_messages", filter: `thread_id=eq.${tid}` },
            async () => {
              await loadMessages(tid);
              await markUserRead(tid);
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

  const sendMessage = async () => {
    const text = input.trim();
    const hasImages = pendingImages.length > 0;
    if ((!text && !hasImages) || !threadId || sending) return;
    setSending(true);
    const imageUrls: string[] = [];
    for (const file of pendingImages) {
      const blob = await compressImage(file);
      const path = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
      const { error: uploadError } = await supabase.storage.from("chat-images").upload(path, blob, { contentType: "image/jpeg" });
      if (uploadError) {
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
      await supabase.from("admin_chat_threads").update({ ended_at: null, ended_by: null }).eq("id", threadId);
      setInput("");
      setPendingImages([]);
      await markUserRead(threadId);
      await loadMessages(threadId);
      try {
        const { data } = await supabase.auth.getSession();
        if (data?.session?.access_token) {
          await fetch("/api/push/chat-notify", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
          });
        }
      } catch {
        /* ignore */
      }
    }
    setSending(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/"));
    setPendingImages((prev) => {
      const next = [...prev, ...files].slice(0, 3);
      if (prev.length + files.length > 3) setAlertMessage("사진은 최대 3장까지만 가능합니다.");
      return next;
    });
    e.target.value = "";
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3">
        <h2 className="text-base font-semibold text-gray-800">셀인코치</h2>
        <button
          type="button"
          onClick={() => setShowResetConfirm(true)}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 transition hover:bg-gray-100"
        >
          채팅 종료
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
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
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${isMe ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-800"}`}>
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
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
      <div className="shrink-0 border-t border-gray-200 p-3">
        {pendingImages.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {pendingImages.map((f, i) => (
              <div key={i} className="relative">
                <img src={URL.createObjectURL(f)} alt="" className="h-12 w-12 rounded-lg object-cover" />
                <button type="button" onClick={() => setPendingImages((p) => p.filter((_, j) => j !== i))} className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white">×</button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={pendingImages.length >= 3} className="shrink-0 rounded-xl border border-gray-200 px-3 py-2.5 text-gray-500 hover:bg-gray-50 disabled:opacity-50">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
          </button>
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()} placeholder="메시지를 입력하세요..." className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
          <button type="button" onClick={sendMessage} disabled={(!input.trim() && pendingImages.length === 0) || sending} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            전송
          </button>
        </div>
      </div>
      {lightbox && <ChatImageLightbox urls={lightbox.urls} index={lightbox.index} onClose={() => setLightbox(null)} />}
      {alertMessage && <AlertModal message={alertMessage} onClose={() => setAlertMessage(null)} variant="warning" />}
      {showResetConfirm && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 px-4" onClick={() => setShowResetConfirm(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900">채팅 종료</h3>
            <p className="mt-2 text-sm text-gray-600">채팅을 종료하시겠습니까? 종료하신 채팅 내용은 종료된 채팅 메뉴에 보관됩니다.</p>
            <div className="mt-6 flex gap-2">
              <button type="button" onClick={() => setShowResetConfirm(false)} className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">취소</button>
              <button type="button" onClick={handleResetChat} disabled={resetting} className="flex-1 rounded-xl bg-amber-600 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50">{resetting ? "처리 중..." : "종료"}</button>
            </div>
          </div>
        </div>
      )}
      {showEndedMessage && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 px-4" onClick={() => setShowEndedMessage(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-center text-sm text-gray-700">종료하신 채팅 내용은 종료된 채팅 메뉴에 보관됩니다.</p>
            <button type="button" onClick={() => setShowEndedMessage(false)} className="mt-4 w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">확인</button>
          </div>
        </div>
      )}
    </div>
  );
}
