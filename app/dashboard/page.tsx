"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";
import VideoOrGradientBackground from "@/components/VideoOrGradientBackground";
import { DASHBOARD_VIDEOS } from "@/lib/backgroundVideos";
import { supabase } from "@/lib/supabaseClient";
import CollapsiblePanel from "@/components/CollapsiblePanel";
import { useDashboardLayout } from "./DashboardLayoutContext";
import ProjectCreateModal from "@/components/ProjectCreateModal";
import ProjectCreateAIModal from "@/components/ProjectCreateAIModal";
import NoticeLayer from "@/components/NoticeLayer";

type Project = {
  id: string;
  title: string;
  status: string;
  created_at: string;
};

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  active:            { label: "진행중",        color: "bg-green-50 text-green-700" },
  pending:           { label: "대기중",        color: "bg-yellow-50 text-yellow-700" },
  publish_requested: { label: "최종발행요청",   color: "bg-orange-50 text-orange-700" },
  estimate_waiting:  { label: "견적대기",      color: "bg-blue-50 text-blue-700" },
  completed:         { label: "완료",          color: "bg-blue-50 text-blue-700" },
  cancelled:         { label: "취소",          color: "bg-gray-100 text-gray-500" },
};

const AI_BUBBLE_HIDE_KEY = "dashboard-ai-bubble-hidden";
const AI_BUBBLE_HIDE_MS = 24 * 60 * 60 * 1000;

