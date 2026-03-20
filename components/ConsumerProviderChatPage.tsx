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

function formatScheduleDate(processSchedule: Record<string, unknown> | null, catName: string): string {
  const raw = processSchedule?.[catName];
  if (!raw) return "—";
  const ranges = Array.isArray(raw) ? raw : [raw];
  if (ranges.length === 0) return "—";
  const r = ranges[ranges.length - 1] as { start?: string; end?: string };
  const fmt = (s: string) => {
    const part = (typeof s === "string" ? s : "").split("T")[0];
    const [y, m, d] = part.split("-").map(Number);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return "?";
    return `${y}.${m}.${d}`;
  };
  return `${fmt(r.start ?? "")} ~ ${fmt(r.end ?? "")}`;
}

type PartnerItem = { id: string; displayName: string; categoryLabel?: string; projectTitle?: string };

type Props = {
  userRole: "consumer" | "provider";
  userId: string;
};

export default function ConsumerProviderChatPage({ userRole, userId }: Props) {
  const [partners, setPartners] = useState<PartnerItem[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [partnersLoading, setPartnersLoading] = useState(true);
  const [partnerUnreadCounts, setPartnerUnreadCounts] = useState<Record<string, number>>({});
  const [sending, setSending] = useState(false);
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showEndedMessage, setShowEndedMessage] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [expandedPartnerId, setExpandedPartnerId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const otherRole = userRole === "consumer" ? "provider" : "consumer";

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => { scrollToBottom(); }, [messages]);

  const fetchPartners = async () => {
    setPartnersLoading(true);
    if (userRole === "consumer") {
      const { data: projectsData } = await supabase.from("projects").select("id, process_schedule, title").eq("user_id", userId);
      const projectIds = (projectsData ?? []).map((p) => p.id);
      const projectMap = new Map((projectsData ?? []).map((p) => [p.id, p]));
      if (projectIds.length === 0) { setPartners([]); setPartnersLoading(false); return; }
      const { data: assignData } = await supabase.from("project_category_assignments").select("provider_id, project_id, category").in("project_id", projectIds).eq("match_status", "completed");
      const providerIds = [...new Set((assignData ?? []).map((r) => r.provider_id))];
      if (providerIds.length === 0) { setPartners([]); setPartnersLoading(false); return; }
      const { data: profData } = await supabase.from("profiles").select("user_id, business_name, name").in("user_id", providerIds);
      const profMap = new Map((profData ?? []).map((p) => [p.user_id, p]));
      const byProvider = new Map<string, { category: string; scheduleStr: string; projectTitle?: string }[]>();
      for (const a of assignData ?? []) {
        const proj = projectMap.get(a.project_id);
        const scheduleStr = proj?.process_schedule ? formatScheduleDate(proj.process_schedule as Record<string, unknown>, a.category) : "—";
        const projectTitle = (proj as { title?: string })?.title?.trim();
        const list = byProvider.get(a.provider_id) ?? [];
        list.push({ category: a.category, scheduleStr, projectTitle });
        byProvider.set(a.provider_id, list);
      }
      setPartners(providerIds.map((pid) => {
        const prof = profMap.get(pid);
        const contracts = byProvider.get(pid) ?? [];
        const categoryLabel = contracts.map((c) => c.projectTitle ? `${c.category} - ${c.projectTitle} (${c.scheduleStr})` : `${c.category} (${c.scheduleStr})`).join(", ");
        return { id: pid, displayName: prof?.business_name || prof?.name || "업체", categoryLabel: categoryLabel || undefined };
      }));
    } else {
      const { data: assignData } = await supabase.from("project_category_assignments").select("project_id, category").eq("provider_id", userId).eq("match_status", "completed");
      const projectIds = [...new Set((assignData ?? []).map((r) => r.project_id))];
      if (projectIds.length === 0) { setPartners([]); setPartnersLoading(false); return; }
      const { data: projectsData } = await supabase.from("projects").select("id, user_id, process_schedule, title, contact_name").in("id", projectIds);
      const projectMap = new Map((projectsData ?? []).map((p) => [p.id, p]));
      const consumerIds = [...new Set((projectsData ?? []).map((p) => p.user_id).filter(Boolean))];
      if (consumerIds.length === 0) { setPartners([]); setPartnersLoading(false); return; }
      const { data: profData } = await supabase.from("profiles").select("user_id, name").in("user_id", consumerIds);
      const profMap = new Map((profData ?? []).map((p) => [p.user_id, p]));
      const byConsumer = new Map<string, { category: string; scheduleStr: string; projectTitle?: string; contactName?: string }[]>();
      for (const a of assignData ?? []) {
        const proj = projectMap.get(a.project_id);
        const scheduleStr = proj?.process_schedule ? formatScheduleDate(proj.process_schedule as Record<string, unknown>, a.category) : "—";
        const projectTitle = (proj as { title?: string })?.title?.trim();
        const contactName = (proj as { contact_name?: string })?.contact_name?.trim();
        const cid = proj?.user_id;
        if (!cid) continue;
        const list = byConsumer.get(cid) ?? [];
        list.push({ category: a.category, scheduleStr, projectTitle, contactName });
        byConsumer.set(cid, list);
      }
      setPartners(consumerIds.map((cid) => {
        const prof = profMap.get(cid);
        const contracts = byConsumer.get(cid) ?? [];
        const categoryLabel = contracts.map((c) => c.projectTitle ? `${c.category} - ${c.projectTitle} (${c.scheduleStr})` : `${c.category} (${c.scheduleStr})`).join(", ");
        const projectTitles = [...new Set(contracts.map((c) => c.projectTitle).filter(Boolean))];
        const contactNames = [...new Set(contracts.map((c) => c.contactName).filter(Boolean))];
        const displayName = prof?.name?.trim() || contactNames[0] || "이름 없음";
        return {
          id: cid,
          displayName,
          categoryLabel: categoryLabel || undefined,
          projectTitle: projectTitles.length > 0 ? projectTitles.join(", ") : undefined,
        };
      }));
    }
    setPartnersLoading(false);
  };

  useEffect(() => { if (!userId) return; fetchPartners(); }, [userId, userRole]);

  const ensureThread = async (partnerId: string) => {
    const consumerId = userRole === "consumer" ? userId : partnerId;
    const providerId = userRole === "provider" ? userId : partnerId;
    const { data: existing } = await supabase.from("consumer_provider_chat_threads").select("id").eq("consumer_id", consumerId).eq("provider_id", providerId).maybeSingle();
    if (existing) { setThreadId(existing.id); return existing.id; }
    const { data: inserted, error } = await supabase.from("consumer_provider_chat_threads").insert({ consumer_id: consumerId, provider_id: providerId }).select("id").single();
    if (error) return null;
    setThreadId(inserted.id);
    return inserted.id;
  };

  const getClearedAt = (thread: { consumer_cleared_at?: string | null; provider_cleared_at?: string | null; ended_at?: string | null; ended_by?: string | null } | null) => {
    if (!thread) return null;
    const cleared = userRole === "consumer" ? thread.consumer_cleared_at : thread.provider_cleared_at;
    return cleared ?? (thread.ended_by === userRole ? thread.ended_at : null) ?? null;
  };

  const loadUnreadCountForThread = async (tid: string) => {
    const { data: thread } = await supabase.from("consumer_provider_chat_threads").select("consumer_read_at, provider_read_at, consumer_cleared_at, provider_cleared_at, ended_at, ended_by").eq("id", tid).single();
    const clearedAt = getClearedAt(thread);
    const readAt = userRole === "consumer" ? thread?.consumer_read_at : thread?.provider_read_at;
    const candidates = [clearedAt, readAt].filter(Boolean) as string[];
    const after = candidates.length > 0 ? candidates.sort()[candidates.length - 1] : null;
    let q = supabase.from("consumer_provider_chat_messages").select("id", { count: "exact", head: true }).eq("thread_id", tid).eq("sender_role", otherRole);
    if (after) q = q.gt("created_at", after);
    const { count } = await q;
    return count ?? 0;
  };

  const loadPartnerUnreadCounts = async () => {
    if (partners.length === 0) return;
    const counts: Record<string, number> = {};
    for (const p of partners) {
      const consumerId = userRole === "consumer" ? userId : p.id;
      const providerId = userRole === "provider" ? userId : p.id;
      const { data: thread } = await supabase.from("consumer_provider_chat_threads").select("id").eq("consumer_id", consumerId).eq("provider_id", providerId).maybeSingle();
      if (thread) counts[p.id] = await loadUnreadCountForThread(thread.id);
    }
    setPartnerUnreadCounts(counts);
  };

  const markRead = async (tid: string) => {
    const col = userRole === "consumer" ? "consumer_read_at" : "provider_read_at";
    await supabase.from("consumer_provider_chat_threads").update({ [col]: new Date().toISOString() }).eq("id", tid);
    await loadPartnerUnreadCounts();
  };

  const loadMessages = async (tid: string) => {
    setLoading(true);
    const { data: thread } = await supabase.from("consumer_provider_chat_threads").select("consumer_cleared_at, provider_cleared_at, ended_at, ended_by").eq("id", tid).single();
    const clearedAt = getClearedAt(thread);
    let q = supabase.from("consumer_provider_chat_messages").select("id, content, sender_role, sender_id, created_at, image_urls").eq("thread_id", tid).order("created_at", { ascending: true });
    if (clearedAt) q = q.gt("created_at", clearedAt);
    const { data } = await q;
    setMessages(data ?? []);
    setLoading(false);
  };

  const handleResetChat = async () => {
    if (!threadId || resetting) return;
    setResetting(true);
    if (userRole === "consumer") {
      const { count } = await supabase
        .from("consumer_provider_chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("thread_id", threadId);
      const hasMessages = (count ?? 0) > 0;
      if (!hasMessages) {
        const { error: delError } = await supabase.from("consumer_provider_chat_threads").delete().eq("id", threadId);
        setResetting(false);
        setShowResetConfirm(false);
        if (!delError) {
          setSelectedPartnerId(null);
          setThreadId(null);
        } else {
          setAlertMessage("채팅 종료에 실패했습니다.");
        }
        return;
      }
    }
    const clearedAt = new Date().toISOString();
    const updates: Record<string, unknown> = { ended_at: clearedAt, ended_by: userRole, ...(userRole === "consumer" ? { consumer_cleared_at: clearedAt } : { provider_cleared_at: clearedAt }) };
    const { error } = await supabase.from("consumer_provider_chat_threads").update(updates).eq("id", threadId);
    setResetting(false);
    setShowResetConfirm(false);
    if (!error) {
      if (userRole === "consumer") setShowEndedMessage(true);
      else { setSelectedPartnerId(null); setThreadId(null); }
    } else setAlertMessage(userRole === "consumer" ? "채팅 종료에 실패했습니다." : "채팅 초기화에 실패했습니다.");
  };

  useEffect(() => {
    if (!selectedPartnerId) { setThreadId(null); return; }
    const init = async () => {
      const tid = await ensureThread(selectedPartnerId);
      if (tid) {
        if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
        channelRef.current = supabase.channel(`cp-chat-page-${tid}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "consumer_provider_chat_messages", filter: `thread_id=eq.${tid}` }, () => loadMessages(tid)).subscribe();
      }
    };
    init();
    return () => { if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; } };
  }, [selectedPartnerId, userId, userRole]);

  useEffect(() => { if (!threadId) return; loadMessages(threadId); markRead(threadId); }, [threadId]);

  useEffect(() => {
    if (!userId || partners.length === 0) return;
    loadPartnerUnreadCounts();
    const ch = supabase.channel("cp-page-unread").on("postgres_changes", { event: "*", schema: "public", table: "consumer_provider_chat_threads" }, () => loadPartnerUnreadCounts()).on("postgres_changes", { event: "*", schema: "public", table: "consumer_provider_chat_messages" }, () => loadPartnerUnreadCounts()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, userRole, partners]);

  const sendMessage = async () => {
    const text = input.trim();
    const hasImages = pendingImages.length > 0;
    if ((!text && !hasImages) || !threadId || sending) return;
    setSending(true);
    const imageUrls: string[] = [];
    for (const file of pendingImages) {
      const blob = await compressImage(file);
      const path = `cp/${threadId}/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
      const { error: uploadError } = await supabase.storage.from("chat-images").upload(path, blob, { contentType: "image/jpeg" });
      if (uploadError) { setSending(false); return; }
      const { data: urlData } = supabase.storage.from("chat-images").getPublicUrl(path);
      imageUrls.push(urlData.publicUrl);
    }
    const { error } = await supabase.from("consumer_provider_chat_messages").insert({ thread_id: threadId, sender_id: userId, sender_role: userRole, content: text || " ", image_urls: imageUrls.length > 0 ? imageUrls : undefined });
    if (!error) {
      await supabase.from("consumer_provider_chat_threads").update({ ended_at: null, ended_by: null }).eq("id", threadId);
      setInput("");
      setPendingImages([]);
      await loadMessages(threadId);
      try {
        const { data } = await supabase.auth.getSession();
        if (data?.session?.access_token && selectedPartnerId) {
          await fetch("/api/push/consumer-provider-chat-notify", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
            body: JSON.stringify({ recipientUserId: selectedPartnerId }),
          });
        }
      } catch {
        /* ignore */
      }
    }
    setSending(false);
  };

  const selectedPartner = partners.find((p) => p.id === selectedPartnerId);

  if (partners.length === 0 && !partnersLoading) {
    return (
      <div className="flex h-[calc(100vh-8rem)] flex-col items-center justify-center rounded-xl border border-gray-200 bg-white p-8">
        <p className="text-sm text-gray-500">계약완료된 {userRole === "consumer" ? "업체" : "소비자"}가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4 overflow-hidden">
      {/* 목록 패널 - 모바일: 선택 전 전체, 선택 시 숨김. 데스크톱: 항상 표시 */}
      <div className={`flex w-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white md:shrink-0 ${userRole === "provider" ? "md:w-48" : "md:w-72"} ${selectedPartnerId ? "hidden md:flex" : "flex"}`}>
        <div className={`border-b border-gray-200 px-3 ${userRole === "provider" ? "py-2" : "px-4 py-3"}`}>
          <h2 className="text-sm font-semibold text-gray-800">{userRole === "consumer" ? "업체" : "소비자"} 선택</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {partnersLoading ? (
            <div className={userRole === "provider" ? "p-3 text-center text-xs text-gray-500" : "p-4 text-center text-sm text-gray-500"}>불러오는 중...</div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {partners.map((p) => {
                const isExpanded = expandedPartnerId === p.id;
                const hasDetail = userRole === "provider" && p.categoryLabel;
                return (
                  <li key={p.id}>
                    <div className={`rounded ${userRole === "provider" ? "px-3 py-2.5" : "px-4 py-3"} ${selectedPartnerId === p.id ? "bg-emerald-50" : ""}`}>
                      <button
                        type="button"
                        onClick={() => setSelectedPartnerId(p.id)}
                        className={`w-full text-left ${selectedPartnerId === p.id ? "text-emerald-700" : "hover:bg-gray-50"} -m-1 p-1 rounded ${userRole === "provider" ? "text-xs" : "text-sm"}`}
                      >
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate font-medium">{userRole === "provider" && p.projectTitle ? `${p.displayName} - ${p.projectTitle}` : p.displayName}</span>
                          {(partnerUnreadCounts[p.id] ?? 0) > 0 && (
                            <span className="shrink-0 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold text-white">
                              {partnerUnreadCounts[p.id]! > 99 ? "99+" : partnerUnreadCounts[p.id]}
                            </span>
                          )}
                        </div>
                        {userRole === "consumer" && p.categoryLabel && <p className="mt-1 truncate text-xs text-gray-500">{p.categoryLabel}</p>}
                      </button>
                      {hasDetail && (
                        <>
                          <div className="mt-1 hidden md:block">
                            <p className="truncate text-[10px] text-gray-500" title={p.categoryLabel}>
                              {p.projectTitle ? `${p.projectTitle} · ` : ""}{p.categoryLabel}
                            </p>
                          </div>
                          <div className="mt-1 md:hidden">
                            {isExpanded ? (
                              <>
                                <p className="break-words text-[10px] text-gray-500">{p.projectTitle ? `${p.projectTitle} · ` : ""}{p.categoryLabel}</p>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setExpandedPartnerId(null); }}
                                  className="mt-0.5 text-[10px] text-gray-500 underline"
                                >
                                  접기
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setExpandedPartnerId(p.id); }}
                                className="text-[10px] text-gray-500 underline"
                              >
                                펼치기
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      {/* 채팅 영역 - 모바일: 선택 시 전체, 선택 전 숨김. 데스크톱: 항상 표시 */}
      <div className={`flex flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white ${selectedPartnerId ? "flex" : "hidden md:flex"}`}>
        {selectedPartner ? (
          <>
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
              <button
                type="button"
                onClick={() => { setSelectedPartnerId(null); setThreadId(null); }}
                className="md:hidden shrink-0 rounded-lg p-2 text-gray-500 transition hover:bg-gray-100"
                aria-label="목록으로"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <h3 className="min-w-0 flex-1 truncate text-base font-semibold text-gray-800">{userRole === "provider" && selectedPartner.projectTitle ? `${selectedPartner.displayName} - ${selectedPartner.projectTitle}` : selectedPartner.displayName}</h3>
              <button type="button" onClick={() => setShowResetConfirm(true)} className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-amber-600 hover:bg-amber-50">{userRole === "consumer" ? "채팅 종료" : "채팅 초기화"}</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {loading ? <div className="flex justify-center py-8 text-sm text-gray-500">메시지 불러오는 중...</div> : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-sm text-gray-500">메시지를 보내보세요.</div>
              ) : (
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
                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/")); setPendingImages((p) => { const next = [...p, ...files].slice(0, 3); if (p.length + files.length > 3) setTimeout(() => setAlertMessage("사진은 최대 3장까지만 가능합니다."), 0); return next; }); e.target.value = ""; }} />
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={pendingImages.length >= 3} className="shrink-0 rounded-xl border border-gray-200 px-3 py-2.5 text-gray-500 hover:bg-gray-50 disabled:opacity-50">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                </button>
                <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()} placeholder="메시지를 입력하세요..." className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" />
                <button type="button" onClick={sendMessage} disabled={(!input.trim() && pendingImages.length === 0) || sending} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">전송</button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-gray-500">
            <p className="text-sm">대화할 {userRole === "consumer" ? "업체" : "소비자"}를 선택하세요</p>
          </div>
        )}
      </div>
      {lightbox && <ChatImageLightbox urls={lightbox.urls} index={lightbox.index} onClose={() => setLightbox(null)} />}
      {alertMessage && <AlertModal message={alertMessage} onClose={() => setAlertMessage(null)} variant="warning" />}
      {showResetConfirm && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 px-4" onClick={() => setShowResetConfirm(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900">{userRole === "consumer" ? "채팅 종료" : "채팅창 초기화"}</h3>
            <p className="mt-2 text-sm text-gray-600">
              {userRole === "consumer" ? "채팅을 종료하시겠습니까? 종료하신 채팅 내용은 종료된 채팅 메뉴에 보관됩니다." : "채팅창을 초기화하면 대화 내용이 종료된 채팅으로 저장됩니다. 계속하시겠습니까?"}
            </p>
            <div className="mt-6 flex gap-2">
              <button type="button" onClick={() => setShowResetConfirm(false)} className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">취소</button>
              <button type="button" onClick={handleResetChat} disabled={resetting} className="flex-1 rounded-xl bg-amber-600 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50">{resetting ? "처리 중..." : userRole === "consumer" ? "종료" : "초기화"}</button>
            </div>
          </div>
        </div>
      )}
      {showEndedMessage && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 px-4" onClick={() => { setShowEndedMessage(false); setSelectedPartnerId(null); setThreadId(null); }}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-center text-sm text-gray-700">종료하신 채팅 내용은 종료된 채팅 메뉴에 보관됩니다.</p>
            <button type="button" onClick={() => { setShowEndedMessage(false); setSelectedPartnerId(null); setThreadId(null); }} className="mt-4 w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">확인</button>
          </div>
        </div>
      )}
    </div>
  );
}
