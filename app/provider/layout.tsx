"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ProviderLayoutContext } from "./ProviderLayoutContext";
import AdminChatBubble from "@/components/AdminChatBubble";
import ConsumerProviderChatBubble from "@/components/ConsumerProviderChatBubble";

const SIDEBAR_COLLAPSED_KEY = "provider-sidebar-collapsed";

type NavItem = {
  label: string;
  href?: string;
  icon: React.ReactNode;
  badgeKey?: string;
  children?: { label: string; href: string; badgeKey?: string }[];
};

const NAV_ITEMS: NavItem[] = [
  {
    label: "대시보드",
    href: "/provider/dashboard",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="9" rx="1" />
        <rect x="14" y="14" width="7" height="9" rx="1" />
      </svg>
    ),
  },
  {
    label: "공사금액제안",
    badgeKey: "estimateWaiting",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
    children: [
      { label: "견적대기", href: "/provider/estimates" },
      { label: "계약완료", href: "/provider/estimates/completed" },
      { label: "매칭실패", href: "/provider/estimates/failed" },
    ],
  },
  {
    label: "프로젝트 관리",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
    children: [
      { label: "진행중", href: "/provider/projects" },
      { label: "완료 프로젝트", href: "/provider/projects/completed" },
    ],
  },
  {
    label: "고객 문의",
    href: "/provider/inquiries",
    badgeKey: "customerInquiries",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
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
      { label: "셀인코치", href: "/provider/chat", badgeKey: "chatUnread" },
      { label: "소비자와의 채팅", href: "/provider/consumer-chat", badgeKey: "consumerChatUnread" },
      { label: "종료된 채팅 (셀인코치)", href: "/provider/chat/ended" },
      { label: "종료된 채팅 (소비자)", href: "/provider/consumer-chat/ended" },
    ],
  },
  {
    label: "셀인코치에게 문의",
    href: "/provider/contact",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  {
    label: "업체 정보",
    href: "/provider/profile",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="14" rx="2" />
        <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
      </svg>
    ),
  },
];

function toArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return value.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

