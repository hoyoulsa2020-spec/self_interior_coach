"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { compressImage } from "@/lib/imageCompress";
import ChatImageLightbox from "@/components/ChatImageLightbox";
import AlertModal from "@/components/AlertModal";

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

type UserItem = {
  user_id: string;
  role: string;
  name: string | null;
  business_name: string | null;
  email: string | null;
  categoryLabel?: string;
  projectTitle?: string;
};

type Thread = {
  id: string;
  user_id: string;
  user_role: string;
  updated_at: string;
  admin_read_at: string | null;
  ended_at: string | null;
  ended_by: string | null;
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

type TabType = "consumer" | "provider";

export default function AdminConsumerProviderChatPage() {
  const router = useRouter();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [adminId, setAdminId] = useState<string | null>(null);
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [closingThreadId, setClosingThreadId] = useState<string | null>(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      setAdminId(session.user.id);
    };
    init();
  }, [router]);

  const loadThreads = useCallback(async () => {
    setThreadsLoading(true);
    try {
      const { data: threadData } = await supabase
        .from("admin_chat_threads")
        .select("id, user_id, user_role, updated_at, admin_read_at, ended_at, ended_by")
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
          let msgQ = supabase
            .from("admin_chat_messages")
            .select("id", { count: "exact", head: true })
            .eq("thread_id", t.id)
            .in("sender_role", ["consumer", "provider"]);
          if (t.admin_read_at) {
            msgQ = msgQ.gt("created_at", t.admin_read_at);
          }
          const { count } = await msgQ;
          return count ?? 0;
        })
      );

      setThreads(
        list.map((t, i) => ({
          ...t,
          profiles: profileMap.get(t.user_id) ?? null,
          unreadCount: unreadCounts[i] ?? 0,
        }))
      );
    } finally {
      setThreadsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    const ch = supabase
      .channel("admin-cp-threads")
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_chat_threads" }, () => loadThreads())
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_chat_messages" }, () => loadThreads())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [loadThreads]);

  const searchUsers = useCallback(async (role: TabType, q: string) => {
    if (!role) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    let query = supabase
      .from("profiles")
      .select("user_id, role, name, business_name, email")
      .eq("role", role);
    if (q.trim()) {
      const term = `%${q.trim()}%`;
      query = query.or(`name.ilike.${term},business_name.ilike.${term},email.ilike.${term}`);
    }
    const orderCol = role === "provider" ? "business_name" : "name";
    const { data: profileData } = await query.order(orderCol, { nullsFirst: false }).limit(50);
    const list = (profileData ?? []) as UserItem[];

    if (role === "consumer" && list.length > 0) {
      const consumerIds = list.map((u) => u.user_id);
      const { data: projectsData } = await supabase.from("projects").select("id, user_id, process_schedule, title").in("user_id", consumerIds);
      const projectIds = (projectsData ?? []).map((p) => p.id);
      const projectMap = new Map((projectsData ?? []).map((p) => [p.id, p]));
      if (projectIds.length > 0) {
        const { data: assignData } = await supabase.from("project_category_assignments").select("project_id, category").in("project_id", projectIds).eq("match_status", "completed");
        const byConsumer = new Map<string, { category: string; scheduleStr: string; projectTitle?: string }[]>();
        for (const a of assignData ?? []) {
          const proj = projectMap.get(a.project_id);
          const cid = proj?.user_id;
          if (!cid) continue;
          const scheduleStr = proj?.process_schedule ? formatScheduleDate(proj.process_schedule as Record<string, unknown>, a.category) : "—";
          const projectTitle = (proj as { title?: string })?.title?.trim();
          const arr = byConsumer.get(cid) ?? [];
          arr.push({ category: a.category, scheduleStr, projectTitle });
          byConsumer.set(cid, arr);
        }
        for (const u of list) {
          const contracts = byConsumer.get(u.user_id) ?? [];
          u.categoryLabel = contracts.map((c) => `${c.category} (${c.scheduleStr})`).join(", ");
          const titles = [...new Set(contracts.map((c) => c.projectTitle).filter(Boolean))];
          u.projectTitle = titles.length > 0 ? titles.join(", ") : undefined;
        }
      }
    }

    setSearchResults(list);
    setSearching(false);
  }, []);

  useEffect(() => {
    if (!activeTab) {
      setSearchResults([]);
      return;
    }
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => searchUsers(activeTab, searchQuery), searchQuery.trim() ? 300 : 0);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [activeTab, searchQuery, searchUsers]);

  const ensureThread = async (userId: string, userRole: string): Promise<string | null> => {
    const { data: existing } = await supabase
      .from("admin_chat_threads")
      .select("id")
      .eq("user_id", userId)
      .eq("user_role", userRole)
      .is("ended_at", null)
      .maybeSingle();
    if (existing) return existing.id;
    const { data: inserted, error } = await supabase
      .from("admin_chat_threads")
      .insert({ user_id: userId, user_role: userRole })
      .select("id")
      .single();
    if (error) {
      const errMsg = "message" in error ? (error as { message: string }).message : "code" in error ? (error as { code: string }).code : JSON.stringify(error);
      console.error("Thread create error:", errMsg);
      return null;
    }
    return inserted?.id ?? null;
  };

  const selectUserAndOpenChat = async (u: UserItem) => {
    setSelectedUser(u);
    setSearchQuery("");
    setLoading(true);
    const threadId = await ensureThread(u.user_id, u.role);
    setLoading(false);
    if (!threadId) {
      setAlertMessage("채팅방을 열 수 없습니다.");
      return;
    }
    const thread: Thread = {
      id: threadId,
      user_id: u.user_id,
      user_role: u.role,
      updated_at: new Date().toISOString(),
      admin_read_at: null,
      ended_at: null,
      ended_by: null,
      profiles: { name: u.name, business_name: u.business_name, email: u.email },
      unreadCount: 0,
    };
    setSelectedThread(thread);
    loadThreads();
  };

  const selectThread = (t: Thread) => {
    setSelectedThread(t);
    setActiveTab(null);
    setSearchQuery("");
    setSearchResults([]);
  };

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
    supabase.from("admin_chat_threads").update({ admin_read_at: new Date().toISOString() }).eq("id", selectedThread.id).then(() => {
      setThreads((prev) =>
        prev.map((t) =>
          t.id === selectedThread.id ? { ...t, admin_read_at: new Date().toISOString(), unreadCount: 0 } : t
        )
      );
    });

    const tid = selectedThread.id;
    const ch = supabase
      .channel(`admin-cp-chat-${tid}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "admin_chat_messages", filter: `thread_id=eq.${tid}` }, () => loadMessages(tid))
      .subscribe();
    channelRef.current = ch;
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [selectedThread?.id]);

  const sendMessage = async () => {
    const text = input.trim();
    const hasImages = pendingImages.length > 0;
    if ((!text && !hasImages) || !selectedThread || !adminId || sending) return;

    setSending(true);
    const imageUrls: string[] = [];
    for (const file of pendingImages) {
      const blob = await compressImage(file);
      const path = `${adminId}/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
      const { error: uploadError } = await supabase.storage.from("chat-images").upload(path, blob, { contentType: "image/jpeg" });
      if (uploadError) {
        setAlertMessage("이미지 업로드에 실패했습니다.");
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
      await loadMessages(selectedThread.id);
      loadThreads();
      try {
        const { data } = await supabase.auth.getSession();
        if (data?.session?.access_token) {
          await fetch("/api/push/chat-reply", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
            body: JSON.stringify({ userId: selectedThread.user_id }),
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
      if (prev.length + files.length > 3) setAlertMessage("사진은 최대 3장까지입니다.");
      return next;
    });
    e.target.value = "";
  };

  const getThreadLabel = (t: Thread) => {
    const p = t.profiles;
    const name = t.user_role === "provider" ? (p?.business_name || p?.name) : p?.name;
    const roleLabel = t.user_role === "consumer" ? "소비자" : "시공업체";
    return `${name || "알 수 없음"} (${roleLabel})`;
  };

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
        setSelectedUser(null);
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
      setSelectedUser(null);
    } else {
      setAlertMessage("채팅 종료에 실패했습니다.");
    }
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4 overflow-hidden">
      {/* 목록 패널 - 모바일: 선택 전 전체, 선택 시 숨김. 데스크톱: 항상 표시 */}
      <div className={`flex w-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white md:w-56 md:shrink-0 ${selectedThread ? "hidden md:flex" : "flex"}`}>
        <div className="shrink-0 border-b border-gray-200 px-3 py-2">
          <h2 className="text-xs font-semibold text-gray-800">회원들에게 채팅하기</h2>
          <p className="mt-0.5 text-[10px] text-gray-500">관리자가 먼저 말걸 수 있습니다</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* 진행 중인 대화 */}
          <div className="shrink-0 border-b border-gray-100">
            <div className="px-3 py-1.5 text-[10px] font-medium text-gray-500">진행 중인 대화</div>
            {threadsLoading ? (
              <div className="px-3 py-1.5 text-center text-[10px] text-gray-400">불러오는 중...</div>
            ) : threads.length === 0 ? (
              <div className="px-3 py-2 text-[10px] text-gray-400">진행 중인 대화가 없습니다.</div>
            ) : (
              <ul className="max-h-32 overflow-y-auto">
                {threads.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => selectThread(t)}
                      className={`relative w-full px-3 py-2 text-left text-xs transition ${selectedThread?.id === t.id ? "bg-indigo-50 text-indigo-700" : "hover:bg-gray-50"}`}
                    >
                      <p className="font-medium truncate pr-6">{getThreadLabel(t)}</p>
                      <p className="mt-0.5 text-[10px] text-gray-500 truncate">
                        {new Date(t.updated_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                      {(t.unreadCount ?? 0) > 0 && (
                        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold text-white">
                          {t.unreadCount! > 99 ? "99+" : t.unreadCount}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {/* 새 대화 시작 */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 px-3 py-1.5 text-[10px] font-medium text-gray-500">새 대화 시작</div>
            <div className="flex shrink-0 border-t border-gray-100">
              <button
                type="button"
                onClick={() => { setActiveTab("consumer"); setSearchQuery(""); setSearchResults([]); }}
                className={`flex-1 px-3 py-2 text-xs font-medium transition ${activeTab === "consumer" ? "border-b-2 border-indigo-600 text-indigo-600" : "text-gray-500 hover:bg-gray-50"}`}
              >
                소비자
              </button>
              <button
                type="button"
                onClick={() => { setActiveTab("provider"); setSearchQuery(""); setSearchResults([]); }}
                className={`flex-1 px-3 py-2 text-xs font-medium transition ${activeTab === "provider" ? "border-b-2 border-indigo-600 text-indigo-600" : "text-gray-500 hover:bg-gray-50"}`}
              >
                시공업체
              </button>
            </div>
            {activeTab && (
              <>
                <div className="shrink-0 border-b border-gray-100 p-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={activeTab === "consumer" ? "이름, 이메일 검색" : "업체명, 이름, 이메일 검색"}
                    className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {searching ? (
                    <div className="p-3 text-center text-xs text-gray-500">검색 중...</div>
                  ) : searchResults.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-4 text-center text-xs text-gray-500">
                      <p>{activeTab === "consumer" ? "소비자" : "시공업체"} 목록을 불러오는 중이거나</p>
                      <p className="mt-1">검색 결과가 없습니다.</p>
                    </div>
                  ) : (
                    <ul className="divide-y divide-gray-200">
                      {searchResults.map((u) => {
                        const isExpanded = expandedUserId === u.user_id;
                        const hasDetail = u.role === "consumer" && u.categoryLabel;
                        return (
                          <li key={u.user_id}>
                            <div className={`rounded px-3 py-2 ${selectedThread?.user_id === u.user_id ? "bg-indigo-50" : ""}`}>
                              <button
                                type="button"
                                onClick={() => selectUserAndOpenChat(u)}
                                className={`w-full text-left text-xs transition ${selectedThread?.user_id === u.user_id ? "text-indigo-700" : "hover:bg-gray-50"} -m-1 p-1 rounded`}
                              >
                                <p className="font-medium truncate">
                                  {u.role === "provider" ? (u.business_name || u.name) : (u.projectTitle ? `${u.name} - ${u.projectTitle}` : u.name)}
                                </p>
                                {u.role === "provider" && u.email && <p className="mt-0.5 truncate text-[10px] text-gray-500">{u.email}</p>}
                              </button>
                              {hasDetail && (
                                <>
                                  <div className="mt-0.5 hidden md:block">
                                    <p className="truncate text-[10px] text-gray-500" title={u.categoryLabel}>
                                      대공정·공정일자: {u.categoryLabel}
                                    </p>
                                  </div>
                                  <div className="mt-0.5 md:hidden">
                                    {isExpanded ? (
                                      <>
                                        <p className="break-words text-[10px] text-gray-500">대공정·공정일자: {u.categoryLabel}</p>
                                        <button
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); setExpandedUserId(null); }}
                                          className="mt-0.5 text-[10px] text-gray-500 underline"
                                        >
                                          접기
                                        </button>
                                      </>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setExpandedUserId(u.user_id); }}
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
              </>
            )}
            {!activeTab && (
              <div className="flex flex-1 flex-col items-center justify-center p-4 text-center text-xs text-gray-500">
                <p>소비자 또는 시공업체를 선택한 후</p>
                <p className="mt-1">검색하여 대화할 회원을 찾으세요.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white">
        {selectedThread ? (
          <>
            <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3">
              <h3 className="text-base font-semibold text-gray-800">{getThreadLabel(selectedThread)}</h3>
              <button
                type="button"
                onClick={() => setShowCloseConfirm(true)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-amber-600 transition hover:bg-amber-50"
                title="채팅 종료"
              >
                채팅 종료
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {loading || messagesLoading ? (
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
                        <div className={`max-w-[90%] min-w-0 rounded-2xl px-4 py-2.5 text-sm sm:max-w-[75%] ${isAdmin ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-800"}`}>
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
                          <p className={`mt-1 text-[10px] ${isAdmin ? "text-indigo-200" : "text-gray-400"}`}>
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
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={pendingImages.length >= 3} className="shrink-0 rounded-xl border border-gray-200 px-3 py-2.5 text-gray-500 hover:bg-gray-50 disabled:opacity-50" title="이미지 첨부 (최대 3장)">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                </button>
                <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()} placeholder="메시지를 입력하세요..." className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                <button type="button" onClick={sendMessage} disabled={(!input.trim() && pendingImages.length === 0) || sending} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">전송</button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-gray-500">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-4 opacity-50">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <p className="text-sm">왼쪽에서 소비자 또는 시공업체를 선택한 후</p>
            <p className="mt-1 text-sm">목록에서 대화할 회원을 선택하세요</p>
          </div>
        )}
      </div>
      {lightbox && <ChatImageLightbox urls={lightbox.urls} index={lightbox.index} onClose={() => setLightbox(null)} />}
      {alertMessage && <AlertModal message={alertMessage} onClose={() => setAlertMessage(null)} variant="warning" />}
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
