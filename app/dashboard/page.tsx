"use client";

import Link from "next/link";
import { useEffect, useState, useRef, useCallback } from "react";
import { DASHBOARD_VIDEOS, pickRandomVideo } from "@/lib/backgroundVideos";
import { supabase } from "@/lib/supabaseClient";
import CollapsiblePanel from "@/components/CollapsiblePanel";
import { useDashboardLayout } from "./DashboardLayoutContext";
import ProjectCreateModal from "@/components/ProjectCreateModal";

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

export default function DashboardPage() {
  const { sidebarCollapsed } = useDashboardLayout();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState({ name: "", phone: "", email: "" });
  const [showModal, setShowModal] = useState(false);
  const initializedRef = useRef(false);

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
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  useEffect(() => {
    setVideoSrc(pickRandomVideo(DASHBOARD_VIDEOS));
  }, []);

  return (
    <div className="relative min-h-[calc(100vh-3.5rem)]">
      {/* 배경 영상 (대시보드 메인만) */}
      <div className={`fixed inset-0 top-14 left-0 z-0 ${sidebarCollapsed ? "lg:left-16" : "lg:left-60"}`}>
        {videoSrc && (
        <video
          key={videoSrc}
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        >
          <source
            src={videoSrc}
            type="video/mp4"
          />
        </video>
        )}
        <div className="absolute inset-0 bg-black/40" aria-hidden />
      </div>

      <div className="relative z-10 space-y-6">
      {/* 인사말 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white drop-shadow-md">
            {userName ? `${userName}님, 안녕하세요 👋` : "대시보드"}
          </h1>
          <p className="mt-0.5 text-sm text-white/90">현재 진행 중인 프로젝트를 확인하세요.</p>
        </div>
        <button type="button" onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 active:scale-95">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span className="hidden sm:inline">셀인프로젝트 생성</span>
          <span className="sm:hidden">생성</span>
        </button>
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-gray-100" />)}
          </div>
        ) : activeProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-400">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </div>
            <p className="mt-3 text-sm font-medium text-gray-600">진행 중인 프로젝트가 없습니다</p>
            <p className="mt-1 text-xs text-gray-400">새 프로젝트를 시작해보세요.</p>
            <button type="button" onClick={() => setShowModal(true)}
              className="mt-4 flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              셀인프로젝트 생성
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
      </div>
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const statusInfo = STATUS_LABEL[project.status] ?? { label: project.status, color: "bg-gray-100 text-gray-500" };
  return (
    <Link href="/dashboard/projects" className="flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md hover:border-indigo-200 block">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-gray-800 leading-snug line-clamp-2">{project.title || "제목 없음"}</p>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusInfo.color}`}>{statusInfo.label}</span>
      </div>
      <p className="mt-3 text-xs text-gray-400">{new Date(project.created_at).toLocaleDateString("ko-KR")} 생성</p>
    </Link>
  );
}
