"use client";

import { useState, useEffect, useRef } from "react";
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

type PartnerItem = {
  id: string;
  displayName: string;
  categoryLabel?: string;
  scheduleStr?: string;
  projectTitle?: string;
};

type ConsumerProviderChatBubbleProps = {
  userRole: "consumer" | "provider";
  userId: string;
};

const isChatPage = (path: string) =>
  path.startsWith("/dashboard/chat") || path.startsWith("/dashboard/provider-chat") || path.startsWith("/provider/chat") || path.startsWith("/provider/consumer-chat");

export default function ConsumerProviderChatBubble({ userRole, userId }: ConsumerProviderChatBubbleProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [partners, setPartners] = useState<PartnerItem[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [partnersLoading, setPartnersLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [partnerUnreadCounts, setPartnerUnreadCounts] = useState<Record<string, number>>({});
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
  const openRef = useRef(open);
  openRef.current = open;

  const otherRole = userRole === "consumer" ? "provider" : "consumer";

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  /**
   * 표시할 파트너 ID 집합 반환.
   * - 메시지 1개 이상: 항상 표시
   * - 스레드 없음: 표시 (새 대화 시작 가능)
   * - 스레드 있음, 메시지 0개: 내가 연 경우만 표시 (상대방에게는 안 보임)
   */
  const getVisiblePartnerIds = async (
    partnerIds: string[],
    isConsumer: boolean,
  ): Promise<Set<string>> => {
    if (partnerIds.length === 0) return new Set();
    const partnerKey = isConsumer ? "provider_id" : "consumer_id";
    const threadQuery = isConsumer
      ? supabase.from("consumer_provider_chat_threads").select("id, provider_id, initiated_by_role").eq("consumer_id", userId).in("provider_id", partnerIds)
      : supabase.from("consumer_provider_chat_threads").select("id, consumer_id, initiated_by_role").eq("provider_id", userId).in("consumer_id", partnerIds);
    const { data: threads } = await threadQuery;
    const threadIds = (threads ?? []).map((t) => t.id);
    let threadIdsWithMsgs = new Set<string>();
    if (threadIds.length > 0) {
      const { data: msgs } = await supabase.from("consumer_provider_chat_messages").select("thread_id").in("thread_id", threadIds);
      threadIdsWithMsgs = new Set((msgs ?? []).map((m) => m.thread_id));
    }
    const threadByPartner = new Map<string, { id: string; initiated_by_role?: string | null }>();
    for (const t of threads ?? []) {
      const pid = (t as { provider_id?: string; consumer_id?: string })[partnerKey]!;
      threadByPartner.set(pid, { id: t.id, initiated_by_role: (t as { initiated_by_role?: string | null }).initiated_by_role });
    }
    const result = new Set<string>();
    for (const pid of partnerIds) {
      const thread = threadByPartner.get(pid);
      if (!thread) {
        result.add(pid); // 스레드 없음 → 새 대화 시작 가능
        continue;
      }
      const hasMessages = threadIdsWithMsgs.has(thread.id);
      if (hasMessages) result.add(pid);
      else if (thread.initiated_by_role === userRole) result.add(pid); // 내가 연 채팅창
    }
    return result;
  };

  const fetchPartners = async () => {
    setPartnersLoading(true);
    if (userRole === "consumer") {
      const { data: projectsData } = await supabase
        .from("projects")
        .select("id, process_schedule, title")
        .eq("user_id", userId);
      const projectIds = (projectsData ?? []).map((p) => p.id);
      const projectMap = new Map((projectsData ?? []).map((p) => [p.id, p]));
      if (projectIds.length === 0) {
        setPartners([]);
        setPartnersLoading(false);
        return;
      }
      const { data: assignData } = await supabase
        .from("project_category_assignments")
        .select("provider_id, project_id, category")
        .in("project_id", projectIds)
        .eq("match_status", "completed");
      const providerIds = [...new Set((assignData ?? []).map((r) => r.provider_id))];
      if (providerIds.length === 0) {
        setPartners([]);
        setPartnersLoading(false);
        return;
      }
      const { data: profData } = await supabase
        .from("profiles")
        .select("user_id, business_name, name")
        .in("user_id", providerIds);
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
      const visibleProviderIds = await getVisiblePartnerIds(providerIds, true);
      const filteredProviderIds = providerIds.filter((pid) => visibleProviderIds.has(pid));
      setPartners(
        filteredProviderIds.map((pid) => {
          const prof = profMap.get(pid);
          const contracts = byProvider.get(pid) ?? [];
          const first = contracts[0];
          const categoryLabel = contracts.map((c) => c.projectTitle ? `${c.category} - ${c.projectTitle} (${c.scheduleStr})` : `${c.category} (${c.scheduleStr})`).join(", ");
          return {
            id: pid,
            displayName: prof?.business_name || prof?.name || "업체",
            categoryLabel: categoryLabel || undefined,
            scheduleStr: first?.scheduleStr,
          };
        })
      );
    } else {
      const { data: assignData } = await supabase
        .from("project_category_assignments")
        .select("project_id, category")
        .eq("provider_id", userId)
        .eq("match_status", "completed");
      const projectIds = [...new Set((assignData ?? []).map((r) => r.project_id))];
      if (projectIds.length === 0) {
        setPartners([]);
        setPartnersLoading(false);
        return;
      }
      const { data: projectsData } = await supabase
        .from("projects")
        .select("id, user_id, process_schedule, title, contact_name")
        .in("id", projectIds);
      const projectMap = new Map((projectsData ?? []).map((p) => [p.id, p]));
      const consumerIds = [...new Set((projectsData ?? []).map((p) => p.user_id).filter(Boolean))];
      if (consumerIds.length === 0) {
        setPartners([]);
        setPartnersLoading(false);
        return;
      }
      const { data: profData } = await supabase
        .from("profiles")
        .select("user_id, name")
        .in("user_id", consumerIds);
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
      const visibleConsumerIds = await getVisiblePartnerIds(consumerIds, false);
      const filteredConsumerIds = consumerIds.filter((cid) => visibleConsumerIds.has(cid));
      setPartners(
        filteredConsumerIds.map((cid) => {
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
        })
      );
    }
    setPartnersLoading(false);
  };

  useEffect(() => {
    if (!userId) return;
    fetchPartners();
  }, [userId, userRole]);

  const ensureThread = async (partnerId: string) => {
    const consumerId = userRole === "consumer" ? userId : partnerId;
    const providerId = userRole === "provider" ? userId : partnerId;

    const { data: existing } = await supabase
      .from("consumer_provider_chat_threads")
      .select("id, ended_at, ended_by, consumer_cleared_at, provider_cleared_at")
      .eq("consumer_id", consumerId)
      .eq("provider_id", providerId)
      .maybeSingle();

    if (existing) {
      setThreadId(existing.id);
      return existing.id;
    }

    const { data: inserted, error } = await supabase
      .from("consumer_provider_chat_threads")
      .insert({ consumer_id: consumerId, provider_id: providerId, initiated_by_role: userRole })
      .select("id")
      .single();

    if (error) {
      console.error("Failed to create chat thread:", error);
      return null;
    }
    setThreadId(inserted.id);
    return inserted.id;
  };

  const getClearedAt = (thread: {
    consumer_cleared_at?: string | null;
    provider_cleared_at?: string | null;
    ended_at?: string | null;
    ended_by?: string | null;
  } | null) => {
    if (!thread) return null;
    const cleared = userRole === "consumer" ? thread.consumer_cleared_at : thread.provider_cleared_at;
    const endedByUser = thread.ended_by === userRole ? thread.ended_at : null;
    return cleared ?? endedByUser ?? null;
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
          setOpen(false);
        } else {
          setAlertMessage("채팅 종료에 실패했습니다.");
        }
        return;
      }
    }
    const clearedAt = new Date().toISOString();
    const updates: Record<string, unknown> = {
      ended_at: clearedAt,
      ended_by: userRole,
      ...(userRole === "consumer" ? { consumer_cleared_at: clearedAt } : { provider_cleared_at: clearedAt }),
    };
    const { error } = await supabase
      .from("consumer_provider_chat_threads")
      .update(updates)
      .eq("id", threadId);
    setResetting(false);
    setShowResetConfirm(false);
    if (!error) {
      if (userRole === "consumer") setShowEndedMessage(true);
      else {
        setSelectedPartnerId(null);
        setThreadId(null);
        setOpen(false);
      }
    } else {
      setAlertMessage(userRole === "consumer" ? "채팅 종료에 실패했습니다." : "채팅 초기화에 실패했습니다.");
    }
  };

  const loadMessages = async (tid: string) => {
    setLoading(true);
    const { data: thread } = await supabase
      .from("consumer_provider_chat_threads")
      .select("consumer_cleared_at, provider_cleared_at, ended_at, ended_by")
      .eq("id", tid)
      .single();
    const clearedAt = getClearedAt(thread);
    let q = supabase
      .from("consumer_provider_chat_messages")
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
      .from("consumer_provider_chat_threads")
      .select("consumer_read_at, provider_read_at, consumer_cleared_at, provider_cleared_at, ended_at, ended_by")
      .eq("id", tid)
      .single();
    const clearedAt = getClearedAt(thread);
    const readAt = userRole === "consumer" ? thread?.consumer_read_at : thread?.provider_read_at;
    const candidates = [clearedAt, readAt].filter(Boolean) as string[];
    const after = candidates.length > 0 ? candidates.sort()[candidates.length - 1] : null;
    let q = supabase
      .from("consumer_provider_chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("thread_id", tid)
      .eq("sender_role", otherRole);
    if (after) {
      q = q.gt("created_at", after);
    }
    const { count } = await q;
    return count ?? 0;
  };

  const loadAllUnreadCount = async () => {
    if (partners.length === 0) return 0;
    let total = 0;
    const counts: Record<string, number> = {};
    for (const p of partners) {
      const consumerId = userRole === "consumer" ? userId : p.id;
      const providerId = userRole === "provider" ? userId : p.id;
      const { data: thread } = await supabase
        .from("consumer_provider_chat_threads")
        .select("id")
        .eq("consumer_id", consumerId)
        .eq("provider_id", providerId)
        .maybeSingle();
      if (thread) {
        const c = await loadUnreadCount(thread.id);
        counts[p.id] = c;
        total += c;
      }
    }
    setPartnerUnreadCounts(counts);
    return total;
  };

  const markRead = async (tid: string) => {
    const col = userRole === "consumer" ? "consumer_read_at" : "provider_read_at";
    await supabase
      .from("consumer_provider_chat_threads")
      .update({ [col]: new Date().toISOString() })
      .eq("id", tid);
    const total = await loadAllUnreadCount();
    setUnreadCount(total);
  };

  useEffect(() => {
    if (!userId || partners.length === 0) return;

    const refreshUnread = async () => {
      const count = await loadAllUnreadCount();
      setUnreadCount(count);
    };

    refreshUnread();
    const interval = setInterval(refreshUnread, 30000);
    return () => clearInterval(interval);
  }, [userId, userRole, partners]);

  useEffect(() => {
    if (!selectedPartnerId) {
      setThreadId(null);
      return;
    }

    const init = async () => {
      const tid = await ensureThread(selectedPartnerId);
      if (tid) {
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current);
          channelRef.current = null;
        }

        channelRef.current = supabase
          .channel(`cp-chat-${tid}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "consumer_provider_chat_messages",
              filter: `thread_id=eq.${tid}`,
            },
            async (payload) => {
              const role = (payload.new as { sender_role?: string })?.sender_role;
              if (openRef.current) {
                await loadMessages(tid);
                if (role === otherRole) await markRead(tid);
              } else if (role === otherRole) {
                const count = await loadAllUnreadCount();
                setUnreadCount(count);
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
  }, [selectedPartnerId, userId, userRole]);

  useEffect(() => {
    if (!open || !threadId) return;
    loadMessages(threadId);
    markRead(threadId);
    loadAllUnreadCount().then(setUnreadCount);
  }, [open, threadId]);

  useEffect(() => {
    if (open && partners.length > 0) {
      loadAllUnreadCount().then(setUnreadCount);
      const ch = supabase.channel("cp-bubble-unread").on("postgres_changes", { event: "INSERT", schema: "public", table: "consumer_provider_chat_messages" }, () => loadAllUnreadCount().then(setUnreadCount)).subscribe();
      return () => { supabase.removeChannel(ch); };
    }
  }, [open, partners.length]);

  const sendMessage = async () => {
    const text = input.trim();
    const hasImages = pendingImages.length > 0;
    if ((!text && !hasImages) || !threadId || sending) return;

    setSending(true);

    const imageUrls: string[] = [];
    for (const file of pendingImages) {
      const blob = await compressImage(file);
      const ext = "jpg";
      const path = `cp/${threadId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("chat-images")
        .upload(path, blob, { contentType: "image/jpeg" });
      if (uploadError) {
        console.error("이미지 업로드 오류:", uploadError);
        setAlertMessage("이미지 업로드에 실패했습니다.");
        setSending(false);
        return;
      }
      const { data: urlData } = supabase.storage.from("chat-images").getPublicUrl(path);
      imageUrls.push(urlData.publicUrl);
    }

    const { error } = await supabase.from("consumer_provider_chat_messages").insert({
      thread_id: threadId,
      sender_id: userId,
      sender_role: userRole,
      content: text || " ",
      image_urls: imageUrls.length > 0 ? imageUrls : undefined,
    });

    if (!error) {
      await supabase
        .from("consumer_provider_chat_threads")
        .update({ ended_at: null, ended_by: null })
        .eq("id", threadId);
      setInput("");
      setPendingImages([]);
      await markRead(threadId);
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
    } else {
      setAlertMessage("메시지 전송에 실패했습니다.");
    }
    setSending(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/"));
    setPendingImages((prev) => {
      const next = [...prev, ...files].slice(0, 3);
      if (prev.length + files.length > 3) {
        setTimeout(() => setAlertMessage("사진은 최대 3장까지만 가능합니다."), 0);
      }
      return next;
    });
    e.target.value = "";
  };

  const removePendingImage = (idx: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const selectedPartner = partners.find((p) => p.id === selectedPartnerId);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`fixed right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg transition hover:bg-emerald-700 active:scale-95 sm:right-6 ${isChatPage(pathname ?? "") ? "bottom-24 sm:bottom-56" : "bottom-24 sm:bottom-24"}`}
        aria-label={userRole === "consumer" ? "업체와 채팅" : "소비자와 채팅"}
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

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-hidden />
          <div
            className={`relative z-10 flex w-full max-w-md flex-col bg-white shadow-xl rounded-2xl pb-[env(safe-area-inset-bottom)] max-h-[90dvh] ${selectedPartner ? "h-[85dvh] sm:h-[500px] sm:max-h-[90vh]" : "h-[50dvh] max-h-[400px] sm:h-[380px]"}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-3 py-2">
              <div className="flex items-center gap-2">
                {selectedPartner && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPartnerId(null);
                      setThreadId(null);
                    }}
                    className="rounded-lg p-1.5 text-gray-500 transition hover:bg-gray-100"
                    aria-label="뒤로"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                  </button>
                )}
                <h3 className={`font-semibold text-gray-800 ${selectedPartner ? "text-base" : "text-sm"}`}>
                  {selectedPartner ? (userRole === "provider" && selectedPartner.projectTitle ? `${selectedPartner.displayName} - ${selectedPartner.projectTitle}` : selectedPartner.displayName) : userRole === "consumer" ? "업체 선택" : "소비자 선택"}
                </h3>
              </div>
              <div className="flex items-center gap-1">
                {selectedPartner && (
                  <button
                    type="button"
                    onClick={() => setShowResetConfirm(true)}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
                    title={userRole === "consumer" ? "채팅 종료" : "채팅창 초기화"}
                  >
                    {userRole === "consumer" ? "채팅 종료" : "채팅 초기화"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setSelectedPartnerId(null);
                    setThreadId(null);
                  }}
                  className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100"
                  aria-label="닫기"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>

            {!selectedPartner ? (
              <div className="min-h-0 flex-1 overflow-y-auto p-2 sm:p-3">
                {partnersLoading ? (
                  <div className="flex justify-center py-4 text-xs text-gray-500">목록 불러오는 중...</div>
                ) : partners.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 text-center text-xs text-gray-600">
                    <p className="font-medium">
                      {userRole === "consumer" ? "아직 계약완료된 업체가 없어요." : "아직 계약완료된 소비자가 없어요."}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {userRole === "consumer" ? "계약이 완료된 시공업체와 대화가 가능합니다." : "계약이 완료된 고객과 대화가 가능합니다."}
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-200">
                    {partners.map((p) => {
                      const isExpanded = expandedPartnerId === p.id;
                      const hasDetail = userRole === "provider" && p.categoryLabel;
                      return (
                        <li key={p.id}>
                          <div
                            className={`${userRole === "provider" ? "rounded-lg px-3 py-2.5" : "rounded-xl border border-gray-200 px-4 py-3"}`}
                          >
                            <button
                              type="button"
                              onClick={() => setSelectedPartnerId(p.id)}
                              className="relative w-full text-left transition hover:bg-gray-50 -m-1 p-1 rounded"
                            >
                              <div className="flex min-w-0 items-center gap-1.5">
                                <span className={`truncate font-medium text-gray-800 ${userRole === "provider" ? "text-xs" : "text-sm"}`}>
                                  {userRole === "provider" && p.projectTitle ? `${p.displayName} - ${p.projectTitle}` : p.displayName}
                                </span>
                                {(partnerUnreadCounts[p.id] ?? 0) > 0 && (
                                  <span className="shrink-0 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold text-white">
                                    {partnerUnreadCounts[p.id]! > 99 ? "99+" : partnerUnreadCounts[p.id]}
                                  </span>
                                )}
                              </div>
                              {userRole === "consumer" && p.categoryLabel && (
                                <p className="mt-1 truncate text-xs text-gray-500">{p.categoryLabel}</p>
                              )}
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
            ) : (
              <>
                <div className="flex-1 overflow-y-auto p-4">
                  {loading ? (
                    <div className="flex justify-center py-8 text-sm text-gray-500">메시지 불러오는 중...</div>
                  ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center text-sm text-gray-500">
                      <p>메시지를 보내보세요.</p>
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
                                isMe ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-800"
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
                              <p className={`mt-1 text-[10px] ${isMe ? "text-emerald-200" : "text-gray-400"}`}>
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

                <div className="shrink-0 border-t border-gray-200 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
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
                      className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={sendMessage}
                      disabled={(!input.trim() && pendingImages.length === 0) || sending}
                      className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50 disabled:hover:bg-emerald-600"
                    >
                      전송
                    </button>
                  </div>
                </div>
              </>
            )}
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
      {showResetConfirm && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 px-4" onClick={() => setShowResetConfirm(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900">{userRole === "consumer" ? "채팅 종료" : "채팅창 초기화"}</h3>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">
              {userRole === "consumer"
                ? "채팅을 종료하시겠습니까? 종료하신 채팅 내용은 종료된 채팅 메뉴에 보관됩니다."
                : "채팅창을 초기화하면 더 이상 보이지 않습니다. 대화 내용은 종료된 채팅으로 저장됩니다. 계속하시겠습니까?"}
            </p>
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleResetChat}
                disabled={resetting}
                className="flex-1 rounded-xl bg-amber-600 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:opacity-50"
              >
                {resetting ? "처리 중..." : userRole === "consumer" ? "종료" : "초기화"}
              </button>
            </div>
          </div>
        </div>
      )}
      {showEndedMessage && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 px-4" onClick={() => { setShowEndedMessage(false); setSelectedPartnerId(null); setThreadId(null); setOpen(false); }}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-center text-sm text-gray-700">종료하신 채팅 내용은 종료된 채팅 메뉴에 보관됩니다.</p>
            <button type="button" onClick={() => { setShowEndedMessage(false); setSelectedPartnerId(null); setThreadId(null); setOpen(false); }} className="mt-4 w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">확인</button>
          </div>
        </div>
      )}
    </>
  );
}
