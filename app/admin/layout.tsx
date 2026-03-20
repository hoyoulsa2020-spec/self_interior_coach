"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef, Suspense } from "react";
import { supabase } from "@/lib/supabaseClient";
import { AdminLayoutContext } from "./AdminLayoutContext";

const SIDEBAR_COLLAPSED_KEY = "admin-sidebar-collapsed";

function parseArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try {
      const p = JSON.parse(value);
      if (Array.isArray(p)) return p.map(String);
    } catch {
      return value.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

type NavItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
};

const NAV_ITEMS: NavItem[] = [
  {
    label: "대시보드",
    href: "/admin",
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
    label: "프로젝트관리",
    href: "/admin/projects",
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
    label: "개인회원관리",
    href: "/admin/members",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
      </svg>
    ),
  },
  {
    label: "시공업체 유료상품",
    href: "/admin/provider-products",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
      </svg>
    ),
  },
  {
    label: "견적서 검토요청",
    href: "/admin/estimates",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
  {
    label: "고객상담요청",
    href: "/admin/customer-requests",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    label: "시공업체상담요청",
    href: "/admin/provider-requests",
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
    label: "견적연구소",
    href: "/admin/estimate-lab",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    ),
  },
  {
    label: "푸시 발송",
    href: "/admin/push",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    ),
  },
  {
    label: "접속로그",
    href: "/admin/access-log",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
  },
  {
    label: "공지사항",
    href: "/admin/notices",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  {
    label: "설정",
    href: "/admin/settings",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

function AdminLayoutInner({ children }: { children: React.ReactNode }) {
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
  const [projectOpen, setProjectOpen] = useState(false);
  const [providerOpen, setProviderOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [noticesOpen, setNoticesOpen] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [pendingCounts, setPendingCounts] = useState({ estimates: 0, inquiries: 0, providerRequests: 0, projects: 0, chatUnread: 0 });
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeCategoryParam = searchParams.get("category");

  const isOnProjects = pathname === "/admin/projects" || pathname.startsWith("/admin/projects/");
  const isOnBidMonitor = pathname === "/admin/bid-monitor" || pathname.startsWith("/admin/bid-monitor/");
  const isOnProviders = pathname === "/admin/providers" || pathname.startsWith("/admin/providers/");
  const isOnChat = pathname === "/admin/chat" || pathname.startsWith("/admin/chat/");
  const isOnNotices = pathname.startsWith("/admin/notices/");

  // 프로젝트 관련 페이지에 있으면 자동 펼치기
  useEffect(() => {
    if (isOnProjects || isOnBidMonitor) setProjectOpen(true);
  }, [isOnProjects, isOnBidMonitor]);

  // providers 페이지에 있으면 자동 펼치기
  useEffect(() => {
    if (isOnProviders) setProviderOpen(true);
  }, [isOnProviders]);

  // 채팅 페이지에 있으면 자동 펼치기
  useEffect(() => {
    if (isOnChat) setChatOpen(true);
  }, [isOnChat]);

  // 공지사항 페이지에 있으면 자동 펼치기
  useEffect(() => {
    if (isOnNotices) setNoticesOpen(true);
  }, [isOnNotices]);

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

  // category 테이블에서 목록 조회
  useEffect(() => {
    const fetchCategories = async () => {
      const { data } = await supabase
        .from("category")
        .select("name, sort_order")
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true });
      if (data) {
        setCategories(data.map((r) => r.name).filter(Boolean));
      }
    };
    fetchCategories();
  }, []);

  // 초기 조회 + 실시간 구독
  useEffect(() => {
    const load = async () => {
      const [estimatesRes, inquiriesRes, providerRes, projectsRes, chatRes] = await Promise.all([
        supabase.from("estimate_reviews").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("inquiries").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("provider_inquiries").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("projects").select("id", { count: "exact", head: true }).in("status", ["pending", "publish_requested"]).is("scheduled_delete_at", null),
        supabase.from("admin_chat_threads").select("id", { count: "exact", head: true }).is("ended_at", null).in("last_sender_role", ["consumer", "provider"]),
      ]);
      setPendingCounts({
        estimates: estimatesRes.count ?? 0,
        inquiries: inquiriesRes.count ?? 0,
        providerRequests: providerRes.count ?? 0,
        projects: projectsRes.count ?? 0,
        chatUnread: chatRes.count ?? 0,
      });
    };

    load();

    const channel = supabase
      .channel("admin-pending-counts")
      .on("postgres_changes", { event: "*", schema: "public", table: "estimate_reviews" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "inquiries" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "provider_inquiries" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_chat_threads" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_chat_messages" }, load)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const closeSidebar = () => setSidebarOpen(false);
  const toggleSidebarCollapse = () => setSidebarCollapsed((c) => !c);
  const mainPl = sidebarCollapsed ? "lg:pl-16" : "lg:pl-60";

  return (
    <AdminLayoutContext.Provider value={{ sidebarCollapsed }}>
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
          <span className="text-sm font-bold tracking-tight text-gray-800">셀인코치 관리자</span>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 active:bg-gray-100"
        >
          로그아웃
        </button>
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
        <div className={`flex h-14 shrink-0 items-center justify-between border-b border-gray-100 ${showCollapsed ? "lg:px-2" : "px-5"}`}>
          <div className={`flex items-center gap-2.5 ${showCollapsed ? "lg:justify-center lg:gap-0" : ""}`}>
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="9" rx="1" />
                <rect x="14" y="14" width="7" height="9" rx="1" />
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

        <nav className={`flex-1 overflow-y-auto py-4 ${showCollapsed ? "lg:px-2" : "px-3"}`}>
          <ul className="space-y-0.5">
            {/* 대시보드 */}
            <li>
              <Link
                href="/admin"
                onClick={closeSidebar}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition
                  ${showCollapsed ? "lg:justify-center lg:px-0" : ""}
                  ${pathname === "/admin" ? "bg-indigo-50 text-indigo-600" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}`}
                title={showCollapsed ? "대시보드" : undefined}
              >
                <span className={pathname === "/admin" ? "text-indigo-500" : "text-gray-400"}>
                  {NAV_ITEMS[0].icon}
                </span>
                {!showCollapsed && "대시보드"}
              </Link>
            </li>

            {/* 프로젝트관리 — 아코디언 */}
            <li>
              {showCollapsed ? (
                <Link
                  href="/admin/projects"
                  onClick={closeSidebar}
                  className={`flex w-full items-center justify-center rounded-xl px-0 py-2.5 lg:justify-center
                    ${isOnProjects || isOnBidMonitor ? "bg-indigo-50 text-indigo-600" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}`}
                  title="프로젝트관리"
                >
                  <span className="relative shrink-0">
                    <span className={isOnProjects || isOnBidMonitor ? "text-indigo-500" : "text-gray-400"}>
                      {NAV_ITEMS[1].icon}
                    </span>
                    {pendingCounts.projects > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                        {pendingCounts.projects > 99 ? "99+" : pendingCounts.projects}
                      </span>
                    )}
                  </span>
                </Link>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setProjectOpen((v) => !v)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition
                      ${isOnProjects || isOnBidMonitor ? "bg-indigo-50 text-indigo-600" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}`}
                  >
                    <span className={isOnProjects || isOnBidMonitor ? "text-indigo-500" : "text-gray-400"}>
                      {NAV_ITEMS[1].icon}
                    </span>
                    <span className="flex-1 text-left">프로젝트관리</span>
                    {pendingCounts.projects > 0 && (
                      <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                        {pendingCounts.projects > 99 ? "99+" : pendingCounts.projects}
                      </span>
                    )}
                    <svg
                      width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                      className={`shrink-0 transition-transform duration-200 ${projectOpen ? "rotate-180" : ""}`}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>

                  {projectOpen && (
                    <ul className="mt-0.5 space-y-0.5 pl-9">
                      <li>
                        <Link
                          href="/admin/projects"
                          onClick={closeSidebar}
                          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition
                            ${isOnProjects ? "text-indigo-600 bg-indigo-50" : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"}`}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
                          프로젝트관리
                          {pendingCounts.projects > 0 && (
                            <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                              {pendingCounts.projects > 99 ? "99+" : pendingCounts.projects}
                            </span>
                          )}
                        </Link>
                      </li>
                      <li>
                        <Link
                          href="/admin/bid-monitor"
                          onClick={closeSidebar}
                          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition
                            ${isOnBidMonitor ? "text-indigo-600 bg-indigo-50" : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"}`}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
                          견적입찰모니터
                        </Link>
                      </li>
                    </ul>
                  )}
                </>
              )}
            </li>

            {/* 개인회원관리 */}
            <li>
              <Link
                href="/admin/members"
                onClick={closeSidebar}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition
                  ${showCollapsed ? "lg:justify-center lg:px-0" : ""}
                  ${pathname.startsWith("/admin/members") ? "bg-indigo-50 text-indigo-600" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}`}
                title={showCollapsed ? "개인회원관리" : undefined}
              >
                <span className={pathname.startsWith("/admin/members") ? "text-indigo-500" : "text-gray-400"}>
                  {NAV_ITEMS[2].icon}
                </span>
                {!showCollapsed && "개인회원관리"}
              </Link>
            </li>

            {/* 시공업체관리 — 아코디언 */}
            <li>
              {showCollapsed ? (
                <Link
                  href="/admin/providers"
                  onClick={closeSidebar}
                  className={`flex w-full items-center justify-center rounded-xl px-0 py-2.5 lg:justify-center
                    ${isOnProviders ? "bg-indigo-50 text-indigo-600" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}`}
                  title="시공업체관리"
                >
                  <span className={isOnProviders ? "text-indigo-500" : "text-gray-400"}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="7" width="20" height="14" rx="2" />
                      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
                    </svg>
                  </span>
                </Link>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setProviderOpen((v) => !v)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition
                      ${isOnProviders ? "bg-indigo-50 text-indigo-600" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}`}
                  >
                    <span className={isOnProviders ? "text-indigo-500" : "text-gray-400"}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="7" width="20" height="14" rx="2" />
                        <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
                      </svg>
                    </span>
                    <span className="flex-1 text-left">시공업체관리</span>
                    <svg
                      width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                      className={`shrink-0 transition-transform duration-200 ${providerOpen ? "rotate-180" : ""}`}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>

                  {providerOpen && (
                    <ul className="mt-0.5 space-y-0.5 pl-9">
                      <li>
                        <Link
                          href="/admin/providers"
                          onClick={closeSidebar}
                          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition
                            ${isOnProviders && !activeCategoryParam ? "text-indigo-600 bg-indigo-50" : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"}`}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
                          전체
                        </Link>
                      </li>
                      {categories.map((cat) => {
                        const isActive = isOnProviders && activeCategoryParam === cat;
                        return (
                          <li key={cat}>
                            <Link
                              href={`/admin/providers?category=${encodeURIComponent(cat)}`}
                              onClick={closeSidebar}
                              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition
                                ${isActive ? "text-indigo-600 bg-indigo-50" : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"}`}
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
                              {cat}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              )}
            </li>

            {/* 실시간 채팅 — 아코디언 */}
            <li>
              {showCollapsed ? (
                <Link
                  href="/admin/chat"
                  onClick={closeSidebar}
                  className={`flex w-full items-center justify-center rounded-xl px-0 py-2.5 lg:justify-center
                    ${pathname === "/admin/chat" ? "bg-indigo-50 text-indigo-600" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}`}
                  title="실시간 채팅"
                >
                  <span className="relative shrink-0">
                    <span className={pathname === "/admin/chat" ? "text-indigo-500" : "text-gray-400"}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                    </span>
                    {pendingCounts.chatUnread > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                        {pendingCounts.chatUnread > 99 ? "99+" : pendingCounts.chatUnread}
                      </span>
                    )}
                  </span>
                </Link>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setChatOpen((v) => !v)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition
                      ${isOnChat ? "bg-indigo-50 text-indigo-600" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}`}
                  >
                    <span className="relative shrink-0">
                      <span className={isOnChat ? "text-indigo-500" : "text-gray-400"}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                      </span>
                      {pendingCounts.chatUnread > 0 && (
                        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                          {pendingCounts.chatUnread > 99 ? "99+" : pendingCounts.chatUnread}
                        </span>
                      )}
                    </span>
                    <span className="flex-1 text-left">실시간 채팅</span>
                    <svg
                      width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                      className={`shrink-0 transition-transform duration-200 ${chatOpen ? "rotate-180" : ""}`}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>

                  {chatOpen && (
                    <ul className="mt-0.5 space-y-0.5 pl-9">
                      <li>
                        <Link
                          href="/admin/chat"
                          onClick={closeSidebar}
                          className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs font-medium transition
                            ${pathname === "/admin/chat" ? "text-indigo-600 bg-indigo-50" : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"}`}
                        >
                          <span className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
                            실시간 채팅
                          </span>
                          {pendingCounts.chatUnread > 0 && (
                            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                              {pendingCounts.chatUnread > 99 ? "99+" : pendingCounts.chatUnread}
                            </span>
                          )}
                        </Link>
                      </li>
                      <li>
                        <Link
                          href="/admin/chat/ended"
                          onClick={closeSidebar}
                          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition
                            ${pathname === "/admin/chat/ended" ? "text-indigo-600 bg-indigo-50" : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"}`}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
                          종료된 채팅
                        </Link>
                      </li>
                      <li>
                        <Link
                          href="/admin/chat/consumer-provider"
                          onClick={closeSidebar}
                          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition
                            ${pathname === "/admin/chat/consumer-provider" ? "text-indigo-600 bg-indigo-50" : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"}`}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
                          회원들에게 채팅하기
                        </Link>
                      </li>
                      <li>
                        <Link
                          href="/admin/chat/log"
                          onClick={closeSidebar}
                          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition
                            ${pathname === "/admin/chat/log" ? "text-indigo-600 bg-indigo-50" : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"}`}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
                          채팅로그
                        </Link>
                      </li>
                    </ul>
                  )}
                </>
              )}
            </li>

            {/* 공지사항 — 아코디언 */}
            <li>
              {showCollapsed ? (
                <Link
                  href="/admin/notices/provider"
                  onClick={closeSidebar}
                  className={`flex w-full items-center justify-center rounded-xl px-0 py-2.5 lg:justify-center
                    ${isOnNotices ? "bg-indigo-50 text-indigo-600" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}`}
                  title="공지사항"
                >
                  <span className={isOnNotices ? "text-indigo-500" : "text-gray-400"}>
                    {NAV_ITEMS.find((n) => n.href === "/admin/notices")?.icon ?? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                    )}
                  </span>
                </Link>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setNoticesOpen((v) => !v)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition
                      ${isOnNotices ? "bg-indigo-50 text-indigo-600" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}`}
                  >
                    <span className={isOnNotices ? "text-indigo-500" : "text-gray-400"}>
                      {NAV_ITEMS.find((n) => n.href === "/admin/notices")?.icon ?? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                          <line x1="12" y1="9" x2="12" y2="13" />
                          <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                      )}
                    </span>
                    <span className="flex-1 text-left">공지사항</span>
                    <svg
                      width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                      className={`shrink-0 transition-transform duration-200 ${noticesOpen ? "rotate-180" : ""}`}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>

                  {noticesOpen && (
                    <ul className="mt-0.5 space-y-0.5 pl-9">
                      <li>
                        <Link
                          href="/admin/notices/provider"
                          onClick={closeSidebar}
                          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition
                            ${pathname === "/admin/notices/provider" ? "text-indigo-600 bg-indigo-50" : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"}`}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
                          시공업체 공지사항
                        </Link>
                      </li>
                      <li>
                        <Link
                          href="/admin/notices/consumer"
                          onClick={closeSidebar}
                          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition
                            ${pathname === "/admin/notices/consumer" ? "text-indigo-600 bg-indigo-50" : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"}`}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
                          소비자 공지사항
                        </Link>
                      </li>
                    </ul>
                  )}
                </>
              )}
            </li>

            {/* 나머지 메뉴 */}
            {NAV_ITEMS.slice(3).filter((item) => item.href !== "/admin/notices").map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
              const badge =
                item.href === "/admin/estimates" ? pendingCounts.estimates
                : item.href === "/admin/customer-requests" ? pendingCounts.inquiries
                : item.href === "/admin/provider-requests" ? pendingCounts.providerRequests
                : item.href === "/admin/chat" ? pendingCounts.chatUnread
                : 0;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={closeSidebar}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition
                      ${showCollapsed ? "lg:justify-center lg:px-0" : ""}
                      ${isActive ? "bg-indigo-50 text-indigo-600" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}`}
                    title={showCollapsed ? item.label : undefined}
                  >
                    <span className="relative shrink-0">
                      <span className={isActive ? "text-indigo-500" : "text-gray-400"}>{item.icon}</span>
                      {badge > 0 && showCollapsed && (
                        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                          {badge > 99 ? "99+" : badge}
                        </span>
                      )}
                    </span>
                    {!showCollapsed && (
                      <>
                        <span className="flex-1">{item.label}</span>
                        {badge > 0 && (
                          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                            {badge > 99 ? "99+" : badge}
                          </span>
                        )}
                      </>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      {/* 본문 */}
      <main className={`min-h-screen pt-[calc(3.5rem+env(safe-area-inset-top,0px))] ${mainPl}`}>
        <div className="mx-auto max-w-7xl p-4 sm:p-6">{children}</div>
      </main>
    </div>
    </AdminLayoutContext.Provider>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <AdminLayoutInner>{children}</AdminLayoutInner>
    </Suspense>
  );
}
