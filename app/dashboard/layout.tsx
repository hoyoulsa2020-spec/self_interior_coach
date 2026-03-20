"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { DashboardLayoutContext } from "./DashboardLayoutContext";
import AdminChatBubble from "@/components/AdminChatBubble";
import ConsumerProviderChatBubble from "@/components/ConsumerProviderChatBubble";

const SIDEBAR_COLLAPSED_KEY = "dashboard-sidebar-collapsed";

type NavItem = {
  label: string;
  href?: string;
  icon: React.ReactNode;
  children?: { label: string; href: string; badgeKey?: string }[];
};

const NAV_ITEMS: NavItem[] = [
  {
    label: "대시보드",
    href: "/dashboard",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    label: "내 프로젝트",
    href: "/dashboard/projects",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    label: "공정표작성",
    href: "/dashboard/process-table",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="1" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="3" y1="15" x2="21" y2="15" />
        <line x1="9" y1="3" x2="9" y2="21" />
        <line x1="15" y1="3" x2="15" y2="21" />
      </svg>
    ),
  },
  {
    label: "견적서 검토요청",
    href: "/dashboard/estimates",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
  {
    label: "실시간 채팅",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
    children: [
      { label: "셀인코치", href: "/dashboard/chat", badgeKey: "chatUnread" },
      { label: "시공업체와의 미팅", href: "/dashboard/provider-chat", badgeKey: "providerChatUnread" },
      { label: "종료된 채팅 (셀인코치)", href: "/dashboard/chat/ended" },
      { label: "종료된 채팅 (시공업체)", href: "/dashboard/provider-chat/ended" },
    ],
  },
  {
    label: "셀인코치에게 문의",
    href: "/dashboard/consultations",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
  {
    label: "업체문의하기",
    href: "/dashboard/provider-inquiries",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    label: "시공업체 견적확인",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
    children: [
      { label: "견적확인", href: "/dashboard/providers" },
      { label: "완료된 공정", href: "/dashboard/providers/completed" },
    ],
  },
  {
    label: "공지사항",
    href: "/dashboard/notices",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
        <path d="M18 14h-8" />
        <path d="M15 18h-6" />
        <path d="M10 6h8v4h-8V6z" />
      </svg>
    ),
  },
  {
    label: "내 정보",
    href: "/dashboard/profile",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const skipNextWriteRef = useRef(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      if (saved !== null) setSidebarCollapsed(saved === "1");
    } catch {
      /* ignore */
    }
  }, []);
  const [providersExpanded, setProvidersExpanded] = useState(false);
  const [chatExpanded, setChatExpanded] = useState(false);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [providerChatUnreadCount, setProviderChatUnreadCount] = useState(0);
  const [userName, setUserName] = useState<string>("");
  const [userId, setUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const pathname = usePathname();
  const initializedRef = useRef(false);

  useEffect(() => {
    if (pathname === "/dashboard/providers" || pathname.startsWith("/dashboard/providers/")) {
      setProvidersExpanded(true);
    }
  }, [pathname]);
  useEffect(() => {
    if (pathname === "/dashboard/chat" || pathname.startsWith("/dashboard/chat/") || pathname === "/dashboard/provider-chat" || pathname.startsWith("/dashboard/provider-chat/")) {
      setChatExpanded(true);
    }
  }, [pathname]);

  const loadChatUnreadCount = async (uid: string) => {
    const { data: thread } = await supabase
      .from("admin_chat_threads")
      .select("id, user_read_at, user_cleared_at, ended_at, ended_by")
      .eq("user_id", uid)
      .eq("user_role", "consumer")
      .is("ended_at", null)
      .maybeSingle();
    if (!thread) {
      setChatUnreadCount(0);
      return;
    }
    const clearedAt = thread.user_cleared_at ?? (thread.ended_by === "user" ? thread.ended_at : null);
    const candidates = [clearedAt, thread.user_read_at].filter(Boolean) as string[];
    const after = candidates.length > 0 ? candidates.sort()[candidates.length - 1] : null;
    let q = supabase
      .from("admin_chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("thread_id", thread.id)
      .eq("sender_role", "admin");
    if (after) q = q.gt("created_at", after);
    const { count } = await q;
    setChatUnreadCount(count ?? 0);
  };

  useEffect(() => {
    if (!userId || userRole !== "consumer") return;
    loadChatUnreadCount(userId);
    const ch = supabase
      .channel("dashboard-chat-unread")
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_chat_threads" }, () => loadChatUnreadCount(userId))
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_chat_messages" }, () => loadChatUnreadCount(userId))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, userRole]);

  const loadProviderChatUnreadCount = async (uid: string) => {
    const { data: projectsData } = await supabase.from("projects").select("id").eq("user_id", uid);
    const projectIds = (projectsData ?? []).map((p) => p.id);
    if (projectIds.length === 0) {
      setProviderChatUnreadCount(0);
      return;
    }
    const { data: assignData } = await supabase
      .from("project_category_assignments")
      .select("provider_id")
      .in("project_id", projectIds)
      .eq("match_status", "completed");
    const providerIds = [...new Set((assignData ?? []).map((r) => r.provider_id))];
    let total = 0;
    for (const pid of providerIds) {
      const { data: thread } = await supabase
        .from("consumer_provider_chat_threads")
        .select("id, consumer_read_at, consumer_cleared_at, ended_at, ended_by")
        .eq("consumer_id", uid)
        .eq("provider_id", pid)
        .maybeSingle();
      if (!thread) continue;
      const clearedAt = thread.consumer_cleared_at ?? (thread.ended_by === "consumer" ? thread.ended_at : null);
      const candidates = [clearedAt, thread.consumer_read_at].filter(Boolean) as string[];
      const after = candidates.length > 0 ? candidates.sort()[candidates.length - 1] : null;
      let q = supabase
        .from("consumer_provider_chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("thread_id", thread.id)
        .eq("sender_role", "provider");
      if (after) q = q.gt("created_at", after);
      const { count } = await q;
      total += count ?? 0;
    }
    setProviderChatUnreadCount(total);
  };

  useEffect(() => {
    if (!userId || userRole !== "consumer") return;
    loadProviderChatUnreadCount(userId);
    const ch = supabase
      .channel("dashboard-provider-chat-unread")
      .on("postgres_changes", { event: "*", schema: "public", table: "consumer_provider_chat_threads" }, () => loadProviderChatUnreadCount(userId))
      .on("postgres_changes", { event: "*", schema: "public", table: "consumer_provider_chat_messages" }, () => loadProviderChatUnreadCount(userId))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, userRole]);

  useEffect(() => {
    if (skipNextWriteRef.current) {
      skipNextWriteRef.current = false;
      return;
    }
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [sidebarCollapsed]);

  const [isLg, setIsLg] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsLg(mq.matches);
    const handler = () => setIsLg(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  const showCollapsed = sidebarCollapsed && isLg;

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const init = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      if (!session) { window.location.href = "/login"; return; }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, name")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (!profile || (profile.role !== "consumer" && profile.role !== "admin" && profile.role !== "super_admin")) {
        window.location.href = "/login";
        return;
      }
      setUserName(profile.name || session.user.email?.split("@")[0] || "회원");
      setUserId(session.user.id);
      setUserRole(profile.role);
    };
    init();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const closeSidebar = () => setSidebarOpen(false);
  const toggleSidebarCollapse = () => setSidebarCollapsed((c) => !c);
  const mainPl = sidebarCollapsed ? "lg:pl-16" : "lg:pl-60";

  return (
    <DashboardLayoutContext.Provider value={{ sidebarCollapsed }}>
    <div className="min-h-screen bg-gray-50">
      {/* 상단 헤더 */}
      <header className="fixed top-0 left-0 right-0 z-30 flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4 shadow-sm pt-[env(safe-area-inset-top,0px)]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-1.5 text-gray-500 transition hover:bg-gray-100 lg:hidden"
            aria-label="메뉴 열기"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <Link href="/dashboard" className="text-sm font-bold tracking-tight text-gray-800">
            셀인코치
          </Link>
        </div>

        <div className="flex items-center gap-2">
          {userName && (
            <span className="hidden text-xs text-gray-500 sm:block">
              <span className="font-medium text-gray-700">{userName}</span>님
            </span>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 active:bg-gray-100"
          >
            로그아웃
          </button>
        </div>
      </header>

      {/* 모바일 오버레이 */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={closeSidebar} />
      )}

      {/* 사이드바 */}
      <aside
        className={`fixed top-0 left-0 z-50 flex h-full w-60 flex-col bg-white shadow-xl transition-all duration-300 ease-in-out pt-[env(safe-area-inset-top,0px)]
          lg:translate-x-0 lg:shadow-none lg:border-r lg:border-gray-200
          ${sidebarCollapsed ? "lg:w-16" : "lg:w-60"}
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        {/* 사이드바 헤더 */}
        <div className={`flex h-14 shrink-0 items-center justify-between border-b border-gray-100 ${showCollapsed ? "lg:px-2" : "px-5"}`}>
          <div className={`flex items-center gap-2.5 ${showCollapsed ? "lg:justify-center lg:gap-0" : ""}`}>
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            {!showCollapsed && <span className="text-sm font-bold text-gray-800">셀인코치</span>}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={toggleSidebarCollapse}
              className="hidden rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 lg:flex"
              aria-label={showCollapsed ? "사이드바 펼치기" : "사이드바 접기"}
              title={showCollapsed ? "사이드바 펼치기" : "사이드바 접기"}
            >
              {showCollapsed ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={closeSidebar}
              className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 lg:hidden"
              aria-label="메뉴 닫기"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* 사용자 정보 */}
        {userName && !showCollapsed && (
          <div className="border-b border-gray-100 px-5 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600">
                {userName.charAt(0)}
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-800">{userName}</p>
                <p className="text-[10px] text-gray-400">개인고객</p>
              </div>
            </div>
          </div>
        )}
        {userName && showCollapsed && (
          <div className="hidden border-b border-gray-100 py-3 lg:flex lg:justify-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600" title={userName}>
              {userName.charAt(0)}
            </div>
          </div>
        )}

        <nav className={`flex-1 overflow-y-auto py-4 ${showCollapsed ? "lg:px-2" : "px-3"}`}>
          <ul className="space-y-0.5">
            {NAV_ITEMS.map((item) => {
              if (item.children) {
                const isExpanded = item.label === "시공업체 견적확인" ? providersExpanded : item.label === "실시간 채팅" ? chatExpanded : true;
                const toggleExpanded = item.label === "시공업체 견적확인" ? () => setProvidersExpanded((p) => !p) : item.label === "실시간 채팅" ? () => setChatExpanded((c) => !c) : undefined;
                const firstChildHref = item.children[0]?.href;
                const isChildActive = item.children.some((c) => pathname === c.href || pathname.startsWith(c.href + "/"));
                const badgeCount = item.label === "실시간 채팅" ? chatUnreadCount + providerChatUnreadCount : 0;

                if (showCollapsed) {
                  return (
                    <li key={item.label}>
                      <Link
                        href={firstChildHref!}
                        onClick={closeSidebar}
                        className={`flex w-full items-center justify-center rounded-xl px-0 py-2.5 lg:justify-center
                          ${isChildActive ? "bg-indigo-50 text-indigo-600" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}`}
                        title={item.label}
                      >
                        <span className="relative shrink-0">
                          <span className={isChildActive ? "text-indigo-500" : "text-gray-400"}>{item.icon}</span>
                          {badgeCount > 0 && (
                            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                              {badgeCount > 99 ? "99+" : badgeCount}
                            </span>
                          )}
                        </span>
                      </Link>
                    </li>
                  );
                }

                return (
                  <li key={item.label}>
                    <button
                      type="button"
                      onClick={toggleExpanded}
                      className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    >
                      <div className="flex items-center gap-3">
                        <span className="relative shrink-0">
                          <span className="text-gray-400">{item.icon}</span>
                          {badgeCount > 0 && (
                            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                              {badgeCount > 99 ? "99+" : badgeCount}
                            </span>
                          )}
                        </span>
                        {item.label}
                      </div>
                      <span className={`shrink-0 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </span>
                    </button>
                    {isExpanded && (
                      <ul className="mt-0.5 ml-6 space-y-0.5 border-l border-gray-200 pl-3">
                        {item.children.map((child) => {
                          const isActive = pathname === child.href;
                          const childBadge = child.badgeKey === "chatUnread" ? chatUnreadCount
                            : child.badgeKey === "providerChatUnread" ? providerChatUnreadCount : 0;
                          return (
                            <li key={child.href}>
                              <Link
                                href={child.href}
                                onClick={closeSidebar}
                                className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-xs font-medium transition
                                  ${isActive ? "bg-indigo-50 text-indigo-600" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}`}
                              >
                                {child.label}
                                {childBadge > 0 && (
                                  <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                                    {childBadge > 99 ? "99+" : childBadge}
                                  </span>
                                )}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              }
              const isActive =
                item.href === "/dashboard"
                  ? pathname === "/dashboard"
                  : pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <li key={item.href}>
                  <Link
                    href={item.href!}
                    onClick={closeSidebar}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition
                      ${showCollapsed ? "lg:justify-center lg:px-0" : ""}
                      ${isActive
                        ? "bg-indigo-50 text-indigo-600"
                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                      }`}
                    title={showCollapsed ? item.label : undefined}
                  >
                    <span className={isActive ? "text-indigo-500" : "text-gray-400"}>
                      {item.icon}
                    </span>
                    {!showCollapsed && item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* 사이드바 하단 */}
        <div className={`shrink-0 border-t border-gray-100 py-4 ${showCollapsed ? "lg:px-2" : "px-4"}`}>
          <button
            type="button"
            onClick={handleLogout}
            className={`flex w-full items-center gap-2.5 rounded-xl py-2.5 text-sm text-gray-500 transition hover:bg-gray-100 hover:text-gray-700
              ${showCollapsed ? "lg:justify-center lg:px-0" : "px-3"}`}
            title="로그아웃"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            {!showCollapsed && "로그아웃"}
          </button>
        </div>
      </aside>

      {/* 본문 */}
      <main className={`min-h-screen pt-[calc(3.5rem+env(safe-area-inset-top,0px))] ${mainPl}`}>
        <div className="p-4 sm:p-6">{children}</div>
      </main>

      {/* 셀인코치 채팅 말풍선 (소비자만, 채팅 페이지 제외) */}
      {userRole === "consumer" && userId && !pathname?.startsWith("/dashboard/chat") && !pathname?.startsWith("/dashboard/provider-chat") && (
        <AdminChatBubble userRole="consumer" userId={userId} />
      )}
      {/* 시공업체와의 미팅 말풍선 (소비자만, 채팅 페이지 제외) */}
      {userRole === "consumer" && userId && !pathname?.startsWith("/dashboard/chat") && !pathname?.startsWith("/dashboard/provider-chat") && (
        <ConsumerProviderChatBubble userRole="consumer" userId={userId} />
      )}
    </div>
    </DashboardLayoutContext.Provider>
  );
}