export default function DashboardPage() {
  const router = useRouter();
  const { sidebarCollapsed, setAiModalOpen } = useDashboardLayout();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState({ name: "", phone: "", email: "" });
  const [showModal, setShowModal] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [bubbleHidden, setBubbleHidden] = useState(false);
  const initializedRef = useRef(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(AI_BUBBLE_HIDE_KEY);
      if (!stored) return;
      const hiddenUntil = Number(stored);
      if (Number.isFinite(hiddenUntil) && hiddenUntil > Date.now()) {
        setBubbleHidden(true);
      } else {
        localStorage.removeItem(AI_BUBBLE_HIDE_KEY);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    setAiModalOpen(showAIModal);
    return () => setAiModalOpen(false);
  }, [showAIModal, setAiModalOpen]);

  const fetchProjects = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from("projects")
      .select("id, title, status, created_at")
      .eq("user_id", uid)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false });
    setProjects(data ?? []);
  }, []);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const init = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      if (!session) return;
      const uid = session.user.id;
      setUserId(uid);
      const { data: profile } = await supabase.from("profiles").select("name, phone, email").eq("user_id", uid).maybeSingle();
      setUserName(profile?.name || session.user.email?.split("@")[0] || "회원");
      setUserProfile({
        name: profile?.name ?? "",
        phone: profile?.phone ?? "",
        email: profile?.email ?? session.user.email ?? "",
      });
      await fetchProjects(uid);
      setIsLoading(false);
    };
    init();
  }, [fetchProjects]);

  // 진행중(active): 상단에 표시. 견적대기까지는 하단(기타)에 표시
  const activeProjects = projects.filter((p) => p.status === "active");
  const otherProjects = projects.filter((p) => p.status !== "active");
  return (
    <div className="relative min-h-[calc(100dvh-var(--header-offset))] overflow-x-hidden">
      <VideoOrGradientBackground
        videos={DASHBOARD_VIDEOS}
        overlayClassName="bg-black/40"
        wrapperClassName={`fixed inset-0 left-0 z-0 bg-black top-[var(--header-offset)] bottom-[var(--safe-bottom)] ${sidebarCollapsed ? "lg:left-16" : "lg:left-60"}`}
      />

      <div className="relative z-10 min-w-0 space-y-6 px-1">
      {/* 인사말 + 버튼 - 모바일 세로 배치, PC 가로 배치 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
        <div className="min-w-0 shrink-0">
          <h1 className="text-lg font-semibold text-white drop-shadow-md sm:text-xl">
            {userName ? `${userName}님, 안녕하세요 👋` : "대시보드"}
          </h1>
          <p className="mt-0.5 text-sm text-white/90">현재 진행 중인 프로젝트를 확인하세요.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <NoticeLayer targetAudience="consumer" />
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <button type="button" onClick={() => setShowAIModal(true)}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 active:scale-95 ring-2 ring-indigo-300 ring-offset-2 ring-offset-transparent sm:min-h-0 sm:flex-initial">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span className="hidden sm:inline">쉬운 AI 모드</span>
                <span className="sm:hidden">AI</span>
              </button>
              {!bubbleHidden ? (
                <div className="animate-bubble absolute left-1/2 top-full z-10 mt-1.5 w-max -translate-x-1/2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 pr-6 text-left text-[10px] font-medium leading-normal text-amber-800 shadow-sm before:absolute before:-top-0.5 before:left-1/2 before:block before:h-1.5 before:w-1.5 before:-translate-x-1/2 before:rotate-45 before:border-l before:border-t before:border-amber-200 before:bg-amber-50 before:content-[''] max-sm:left-3 max-sm:max-w-[70vw] max-sm:translate-x-0 max-sm:before:left-4 max-sm:before:right-auto max-sm:before:translate-x-0">
                  너무 어려우세요?
                  <br />
                  그럼 제가 도울수 있어요.
                  <button
                    type="button"
                    onClick={() => {
                      setBubbleHidden(true);
                      try {
                        localStorage.setItem(AI_BUBBLE_HIDE_KEY, String(Date.now() + AI_BUBBLE_HIDE_MS));
                      } catch { /* ignore */ }
                    }}
                    className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-amber-600 hover:bg-amber-100"
                    aria-label="말풍선 닫기"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ) : null}
            </div>
            <button type="button" onClick={() => setShowModal(true)}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-sm font-medium text-indigo-600 shadow-sm transition hover:bg-indigo-50 active:scale-95 sm:min-h-0 sm:flex-initial">
              <span className="text-base leading-none">+</span>
              <span>프로젝트 생성</span>
            </button>
          </div>
        </div>
      </div>

      {/* 진행중 프로젝트 */}
      <CollapsiblePanel
        title="진행중인 프로젝트"
        storageKey="consumer-dash-active"
        headerRight={
          <Link href="/dashboard/projects" className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-600 transition hover:bg-indigo-100">
            <span>전체 보기</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
          </Link>
        }
      >
        {isLoading ? (
          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-gray-100" />)}
          </div>
        ) : activeProjects.length === 0 ? (
          <div className="flex max-w-md flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-400">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </div>
            <p className="mt-3 text-sm font-medium text-gray-600">진행 중인 프로젝트가 없습니다</p>
            <p className="mt-1 text-xs text-gray-400">새 프로젝트를 시작해보세요.</p>
            <button type="button" onClick={() => setShowAIModal(true)}
              className="mt-4 flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              쉬운 AI 모드로 시작
            </button>
          </div>
        ) : (
          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {activeProjects.map((p) => <ProjectCard key={p.id} project={p} />)}
          </div>
        )}
      </CollapsiblePanel>

      {/* 대기중·견적대기 등 (하단) */}
      {!isLoading && otherProjects.length > 0 && (
        <CollapsiblePanel
          title="대기중·견적대기 프로젝트"
          storageKey="consumer-dash-other"
          headerRight={
            <Link href="/dashboard/projects" className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-600 transition hover:bg-indigo-100">
              <span>전체 보기</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
            </Link>
          }
        >
          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {otherProjects.map((p) => <ProjectCard key={p.id} project={p} />)}
          </div>
        </CollapsiblePanel>
      )}

      {showModal && userId && (
        <ProjectCreateModal
          userId={userId}
          userProfile={userProfile}
          onClose={() => setShowModal(false)}
          onCreated={() => fetchProjects(userId)}
        />
      )}
      {showAIModal && userId && (
        <ProjectCreateAIModal
          userId={userId}
          userProfile={userProfile}
          onClose={() => setShowAIModal(false)}
          onCreated={(projectId) => {
            void fetchProjects(userId);
            setShowAIModal(false);
            if (projectId) {
              router.push(`/dashboard/projects?highlight=${projectId}`);
            }
          }}
        />
      )}
      </div>
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const statusInfo = STATUS_LABEL[project.status] ?? { label: project.status, color: "bg-gray-100 text-gray-500" };
  return (
    <Link href="/dashboard/projects" className="flex flex-col justify-between rounded-2xl bg-white p-4 shadow-sm transition hover:shadow-md block">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-gray-800 leading-snug line-clamp-2">{project.title || "제목 없음"}</p>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusInfo.color}`}>{statusInfo.label}</span>
      </div>
      <p className="mt-3 text-xs text-gray-400">{new Date(project.created_at).toLocaleDateString("ko-KR")} 생성</p>
    </Link>
  );
}
