"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ChatImageLightbox from "./ChatImageLightbox";

type Message = { id: string; content: string; sender_role: string; created_at: string; image_urls?: string[] | null };
type Thread = { id: string; consumer_id: string; provider_id: string; ended_at: string | null; ended_by: string | null };

type Props = { userRole: "consumer" | "provider"; userId: string };

export default function ConsumerProviderChatEndedPage({ userRole, userId }: Props) {
  const [threads, setThreads] = useState<(Thread & { displayName: string })[]>([]);
  const [selectedThread, setSelectedThread] = useState<(Thread & { displayName: string }) | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data: list } = await supabase
        .from("consumer_provider_chat_threads")
        .select("id, consumer_id, provider_id, ended_at, ended_by")
        .not("ended_at", "is", null)
        .order("ended_at", { ascending: false });
      const filtered = (list ?? []).filter((t) => (userRole === "consumer" ? t.consumer_id === userId : t.provider_id === userId));
      if (filtered.length === 0) {
        setThreads([]);
        setLoading(false);
        return;
      }
      const otherIds = filtered.map((t) => (userRole === "consumer" ? t.provider_id : t.consumer_id));
      const { data: profs } = await supabase.from("profiles").select("user_id, business_name, name").in("user_id", otherIds);
      let nameMap = new Map<string, string>();
      if (userRole === "consumer") {
        nameMap = new Map((profs ?? []).map((p) => [p.user_id, (p.business_name || p.name || "업체") as string]));
      } else {
        const { data: pca } = await supabase.from("project_category_assignments").select("project_id").eq("provider_id", userId).eq("match_status", "completed");
        const projIds = [...new Set((pca ?? []).map((r) => r.project_id))];
        const { data: projs } = projIds.length > 0 ? await supabase.from("projects").select("id, user_id, contact_name").in("id", projIds).in("user_id", otherIds) : { data: [] };
        const contactMap = new Map<string, string>();
        for (const p of projs ?? []) {
          const uid = (p as { user_id?: string }).user_id;
          const cn = (p as { contact_name?: string }).contact_name?.trim();
          if (uid && cn && !contactMap.has(uid)) contactMap.set(uid, cn);
        }
        for (const cid of otherIds) {
          const prof = (profs ?? []).find((pf) => pf.user_id === cid);
          const name = prof?.name?.trim() || contactMap.get(cid) || "이름 없음";
          nameMap.set(cid, name);
        }
      }
      setThreads(filtered.map((t) => ({ ...t, displayName: nameMap.get(userRole === "consumer" ? t.provider_id : t.consumer_id) || "?" })));
      setLoading(false);
    };
    load();
  }, [userId, userRole]);

  useEffect(() => {
    if (!selectedThread) { setMessages([]); return; }
    supabase
      .from("consumer_provider_chat_messages")
      .select("id, content, sender_role, created_at, image_urls")
      .eq("thread_id", selectedThread.id)
      .order("created_at", { ascending: true })
      .then(({ data }) => setMessages(data ?? []));
  }, [selectedThread?.id]);

  const getEndedByLabel = (t: Thread) => (t.ended_by === userRole ? "본인 초기화" : "상대방 초기화");

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4 overflow-hidden">
      {/* 목록 패널 - 모바일: 선택 전 전체, 선택 시 숨김. 데스크톱: 항상 표시 */}
      <div className={`flex w-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white md:w-72 md:shrink-0 ${selectedThread ? "hidden md:flex" : "flex"}`}>
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-800">종료된 채팅</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? <div className="p-4 text-center text-sm text-gray-500">불러오는 중...</div> : threads.length === 0 ? (
            <div className="p-4 text-center text-sm text-gray-500">종료된 채팅이 없습니다.</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {threads.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => setSelectedThread(t)} className={`w-full px-4 py-3 text-left text-sm ${selectedThread?.id === t.id ? "bg-emerald-50 text-emerald-700" : "hover:bg-gray-50"}`}>
                    <p className="font-medium">{t.displayName}</p>
                    <p className="mt-0.5 text-xs text-gray-500">{t.ended_at && new Date(t.ended_at).toLocaleString("ko-KR")} · {getEndedByLabel(t)}</p>
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
            <div className="flex shrink-0 items-center gap-2 border-b border-gray-200 px-4 py-3">
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
              <p className="min-w-0 flex-1 truncate text-xs text-gray-500">{getEndedByLabel(selectedThread)} · {selectedThread.ended_at && new Date(selectedThread.ended_at).toLocaleString("ko-KR")}</p>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-3">
              {messages.map((m) => {
                const isMe = m.sender_role === userRole;
                const urls = (m.image_urls ?? []).filter(Boolean);
                return (
                  <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[90%] min-w-0 rounded-2xl px-4 py-2.5 text-sm sm:max-w-[80%] ${isMe ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-800"}`}>
                      {m.content.trim() !== "" && m.content !== " " && <p className="whitespace-pre-wrap break-words">{m.content}</p>}
                      {urls.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {urls.map((url, i) => (
                            <button key={url} type="button" onClick={() => setLightbox({ urls, index: i })} className="overflow-hidden rounded-lg">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={url} alt="" className="h-14 w-14 object-cover" />
                            </button>
                          ))}
                        </div>
                      )}
                      <p className={`mt-1 text-[10px] ${isMe ? "text-emerald-200" : "text-gray-400"}`}>{new Date(m.created_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-gray-500">
            <p className="text-sm">종료된 채팅을 선택하세요</p>
          </div>
        )}
      </div>
      {lightbox && <ChatImageLightbox urls={lightbox.urls} index={lightbox.index} onClose={() => setLightbox(null)} />}
    </div>
  );
}