export default function ProviderLayout({ children }: { children: React.ReactNode }) {
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
  const [projectsExpanded, setProjectsExpanded] = useState(false);
  const [estimatesExpanded, setEstimatesExpanded] = useState(false);
  const [chatExpanded, setChatExpanded] = useState(false);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [consumerChatUnreadCount, setConsumerChatUnreadCount] = useState(0);
  const [businessName, setBusinessName] = useState<string>("");
  const [userId, setUserId] = useState<string | null>(null);
  const [estimateWaitingCount, setEstimateWaitingCount] = useState(0);
  const [customerInquiryCount, setCustomerInquiryCount] = useState(0);
  const pathname = usePathname();
  const initializedRef = useRef(false);

  useEffect(() => {
    if (pathname === "/provider/projects" || pathname.startsWith("/provider/projects/")) {
      setProjectsExpanded(true);
    }
  }, [pathname]);
  useEffect(() => {
    if (pathname === "/provider/estimates" || pathname.startsWith("/provider/estimates/")) {
      setEstimatesExpanded(true);
    }
  }, [pathname]);
  useEffect(() => {
    if (pathname === "/provider/chat" || pathname.startsWith("/provider/chat/") || pathname === "/provider/consumer-chat" || pathname.startsWith("/provider/consumer-chat/")) {
      setChatExpanded(true);
    }
  }, [pathname]);

  const loadChatUnreadCount = async (uid: string) => {
    const { data: thread } = await supabase
      .from("admin_chat_threads")
      .select("user_read_at, user_cleared_at, ended_at, ended_by")
      .eq("user_id", uid)
      .eq("user_role", "provider")
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
    if (!userId) return;
    loadChatUnreadCount(userId);
    const ch = supabase
      .channel("provider-chat-unread")
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_chat_threads" }, () => loadChatUnreadCount(userId))
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_chat_messages" }, () => loadChatUnreadCount(userId))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId]);

  const loadConsumerChatUnreadCount = async (uid: string) => {
    const { data: assignData } = await supabase.from("project_category_assignments").select("project_id").eq("provider_id", uid).eq("match_status", "completed");
    const projectIds = (assignData ?? []).map((r) => r.project_id);
    if (projectIds.length === 0) { setConsumerChatUnreadCount(0); return; }
    const { data: projectsData } = await supabase.from("projects").select("user_id").in("id", projectIds);
    const consumerIds = [...new Set((projectsData ?? []).map((p) => p.user_id).filter(Boolean))];
    let total = 0;
    for (const cid of consumerIds) {
      const { data: thread } = await supabase.from("consumer_provider_chat_threads").select("id, provider_read_at, provider_cleared_at, ended_at, ended_by").eq("consumer_id", cid).eq("provider_id", uid).maybeSingle();
      if (!thread) continue;
      const clearedAt = thread.provider_cleared_at ?? (thread.ended_by === "provider" ? thread.ended_at : null);
      const candidates = [clearedAt, thread.provider_read_at].filter(Boolean) as string[];
      const after = candidates.length > 0 ? candidates.sort()[candidates.length - 1] : null;
      let q = supabase.from("consumer_provider_chat_messages").select("id", { count: "exact", head: true }).eq("thread_id", thread.id).eq("sender_role", "consumer");
      if (after) q = q.gt("created_at", after);
      const { count } = await q;
      total += count ?? 0;
    }
    setConsumerChatUnreadCount(total);
  };

  useEffect(() => {
    if (!userId) return;
    loadConsumerChatUnreadCount(userId);
    const ch = supabase
      .channel("provider-consumer-chat-unread")
      .on("postgres_changes", { event: "*", schema: "public", table: "consumer_provider_chat_threads" }, () => loadConsumerChatUnreadCount(userId))
      .on("postgres_changes", { event: "*", schema: "public", table: "consumer_provider_chat_messages" }, () => loadConsumerChatUnreadCount(userId))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId]);

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

  const categoriesRef = useRef<string[]>([]);
  const [isLg, setIsLg] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsLg(mq.matches);
    const handler = () => setIsLg(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  const showCollapsed = sidebarCollapsed && isLg;

  const loadEstimateWaitingCount = async (cats: string[]) => {
    const { data } = await supabase
      .from("projects")
      .select("id, work_tree, work_details, category")
      .eq("status", "estimate_waiting");
    const list = data ?? [];
    const providerCats = cats.map((c) => c.trim()).filter(Boolean);
    const matchesProject = (projectCat: string) =>
      providerCats.length === 0 || providerCats.some((pc) => (pc ?? "").trim() === (projectCat ?? "").trim());
    const count = list.filter((p: { work_tree?: { cat: string }[]; work_details?: Record<string, unknown>; category?: string[] }) => {
      if (providerCats.length === 0) return true;
      const tree = p.work_tree ?? [];
      if (tree.length === 0 && p.work_details) return Object.keys(p.work_details).some((c) => matchesProject(c.trim()));
      if (tree.length > 0) return tree.some((g) => matchesProject(g.cat?.trim() ?? ""));
      if (p.category?.length) return (p.category as string[]).some((c) => matchesProject(String(c).trim()));
      return false;
    }).length;
    setEstimateWaitingCount(count);
  };

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const init = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      if (!session) { window.location.href = "/login"; return; }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, business_name, name, category")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (!profile || profile.role !== "provider") {
        window.location.href = "/login";
        return;
      }
      setUserId(session.user.id);
      setBusinessName(profile.business_name || profile.name || "업체");
      const cats = toArray(profile.category);
      categoriesRef.current = cats;
      await loadEstimateWaitingCount(cats);

      const { count } = await supabase
        .from("consumer_provider_inquiries")
        .select("id", { count: "exact", head: true })
        .eq("provider_id", session.user.id)
        .is("read_at", null);
      setCustomerInquiryCount(count ?? 0);
    };
    init();
  }, []);

  // 견적대기 프로젝트 실시간 구독 (초기화 완료 후)
  useEffect(() => {
    if (!businessName) return;
    const cats = categoriesRef.current;
    const reload = () => loadEstimateWaitingCount(cats);
    const channel = supabase
      .channel("provider-estimate-waiting")
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, reload)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [businessName]);

  // 고객 문의 실시간 구독
  useEffect(() => {
    if (!userId) return;
    const loadInquiryCount = async () => {
      const { count } = await supabase
        .from("consumer_provider_inquiries")
        .select("id", { count: "exact", head: true })
        .eq("provider_id", userId)
        .is("read_at", null);
      setCustomerInquiryCount(count ?? 0);
    };
    loadInquiryCount();
    const channel = supabase
      .channel("provider-customer-inquiries")
      .on("postgres_changes", { event: "*", schema: "public", table: "consumer_provider_inquiries" }, loadInquiryCount)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  // onboarding 페이지는 레이아웃 제외
  if (pathname === "/provider/onboarding") {
    return <>{children}</>;
  }

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const closeSidebar = () => setSidebarOpen(false);
  const toggleSidebarCollapse = () => setSidebarCollapsed((c) => !c);

  const mainPl = sidebarCollapsed ? "lg:pl-16" : "lg:pl-60";

  return (
    <ProviderLayoutContext.Provider value={{ sidebarCollapsed }}>
    <div className="min-h-screen bg-gray-50">
      {/* 상단 헤더 */}
      <header className="fixed top-0 left-0 right-0 z-30 flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4 shadow-sm">
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
          <Link href="/provider/dashboard" className="text-sm font-bold tracking-tight text-gray-800">
            셀인코치
          </Link>
        </div>

        <div className="flex items-center gap-2">
          {businessName && (
            <span className="hidden text-xs text-gray-500 sm:block">
              <span className="font-medium text-gray-700">{businessName}</span>님
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
        className={`fixed top-0 left-0 z-50 flex h-full w-60 flex-col bg-white shadow-xl transition-all duration-300 ease-in-out
          lg:translate-x-0 lg:shadow-none lg:border-r lg:border-gray-200
          ${sidebarCollapsed ? "lg:w-16" : "lg:w-60"}
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        {/* 사이드바 헤더 */}
        <div className={`flex h-14 shrink-0 items-center justify-between border-b border-gray-100 ${showCollapsed ? "lg:px-2" : "px-5"}`}>
          <div className={`flex items-center gap-2.5 ${showCollapsed ? "lg:justify-center lg:gap-0" : ""}`}>
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="7" width="20" height="14" rx="2" />
                <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
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

        {/* 업체 정보 */}
        {businessName && !showCollapsed && (
          <div className="border-b border-gray-100 px-5 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600">
                {businessName.charAt(0)}
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-800">{businessName}</p>
                <p className="text-[10px] text-gray-400">공급업체</p>
              </div>
            </div>
          </div>
        )}
        {businessName && showCollapsed && (
          <div className="hidden border-b border-gray-100 py-3 lg:flex lg:justify-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600" title={businessName}>
              {businessName.charAt(0)}
            </div>
          </div>
        )}

        <nav className={`flex-1 overflow-y-auto py-4 ${showCollapsed ? "lg:px-2" : "px-3"}`}>
          <ul className="space-y-0.5">
            {NAV_ITEMS.map((item) => {
              if (item.children) {
                const isExpanded =
                  item.label === "프로젝트 관리" ? projectsExpanded
                  : item.label === "공사금액제안" ? estimatesExpanded
                  : item.label === "실시간 채팅" ? chatExpanded
                  : true;
                const toggleExpanded =
                  item.label === "프로젝트 관리" ? () => setProjectsExpanded((p) => !p)
                  : item.label === "공사금액제안" ? () => setEstimatesExpanded((e) => !e)
                  : item.label === "실시간 채팅" ? () => setChatExpanded((c) => !c)
                  : undefined;
                const badgeCount = item.badgeKey === "estimateWaiting" ? estimateWaitingCount
                  : item.label === "실시간 채팅" ? chatUnreadCount + consumerChatUnreadCount : 0;
                const firstChildHref = item.children[0]?.href;
                const isChildActive = item.children.some((c) => pathname === c.href || pathname.startsWith(c.href + "/"));

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
                            : child.badgeKey === "consumerChatUnread" ? consumerChatUnreadCount : 0;
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
                item.href === "/provider/dashboard"
                  ? pathname === "/provider/dashboard"
                  : pathname === item.href || pathname.startsWith(item.href + "/");
              const badgeCount = item.badgeKey === "estimateWaiting" ? estimateWaitingCount
                : item.badgeKey === "customerInquiries" ? customerInquiryCount : 0;
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
                    <span className="relative shrink-0">
                      <span className={isActive ? "text-indigo-500" : "text-gray-400"}>
                        {item.icon}
                      </span>
                      {badgeCount > 0 && (
                        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                          {badgeCount > 99 ? "99+" : badgeCount}
                        </span>
                      )}
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
      <main className={`min-h-screen pt-14 ${mainPl}`}>
        <div className="p-4 sm:p-6">{children}</div>
      </main>

      {/* 셀인코치 채팅 말풍선 (채팅 페이지 제외) */}
      {userId && !pathname?.startsWith("/provider/chat") && !pathname?.startsWith("/provider/consumer-chat") && (
        <AdminChatBubble userRole="provider" userId={userId} />
      )}
      {/* 소비자와의 채팅 말풍선 (채팅 페이지 제외) */}
      {userId && !pathname?.startsWith("/provider/chat") && !pathname?.startsWith("/provider/consumer-chat") && (
        <ConsumerProviderChatBubble userRole="provider" userId={userId} />
      )}
    </div>
    </ProviderLayoutContext.Provider>
  );
}
