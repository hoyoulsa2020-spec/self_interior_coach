"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import ProjectCreateModal, { type ProjectForEdit } from "@/components/ProjectCreateModal";
import ProcessScheduleModal from "@/components/ProcessScheduleModal";
import AlertModal from "@/components/AlertModal";
import { formatArea } from "@/lib/area";

function Lightbox({ urls, index, onClose }: { urls: string[]; index: number; onClose: () => void }) {
  const [cur, setCur] = useState(index);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setCur((c) => Math.min(c + 1, urls.length - 1));
      if (e.key === "ArrowLeft") setCur((c) => Math.max(c - 1, 0));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [urls.length, onClose]);
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85" onClick={onClose}>
      <button onClick={onClose} className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      {urls.length > 1 && (
        <>
          <button onClick={(e) => { e.stopPropagation(); setCur((c) => Math.max(c - 1, 0)); }}
            className="absolute left-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 disabled:opacity-30" disabled={cur === 0}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <button onClick={(e) => { e.stopPropagation(); setCur((c) => Math.min(c + 1, urls.length - 1)); }}
            className="absolute right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 disabled:opacity-30" disabled={cur === urls.length - 1}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={urls[cur]} alt={`이미지 ${cur + 1}`} onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] max-w-[90vw] rounded-xl object-contain shadow-2xl" />
      {urls.length > 1 && (
        <p className="absolute bottom-4 text-xs text-white/60">{cur + 1} / {urls.length}</p>
      )}
    </div>
  );
}

type WorkTreeItem = { cat: string; subs: string[] };
type WorkDetail = { requirements: string; image_urls: string[]; subs?: string[] };

type Project = {
  id: string;
  title: string;
  status: string;
  publish_requested_at: string | null;
  scheduled_delete_at: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  site_address1: string | null;
  site_address2: string | null;
  category: string[] | null;
  work_tree: WorkTreeItem[] | null;
  work_details: Record<string, WorkDetail> | null;
  start_date: string | null;
  move_in_date: string | null;
  supply_area_m2: number | null;
  exclusive_area_m2: number | null;
  is_expanded: boolean | null;
  process_schedule: Record<string, unknown> | null;
  created_at: string;
};

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

const ONE_HOUR_MS = 60 * 60 * 1000;

function formatRemainingPublishCancel(publishRequestedAt: string | null): string | null {
  if (!publishRequestedAt) return null;
  const deadline = new Date(publishRequestedAt).getTime() + ONE_HOUR_MS;
  const remaining = deadline - Date.now();
  if (remaining <= 0) return null;
  const m = Math.floor(remaining / 60_000);
  const s = Math.floor((remaining % 60_000) / 1000);
  if (m > 0) return `${m}분 ${s}초 남음`;
  return `${s}초 남음`;
}

function formatRemainingRestore(scheduledDeleteAt: string | null): string | null {
  if (!scheduledDeleteAt) return null;
  const deleteAt = new Date(scheduledDeleteAt).getTime();
  const remaining = deleteAt - Date.now();
  if (remaining <= 0) return null;
  const d = Math.floor(remaining / (24 * 60 * 60 * 1000));
  const h = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const m = Math.floor((remaining % (60 * 60 * 1000)) / 60_000);
  if (d > 0) return `${d}일 ${h}시간 ${m}분 남음`;
  if (h > 0) return `${h}시간 ${m}분 남음`;
  return `${m}분 남음`;
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  active:            { label: "진행중",        color: "bg-green-50 text-green-700" },
  pending:           { label: "대기중",        color: "bg-yellow-50 text-yellow-700" },
  publish_requested: { label: "최종발행요청",   color: "bg-orange-50 text-orange-700" },
  estimate_waiting:   { label: "견적대기",      color: "bg-blue-50 text-blue-700" },
  completed:         { label: "완료",          color: "bg-blue-50 text-blue-700" },
  cancelled:         { label: "취소",          color: "bg-gray-100 text-gray-500" },
};

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
function formatScheduleRange(processSchedule: Record<string, unknown> | null, catName: string): string {
  const raw = processSchedule?.[catName];
  if (!raw) return "";
  const ranges = Array.isArray(raw) ? raw : [raw];
  if (ranges.length === 0) return "";
  const r = ranges[ranges.length - 1] as { start: string; end: string };
  // 문자열의 월·일을 그대로 사용하고, 요일만 Date로 계산 (타임존 오차 방지)
  const fmt = (s: string) => {
    const part = (typeof s === "string" ? s : "").split("T")[0];
    const [y, m, d] = part.split("-").map(Number);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return "?";
    const date = new Date(y, m - 1, d);
    return `${m}/${d} (${DAY_LABELS[date.getDay()]})`;
  };
  return `${fmt(r.start)} ~ ${fmt(r.end)}`;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState({ name: "", phone: "", email: "" });
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  const [expandedCount, setExpandedCount] = useState<Record<string, number>>({});
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; projectId: string; type: "publish" | "cancel" } | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ projectId: string } | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [processModalProjectId, setProcessModalProjectId] = useState<string | null>(null);
  const [processModalViewOnly, setProcessModalViewOnly] = useState(false);
  const [alertModal, setAlertModal] = useState<{ title?: string; message: string; variant?: "info" | "warning" | "error" | "success" } | null>(null);
  const [tick, setTick] = useState(0);
  const initializedRef = useRef(false);
  const SHOW_STEP = 5;
  const INITIAL_SHOW = 0; // 처음엔 접혀있고, 더보기 클릭 시 5개씩

  // 진행중 프로젝트: 견적·업체 프로필 (입찰 단가 확인용)
  type EstimateRow = { provider_id: string; provider_business_name: string; amounts: Record<string, number> };
  const [estimatesByProject, setEstimatesByProject] = useState<Record<string, EstimateRow[]>>({});
  const [providerProfiles, setProviderProfiles] = useState<Record<string, { business_name: string; owner_name: string; address1: string; address2: string; introduction: string; warranty_period: string | null; badges: string[] | null }>>({});
  const [providerDetailModal, setProviderDetailModal] = useState<{ providerId: string; projectId: string; businessName: string; ownerName: string; address: string; introduction: string; warrantyPeriod: string | null; badges: string[]; amount?: number; category: string; isCategoryCompleted: boolean } | null>(null);
  const [categoryAssignments, setCategoryAssignments] = useState<Record<string, Record<string, { provider_id: string; match_status: string; match_started_at: string | null }>>>({}); // projectId -> { category -> assignment }

  // 실시간 카운트 (1초마다 갱신)
  useEffect(() => {
    const hasCountdown = projects.some(
      (p) =>
        (p.status === "publish_requested" && p.publish_requested_at) ||
        (p.scheduled_delete_at && Date.now() < new Date(p.scheduled_delete_at).getTime())
    );
    if (!hasCountdown) return;
    const iv = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(iv);
  }, [projects]);

  const SELECT_COLS = "id, title, status, publish_requested_at, scheduled_delete_at, contact_name, contact_phone, contact_email, site_address1, site_address2, category, work_tree, work_details, start_date, move_in_date, supply_area_m2, exclusive_area_m2, is_expanded, process_schedule, created_at";

  const fetchProjects = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from("projects")
      .select(SELECT_COLS)
      .eq("user_id", uid)
      .order("created_at", { ascending: false });
    if (error) console.error("프로젝트 조회 오류:", error.message, error.hint);
    const list = data ?? [];
    const now = Date.now();
    let needsRefresh = false;
    for (const p of list) {
      if (p.status === "publish_requested" && p.publish_requested_at) {
        const requestedAt = new Date(p.publish_requested_at).getTime();
        if (now - requestedAt >= ONE_HOUR_MS) {
          await supabase.from("projects").update({ status: "estimate_waiting" }).eq("id", p.id).eq("user_id", uid);
          needsRefresh = true;
        }
      }
      if (p.scheduled_delete_at) {
        const deleteAt = new Date(p.scheduled_delete_at).getTime();
        if (now >= deleteAt) {
          await supabase.from("projects").delete().eq("id", p.id).eq("user_id", uid);
          needsRefresh = true;
        }
      }
    }
    if (needsRefresh) {
      const { data: refreshed } = await supabase.from("projects").select(SELECT_COLS).eq("user_id", uid).order("created_at", { ascending: false });
      setProjects(refreshed ?? list);
    } else {
      setProjects(list);
    }
  }, []);

  const hasProcessSchedule = (p: Project) =>
    p.process_schedule != null && typeof p.process_schedule === "object" && Object.keys(p.process_schedule).length > 0;

  const openPublishConfirm = (p: Project) => {
    if (profileStatus !== "active") {
      setAlertModal({
        title: "계정 비활성화",
        message: "계정이 비활성화 상태입니다.\n셀인코치에게 문의 하세요.",
        variant: "warning",
      });
      return;
    }
    if (p.status === "pending" && !hasProcessSchedule(p)) {
      setAlertModal({ message: "공정표 작성을 하셔야 최종발행요청이 됩니다.", variant: "warning" });
      return;
    }
    setConfirmModal({
      title: "최종발행요청",
      message: "최종발행하기를 누르면 더 이상 수정이 되지 않습니다.\n\n신중하게 발행해 주세요. 발행 후 1시간 이내에만 취소할 수 있습니다.\n\n최종발행요청을 진행하시겠습니까?",
      projectId: p.id,
      type: "publish",
    });
  };

  const openCancelConfirm = (projectId: string) => {
    setConfirmModal({
      title: "발행취소",
      message: "최종발행요청을 취소하고 대기중으로 되돌리시겠습니까?",
      projectId,
      type: "cancel",
    });
  };

  const openDeleteConfirm = (projectId: string) => {
    setDeleteModal({ projectId });
  };

  const executeDelete = async (password: string) => {
    if (!deleteModal || !userId) return;
    if (!userEmail) {
      setAlertModal({ message: "이메일 로그인 계정만 삭제할 수 있습니다.", variant: "warning" });
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email: userEmail, password });
    if (error) {
      setAlertModal({ message: "비밀번호가 일치하지 않습니다.", variant: "error" });
      return;
    }
    const deleteAt = new Date(Date.now() + THREE_DAYS_MS).toISOString();
    await supabase.from("projects").update({ scheduled_delete_at: deleteAt }).eq("id", deleteModal.projectId).eq("user_id", userId);
    setDeleteModal(null);
    fetchProjects(userId);
  };

  const executeRestore = async (projectId: string) => {
    if (!userId) return;
    await supabase.from("projects").update({ scheduled_delete_at: null }).eq("id", projectId).eq("user_id", userId);
    fetchProjects(userId);
  };

  const executeConfirm = async () => {
    if (!confirmModal || !userId) return;
    const { projectId, type } = confirmModal;
    setConfirmModal(null);
    setPublishingId(projectId);
    if (type === "publish") {
      await supabase.from("projects").update({
        status: "publish_requested",
        publish_requested_at: new Date().toISOString(),
      }).eq("id", projectId).eq("user_id", userId);
      try {
        const { data } = await supabase.auth.getSession();
        if (data?.session?.access_token) {
          await fetch("/api/push/project-publish", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
          });
        }
      } catch {
        /* ignore push failure */
      }
    } else {
      await supabase.from("projects").update({
        status: "pending",
        publish_requested_at: null,
      }).eq("id", projectId).eq("user_id", userId);
    }
    setPublishingId(null);
    fetchProjects(userId);
  };

  const canCancelPublish = (p: Project) => {
    if (p.status !== "publish_requested" || !p.publish_requested_at) return false;
    const requestedAt = new Date(p.publish_requested_at).getTime();
    return Date.now() - requestedAt < ONE_HOUR_MS;
  };

  // 1시간 경과 시 발행취소 버튼 제거 (tick으로 실시간 갱신)
  useEffect(() => {
    const hasPublishRequested = projects.some((p) => p.status === "publish_requested");
    if (!userId || !hasPublishRequested) return;
    const iv = setInterval(() => fetchProjects(userId), 60_000);
    return () => clearInterval(iv);
  }, [userId, projects, fetchProjects]);

  // 진행중 프로젝트: 견적·업체 프로필 로드
  useEffect(() => {
    const activeIds = projects.filter((p) => p.status === "active").map((p) => p.id);
    if (activeIds.length === 0) return;
    const load = async () => {
      const { data: estData } = await supabase
        .from("project_estimates")
        .select("project_id, provider_id, amounts, provider_business_name")
        .in("project_id", activeIds);
      const estMap: Record<string, EstimateRow[]> = {};
      (estData ?? []).forEach((r) => {
        if (!estMap[r.project_id]) estMap[r.project_id] = [];
        estMap[r.project_id].push({
          provider_id: r.provider_id,
          provider_business_name: r.provider_business_name || "업체",
          amounts: (r.amounts as Record<string, number>) ?? {},
        });
      });
      setEstimatesByProject((prev) => ({ ...prev, ...estMap }));

      const providerIds = [...new Set((estData ?? []).map((r) => r.provider_id))];
      if (providerIds.length > 0) {
        const { data: profData } = await supabase
          .from("profiles")
          .select("user_id, business_name, owner_name, address1, address2, introduction, warranty_period, badges")
          .in("user_id", providerIds);
        const toArray = (v: unknown): string[] => {
          if (!v) return [];
          if (Array.isArray(v)) return v.map(String);
          if (typeof v === "string") {
            try {
              const p = JSON.parse(v);
              if (Array.isArray(p)) return p.map(String);
            } catch { return v.split(",").map((s) => s.trim()).filter(Boolean); }
          }
          return [];
        };
        const profMap: Record<string, { business_name: string; owner_name: string; address1: string; address2: string; introduction: string; warranty_period: string | null; badges: string[] | null }> = {};
        (profData ?? []).forEach((r) => {
          profMap[r.user_id] = {
            business_name: r.business_name ?? "",
            owner_name: r.owner_name ?? "",
            address1: r.address1 ?? "",
            address2: r.address2 ?? "",
            introduction: r.introduction ?? "",
            warranty_period: r.warranty_period ?? null,
            badges: r.badges ? toArray(r.badges) : null,
          };
        });
        setProviderProfiles((prev) => ({ ...prev, ...profMap }));
      }

      const { data: assignData } = await supabase
        .from("project_category_assignments")
        .select("id, project_id, category, provider_id, match_status, match_started_at")
        .in("project_id", activeIds);
      const assignMap: Record<string, Record<string, { provider_id: string; match_status: string; match_started_at: string | null }>> = {};
      const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;
      const now = Date.now();
      const toAutoComplete: string[] = [];
      (assignData ?? []).forEach((row) => {
        if (!assignMap[row.project_id]) assignMap[row.project_id] = {};
        let status = row.match_status ?? "in_progress";
        if (status === "in_progress" && row.match_started_at) {
          const deadline = new Date(row.match_started_at).getTime() + SEVENTY_TWO_HOURS_MS;
          if (now >= deadline) toAutoComplete.push(row.id);
        }
        assignMap[row.project_id][row.category] = {
          provider_id: row.provider_id,
          match_status: status,
          match_started_at: row.match_started_at,
        };
      });
      for (const id of toAutoComplete) {
        await supabase.from("project_category_assignments").update({ match_status: "completed" }).eq("id", id);
      }
      if (toAutoComplete.length > 0) {
        const { data: refreshed } = await supabase
          .from("project_category_assignments")
          .select("project_id, category, provider_id, match_status, match_started_at")
          .in("project_id", activeIds);
        refreshed?.forEach((row) => {
          if (!assignMap[row.project_id]) assignMap[row.project_id] = {};
          assignMap[row.project_id][row.category] = {
            provider_id: row.provider_id,
            match_status: row.match_status ?? "in_progress",
            match_started_at: row.match_started_at,
          };
        });
      }
      setCategoryAssignments((prev) => ({ ...prev, ...assignMap }));
    };
    load();
  }, [projects]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const init = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const session = sessionData?.session;
        if (!session) { setIsLoading(false); return; }
        const uid = session.user.id;
        setUserId(uid);
        setUserEmail(session.user.email ?? "");
        const { data: profile } = await supabase.from("profiles").select("name, phone, email, status").eq("user_id", uid).maybeSingle();
        setUserProfile({
          name: profile?.name ?? "",
          phone: profile?.phone ?? "",
          email: profile?.email ?? session.user.email ?? "",
        });
        setProfileStatus(profile?.status ?? null);
        await fetchProjects(uid);
      } catch (e) {
        console.error("초기화 오류:", e);
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, [fetchProjects]);

  // 해시(#project-xxx)로 진입 시 해당 프로젝트로 스크롤
  useEffect(() => {
    if (typeof window === "undefined" || projects.length === 0) return;
    const hash = window.location.hash?.slice(1);
    if (!hash || !hash.startsWith("project-")) return;
    const el = document.getElementById(hash);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [projects]);

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">내 프로젝트</h1>
          <p className="mt-0.5 text-sm text-gray-500">진행 중인 셀인 프로젝트를 관리하세요.</p>
        </div>
        <button type="button" onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 active:scale-95">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span className="hidden sm:inline">셀인프로젝트 생성</span>
          <span className="sm:hidden">생성</span>
        </button>
      </div>

      {/* 목록 */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-gray-100" />)}
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white py-20 text-center shadow-sm">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-400">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </div>
          <p className="mt-4 text-sm font-medium text-gray-700">아직 등록한 프로젝트가 없습니다</p>
          <p className="mt-1 text-xs text-gray-400">셀인프로젝트 생성 버튼을 눌러 첫 프로젝트를 시작해보세요.</p>
          <button type="button" onClick={() => setShowModal(true)}
            className="mt-6 flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 active:scale-95">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            셀인프로젝트 생성
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {projects.map((p) => {
            const statusInfo = STATUS_LABEL[p.status] ?? { label: p.status, color: "bg-gray-100 text-gray-500" };
            const isScheduledDelete = !!p.scheduled_delete_at && Date.now() < new Date(p.scheduled_delete_at).getTime();
            const fmtDate = (d: string) => new Date(d).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });

            // work_tree 우선, 없으면 work_details 의 subs 로 재구성, 그것도 없으면 flat fallback
            let groups: WorkTreeItem[] = p.work_tree ?? [];
            if (groups.length === 0 && p.work_details) {
              // work_details 에 subs 가 있으면 정확한 계층 복원 가능
              const cats = Object.keys(p.work_details);
              if (cats.length > 0) {
                groups = cats.map((cat) => ({
                  cat,
                  subs: (p.work_details![cat] as WorkDetail).subs ?? [],
                }));
              }
            }
            const isLegacy = groups.length === 0;
            const legacySubs = isLegacy ? (p.category ?? []) : [];

            return (
              <div key={p.id} id={`project-${p.id}`} className="flex flex-col rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md overflow-hidden scroll-mt-24">

                {/* 헤더 */}
                <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100">
                  <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusInfo.color}`}>{statusInfo.label}</span>
                    {isScheduledDelete && (
                      <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">삭제 예정</span>
                    )}
                    <p className="text-sm font-bold text-gray-900 line-clamp-2 leading-snug">{p.title || "제목 없음"}</p>
                    {(p.status === "pending" || p.status === "publish_requested") && !p.scheduled_delete_at && !hasProcessSchedule(p) && (
                      <button
                        type="button"
                        onClick={() => { setProcessModalProjectId(p.id); setProcessModalViewOnly(false); setShowProcessModal(true); }}
                        className="shrink-0 flex items-center gap-1 rounded-lg border border-indigo-200 px-2.5 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        공정표작성
                      </button>
                    )}
                    {hasProcessSchedule(p) && !p.scheduled_delete_at && (
                      <button
                        type="button"
                        onClick={() => {
                          const canEdit = p.status === "pending";
                          setProcessModalProjectId(p.id);
                          setProcessModalViewOnly(!canEdit);
                          setShowProcessModal(true);
                        }}
                        className="shrink-0 flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                      >
                        {p.status === "pending" ? "공정표 수정" : "공정표 보기"}
                      </button>
                    )}
                  </div>
                  <span className="shrink-0 ml-2 text-[11px] text-gray-400">{fmtDate(p.created_at)}</span>
                </div>

                {/* 기본 정보 */}
                <div className="px-5 py-3 flex flex-wrap gap-x-5 gap-y-1.5 border-b border-gray-100">
                  {p.site_address1 && (
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                      </svg>
                      <span>{p.site_address1}</span>
                    </div>
                  )}
                  {(p.start_date || p.move_in_date) && (
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                      <span>{p.start_date ? fmtDate(p.start_date) : "—"} → {p.move_in_date ? fmtDate(p.move_in_date) : "—"}</span>
                    </div>
                  )}
                  {(p.supply_area_m2 || p.exclusive_area_m2) && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="1" /><path d="M3 9h18M9 21V9" />
                      </svg>
                      <span>
                        {p.supply_area_m2 ? `공급 ${formatArea(p.supply_area_m2)}` : ""}
                        {p.supply_area_m2 && p.exclusive_area_m2 ? " / " : ""}
                        {p.exclusive_area_m2 ? `전용 ${formatArea(p.exclusive_area_m2)}` : ""}
                      </span>
                      {p.is_expanded != null && (
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${p.is_expanded ? "bg-indigo-50 text-indigo-600" : "bg-gray-100 text-gray-500"}`}>
                          {p.is_expanded ? "확장" : "비확장"}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* 공사 항목 — 신규 (work_tree 있음) */}
                {groups.length > 0 && (
                  <div className="divide-y divide-gray-100">
                    {groups.slice(0, expandedCount[p.id] ?? INITIAL_SHOW).map((g, gi) => {
                      const detail: WorkDetail | undefined = p.work_details?.[g.cat];
                      const scheduleStr = formatScheduleRange(p.process_schedule, g.cat);
                      return (
                        <div key={g.cat} className="px-5 py-4">
                          <p className="text-sm font-bold text-gray-900">
                            <span className="mr-1.5 text-indigo-500">{gi + 1}.</span>{g.cat}
                            {scheduleStr && <span className="ml-1.5 font-normal text-gray-500">· {scheduleStr}</span>}
                          </p>
                          {g.subs.length > 0 && (
                            <ol className="mt-2 space-y-0.5 pl-4">
                              {g.subs.map((s, si) => (
                                <li key={s} className="text-xs text-gray-600">
                                  <span className="mr-1 text-gray-400">{si + 1}.</span>{s}
                                </li>
                              ))}
                            </ol>
                          )}
                          {detail?.requirements && (
                            <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">고객 요구사항</p>
                              <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-line">{detail.requirements}</p>
                            </div>
                          )}
                          {detail?.image_urls && detail.image_urls.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {detail.image_urls.map((url, i) => (
                                <button key={i} type="button" className="shrink-0"
                                  onClick={() => setLightbox({ urls: detail.image_urls, index: i })}>
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={url} alt={`참고사진 ${i + 1}`}
                                    className="h-12 w-12 rounded-lg object-cover border border-gray-200 hover:opacity-80 transition" />
                                </button>
                              ))}
                            </div>
                          )}
                          {/* 진행중: 대공정별 입찰 업체 (1~5위, 견적단가 저렴한 순) */}
                          {p.status === "active" && (() => {
                            const estimates = estimatesByProject[p.id] ?? [];
                            const bidsForCat = estimates
                              .map((e) => ({ ...e, amount: e.amounts[g.cat] }))
                              .filter((x) => x.amount != null && x.amount >= 0)
                              .sort((a, b) => (a.amount ?? 0) - (b.amount ?? 0))
                              .slice(0, 5);
                            if (bidsForCat.length === 0) return null;
                            const assign = categoryAssignments[p.id]?.[g.cat];
                            return (
                              <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50/80 overflow-hidden">
                                <p className="px-3 py-2 text-[11px] font-semibold text-orange-700 bg-orange-100">업체 입찰 (저렴한 순)</p>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="border-b border-orange-200 bg-orange-100/80">
                                        <th className="px-3 py-2 text-left font-semibold text-orange-800">순위</th>
                                        <th className="px-3 py-2 text-left font-semibold text-orange-800">업체명</th>
                                        <th className="px-3 py-2 text-left font-semibold text-orange-800">업체소재지</th>
                                        <th className="px-3 py-2 text-right font-semibold text-orange-800">견적단가</th>
                                        <th className="px-3 py-2 text-center font-semibold text-orange-800">자세히</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {bidsForCat.map((b, bi) => {
                                        const addr = providerProfiles[b.provider_id];
                                        const addrStr = [addr?.address1, addr?.address2].filter(Boolean).join(" ") || "—";
                                        const badgeDots = [
                                          { id: "sellin_certified", dot: "bg-blue-500", label: "셀인코치인증" },
                                          { id: "consumer_verified", dot: "bg-yellow-400", label: "소비자인증" },
                                          { id: "warranty_best", dot: "bg-red-500", label: "하자보수우수" },
                                          { id: "good_comm", dot: "bg-green-500", label: "소통원활" },
                                        ];
                                        const providerBadges = providerProfiles[b.provider_id]?.badges ?? [];
                                        const isFirst = bi === 0;
                                        const isDealSelected = assign?.provider_id === b.provider_id && (assign?.match_status === "in_progress" || assign?.match_status === "completed");
                                        const isDealCompleted = assign?.provider_id === b.provider_id && assign?.match_status === "completed";
                                        return (
                                          <tr
                                            key={b.provider_id}
                                            className={`border-b border-orange-100 transition-colors ${isFirst ? "bg-amber-50/90 border-l-4 border-l-amber-400" : ""}`}
                                          >
                                            <td className="px-3 py-2 font-medium text-orange-900">
                                              {isFirst ? (
                                                <span className="inline-flex animate-pulse items-center gap-1 rounded-full bg-amber-200/80 px-2 py-0.5 text-amber-800 font-bold ring-2 ring-amber-300/60">
                                                  <span className="text-amber-500">★</span> 1위
                                                </span>
                                              ) : (
                                                `${bi + 1}위`
                                              )}
                                            </td>
                                            <td className="px-3 py-2">
                                              <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className="font-medium text-orange-900">{b.provider_business_name}</span>
                                                {providerBadges.length > 0 && (
                                                  <span className="flex items-center gap-1">
                                                    {providerBadges.map((bid) => {
                                                      const bd = badgeDots.find((x) => x.id === bid);
                                                      return bd ? <span key={bid} title={bd.label} className={`h-2.5 w-2.5 shrink-0 rounded-full ${bd.dot}`} /> : null;
                                                    })}
                                                  </span>
                                                )}
                                                {isDealCompleted && (
                                                  <span className="shrink-0 rounded-full border border-red-300 bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                                    계약완료
                                                  </span>
                                                )}
                                                {isDealSelected && !isDealCompleted && (
                                                  <span className="shrink-0 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">
                                                    고민중
                                                  </span>
                                                )}
                                              </div>
                                            </td>
                                            <td className="px-3 py-2 text-orange-700 max-w-[120px] truncate">{addrStr}</td>
                                            <td className="px-3 py-2 text-right font-semibold text-orange-600">{(b.amount ?? 0).toLocaleString("ko-KR")}원</td>
                                            <td className="px-3 py-2 text-center">
                                              <button
                                                type="button"
                                                onClick={() => setProviderDetailModal({
                                                  providerId: b.provider_id,
                                                  projectId: p.id,
                                                  businessName: b.provider_business_name,
                                                  ownerName: providerProfiles[b.provider_id]?.owner_name ?? "",
                                                  address: addrStr,
                                                  introduction: providerProfiles[b.provider_id]?.introduction ?? "",
                                                  warrantyPeriod: providerProfiles[b.provider_id]?.warranty_period ?? null,
                                                  badges: providerProfiles[b.provider_id]?.badges ?? [],
                                                  amount: b.amount ?? undefined,
                                                  category: g.cat,
                                                  isCategoryCompleted: assign?.match_status === "completed",
                                                })}
                                                className="rounded-lg border border-orange-300 px-2 py-1 text-[11px] font-medium text-orange-700 hover:bg-orange-100"
                                              >
                                                자세히
                                              </button>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })}
                    <div className="px-5 py-3 flex gap-2">
                      {(expandedCount[p.id] ?? INITIAL_SHOW) > 0 && (
                        <button type="button" onClick={() => setExpandedCount((prev) => ({ ...prev, [p.id]: INITIAL_SHOW }))}
                          className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50">
                          접기
                        </button>
                      )}
                      {(expandedCount[p.id] ?? INITIAL_SHOW) < groups.length && (
                        <button type="button" onClick={() => setExpandedCount((prev) => ({ ...prev, [p.id]: (prev[p.id] ?? INITIAL_SHOW) + SHOW_STEP }))}
                          className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50">
                          {(expandedCount[p.id] ?? INITIAL_SHOW) === 0 ? "펼쳐보기" : `더보기 (+${SHOW_STEP}개)`}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* 완전 구버전 fallback — work_details 도 없는 경우 */}
                {isLegacy && legacySubs.length > 0 && (
                  <div className="border-t border-gray-100 px-5 py-3">
                    <div className="flex flex-wrap gap-1">
                      {legacySubs.slice(0, expandedCount[p.id] ?? INITIAL_SHOW).map((s) => (
                        <span key={s} className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs text-gray-600">{s}</span>
                      ))}
                    </div>
                    <div className="mt-2 flex gap-2">
                      {(expandedCount[p.id] ?? INITIAL_SHOW) > 0 && (
                        <button type="button" onClick={() => setExpandedCount((prev) => ({ ...prev, [p.id]: INITIAL_SHOW }))}
                          className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50">
                          접기
                        </button>
                      )}
                      {(expandedCount[p.id] ?? INITIAL_SHOW) < legacySubs.length && (
                        <button type="button" onClick={() => setExpandedCount((prev) => ({ ...prev, [p.id]: (prev[p.id] ?? INITIAL_SHOW) + SHOW_STEP }))}
                          className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50">
                          {(expandedCount[p.id] ?? INITIAL_SHOW) === 0 ? "펼쳐보기" : `더보기 (+${SHOW_STEP}개)`}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* 대기중: 수정/최종발행요청/삭제 */}
                {p.status === "pending" && !p.scheduled_delete_at && (
                  <div className="flex flex-wrap gap-2 border-t border-gray-100 px-5 py-3">
                    <button type="button" onClick={() => setEditProject(p)}
                      className="flex-1 min-w-[80px] rounded-xl border border-gray-200 py-2.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
                      수정하기
                    </button>
                    <button
                      type="button"
                      onClick={() => openPublishConfirm(p)}
                      disabled={publishingId === p.id}
                      className={`flex-1 min-w-[80px] rounded-xl py-2.5 text-xs font-medium text-white disabled:opacity-50 ${hasProcessSchedule(p) ? "bg-indigo-600 hover:bg-indigo-700" : "bg-gray-300 cursor-not-allowed"}`}
                    >
                      {publishingId === p.id ? "요청 중..." : "최종발행요청"}
                    </button>
                    <button type="button" onClick={() => openDeleteConfirm(p.id)}
                      className="rounded-xl border border-red-200 py-2.5 px-4 text-xs font-medium text-red-600 hover:bg-red-50">
                      삭제
                    </button>
                  </div>
                )}

                {/* 삭제 예정 (3일 내 복구 가능) */}
                {p.scheduled_delete_at && (() => {
                  const deleteAt = new Date(p.scheduled_delete_at).getTime();
                  const canRestore = Date.now() < deleteAt;
                  if (!canRestore) return null;
                  const remainingStr = formatRemainingRestore(p.scheduled_delete_at);
                  return (
                    <div className="border-t border-gray-100 px-5 py-3">
                      <p className="mb-2 text-xs text-amber-600">
                        {new Date(p.scheduled_delete_at).toLocaleDateString("ko-KR")}에 삭제됩니다. 3일 안에 복구할 수 있습니다.
                      </p>
                      {remainingStr && (
                        <p className="mb-2 text-xs font-semibold text-amber-700">복구 가능: {remainingStr}</p>
                      )}
                      <button type="button" onClick={() => executeRestore(p.id)}
                        className="w-full rounded-xl border border-amber-200 py-2.5 text-xs font-medium text-amber-700 hover:bg-amber-50">
                        복구하기
                      </button>
                    </div>
                  );
                })()}

                {/* 최종발행요청: 1시간 이내만 발행취소 */}
                {p.status === "publish_requested" && canCancelPublish(p) && (() => {
                  const remainingStr = formatRemainingPublishCancel(p.publish_requested_at);
                  return (
                    <div className="border-t border-gray-100 px-5 py-3">
                      <div className="mb-1.5 flex items-center gap-2 text-[11px] text-orange-600">
                        <span>1시간 이내에만 취소할 수 있습니다.</span>
                        {remainingStr && (
                          <span className="font-semibold text-orange-700">({remainingStr})</span>
                        )}
                      </div>
                      <button type="button" onClick={() => openCancelConfirm(p.id)} disabled={publishingId === p.id}
                        className="w-full rounded-xl border border-orange-200 py-2.5 text-xs font-medium text-orange-600 hover:bg-orange-50 disabled:opacity-50">
                        {publishingId === p.id ? "취소 중..." : "발행취소하기"}
                      </button>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}

      {showModal && userId && (
        <ProjectCreateModal
          userId={userId}
          userProfile={userProfile}
          onClose={() => setShowModal(false)}
          onCreated={() => fetchProjects(userId)}
        />
      )}
      {editProject && userId && (
        <ProjectCreateModal
          userId={userId}
          userProfile={userProfile}
          onClose={() => setEditProject(null)}
          onCreated={() => { fetchProjects(userId); setEditProject(null); }}
          initialData={{
            id: editProject.id,
            title: editProject.title,
            contact_name: editProject.contact_name,
            contact_phone: editProject.contact_phone,
            contact_email: editProject.contact_email,
            site_address1: editProject.site_address1,
            site_address2: editProject.site_address2,
            start_date: editProject.start_date,
            move_in_date: editProject.move_in_date,
            supply_area_m2: editProject.supply_area_m2,
            exclusive_area_m2: editProject.exclusive_area_m2,
            is_expanded: editProject.is_expanded,
            category: editProject.category,
            work_tree: editProject.work_tree,
            work_details: editProject.work_details,
            process_schedule: editProject.process_schedule,
          } as ProjectForEdit}
        />
      )}
      {lightbox && <Lightbox urls={lightbox.urls} index={lightbox.index} onClose={() => setLightbox(null)} />}

      {/* 확인 레이어팝업 */}
      {confirmModal && (
        <ConfirmLayer
          title={confirmModal.title}
          message={confirmModal.message}
          confirmLabel="확인"
          confirmType={confirmModal.type}
          onConfirm={executeConfirm}
          onCancel={() => setConfirmModal(null)}
        />
      )}
      {deleteModal && (
        <DeleteConfirmLayer
          onConfirm={executeDelete}
          onCancel={() => setDeleteModal(null)}
          onValidationError={(msg) => setAlertModal({ message: msg, variant: "warning" })}
        />
      )}
      {alertModal && (
        <AlertModal
          title={alertModal.title}
          message={alertModal.message}
          variant={alertModal.variant}
          onClose={() => setAlertModal(null)}
        />
      )}
      {showProcessModal && userId && (
        <ProcessScheduleModal
          userId={userId}
          initialProjectId={processModalProjectId}
          viewOnly={processModalViewOnly}
          onClose={() => { setShowProcessModal(false); setProcessModalProjectId(null); setProcessModalViewOnly(false); }}
          onSaved={() => { setShowProcessModal(false); setProcessModalProjectId(null); setProcessModalViewOnly(false); fetchProjects(userId); }}
        />
      )}

      {/* 업체 자세히 모달 (전화번호 제외, 업체정보 포함) */}
      {providerDetailModal && userId && (
        <ProviderDetailModal
          projectId={providerDetailModal.projectId}
          providerId={providerDetailModal.providerId}
          category={providerDetailModal.category}
          businessName={providerDetailModal.businessName}
          ownerName={providerDetailModal.ownerName}
          address={providerDetailModal.address}
          introduction={providerDetailModal.introduction}
          warrantyPeriod={providerDetailModal.warrantyPeriod}
          badges={providerDetailModal.badges}
          amount={providerDetailModal.amount}
          matchStatus={categoryAssignments[providerDetailModal.projectId]?.[providerDetailModal.category]?.provider_id === providerDetailModal.providerId
            ? categoryAssignments[providerDetailModal.projectId][providerDetailModal.category].match_status
            : null}
          matchStartedAt={categoryAssignments[providerDetailModal.projectId]?.[providerDetailModal.category]?.provider_id === providerDetailModal.providerId
            ? categoryAssignments[providerDetailModal.projectId][providerDetailModal.category].match_started_at
            : null}
          isCategoryCompleted={providerDetailModal.isCategoryCompleted}
          isSelectedProvider={categoryAssignments[providerDetailModal.projectId]?.[providerDetailModal.category]?.provider_id === providerDetailModal.providerId}
          onClose={() => setProviderDetailModal(null)}
          onDealStart={(showAlert) => {
            fetchProjects(userId);
            setProviderDetailModal(null);
            if (showAlert) {
              setAlertModal({
                title: "고민해보기 완료",
                message: "3일 이후에 따로 계약완료나 고민취소 버튼을 누르지 않으시면 자동으로 계약완료로 변경 됩니다.",
                variant: "success",
              });
            }
          }}
        />
      )}
    </div>
  );
}

const PROVIDER_BADGES = [
  { id: "sellin_certified", label: "셀인코치인증", bg: "bg-blue-100", color: "text-blue-700" },
  { id: "consumer_verified", label: "소비자인증", bg: "bg-yellow-100", color: "text-yellow-700" },
  { id: "warranty_best", label: "하자보수우수", bg: "bg-red-100", color: "text-red-700" },
  { id: "good_comm", label: "소통원활", bg: "bg-green-100", color: "text-green-700" },
];

function ProviderDetailModal({
  projectId,
  providerId,
  category,
  businessName,
  ownerName,
  address,
  introduction,
  warrantyPeriod,
  badges,
  amount,
  matchStatus,
  matchStartedAt,
  isCategoryCompleted,
  isSelectedProvider,
  onClose,
  onDealStart,
}: {
  projectId: string;
  providerId: string;
  category: string;
  businessName: string;
  ownerName: string;
  address: string;
  introduction: string;
  warrantyPeriod: string | null;
  badges: string[];
  amount?: number;
  matchStatus: string | null;
  matchStartedAt: string | null;
  isCategoryCompleted: boolean;
  isSelectedProvider: boolean;
  onClose: () => void;
  onDealStart: (showAlert?: boolean) => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [, setTick] = useState(0);
  const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;
  const format72h = (started: string | null) => {
    if (!started) return null;
    const deadline = new Date(started).getTime() + SEVENTY_TWO_HOURS_MS;
    const remaining = deadline - Date.now();
    if (remaining <= 0) return "72시간 경과";
    const h = Math.floor(remaining / (60 * 60 * 1000));
    const m = Math.floor((remaining % (60 * 60 * 1000)) / 60_000);
    const s = Math.floor((remaining % 60_000) / 1000);
    return `${h}시간 ${m}분 ${s}초 남음`;
  };
  useEffect(() => {
    if (!matchStartedAt || matchStatus !== "in_progress") return;
    const iv = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(iv);
  }, [matchStartedAt, matchStatus]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const handleDealStart = async () => {
    setIsSubmitting(true);
    const { error } = await supabase
      .from("project_category_assignments")
      .upsert(
        { project_id: projectId, category, provider_id: providerId, match_status: "in_progress", match_started_at: new Date().toISOString() },
        { onConflict: "project_id,category" }
      );
    setIsSubmitting(false);
    if (error) {
      console.error("고민해보기 오류:", error.message);
      return;
    }
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.access_token) {
        await fetch("/api/push/bidder-status", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
          body: JSON.stringify({ providerId, status: "in_progress" }),
        });
      }
    } catch {
      /* ignore push failure */
    }
    onDealStart(true);
  };

  const isInProgress = matchStatus === "in_progress" && isSelectedProvider;
  const isCompleted = matchStatus === "completed" && isSelectedProvider;
  const isCancelled = matchStatus === "cancelled" && isSelectedProvider;

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/50 p-4 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-900">업체 상세정보</h3>
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
        <div className="px-5 py-4 space-y-4 max-h-[50vh] overflow-y-auto">
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">업체명</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <p className="text-sm font-semibold text-gray-900">{businessName}</p>
              {badges.length > 0 && (
                <span className="flex flex-wrap gap-1">
                  {badges.map((bid) => {
                    const b = PROVIDER_BADGES.find((x) => x.id === bid);
                    return b ? (
                      <span key={bid} className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${b.bg} ${b.color}`}>
                        {b.label}
                      </span>
                    ) : null;
                  })}
                </span>
              )}
            </div>
          </div>
          {ownerName && (
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">대표자명</p>
              <p className="mt-0.5 text-sm text-gray-700">{ownerName}</p>
            </div>
          )}
          {warrantyPeriod && (
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">하자보수기간</p>
              <p className="mt-0.5 text-sm font-medium text-gray-800">{warrantyPeriod}개월</p>
            </div>
          )}
          {address && address !== "—" && (
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">업체소재지</p>
              <p className="mt-0.5 text-sm text-gray-700">{address}</p>
            </div>
          )}
          {amount != null && (
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{category} 견적단가</p>
              <p className="mt-0.5 text-base font-bold text-indigo-600">{amount.toLocaleString("ko-KR")}원</p>
            </div>
          )}
          {introduction && (
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">업체 소개</p>
              <p className="mt-0.5 text-sm text-gray-600 leading-relaxed whitespace-pre-line">{introduction}</p>
            </div>
          )}
        </div>
        <div className="px-5 py-4 border-t border-gray-200 space-y-2">
          {isInProgress && (
            <>
              {matchStartedAt && (
                <p className="text-center text-xs font-medium text-green-700">
                  72시간 {format72h(matchStartedAt)}
                </p>
              )}
            </>
          )}
          {isInProgress && (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={async () => {
                  setIsSubmitting(true);
                  await supabase
                    .from("project_category_assignments")
                    .update({ match_status: "cancelled" })
                    .eq("project_id", projectId)
                    .eq("category", category)
                    .eq("provider_id", providerId);
                  setIsSubmitting(false);
                  onDealStart(false);
                }}
                className="flex-1 rounded-xl border border-red-200 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                고민취소
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={async () => {
                  setIsSubmitting(true);
                  await supabase
                    .from("project_category_assignments")
                    .update({ match_status: "completed" })
                    .eq("project_id", projectId)
                    .eq("category", category)
                    .eq("provider_id", providerId);
                  try {
                    const { data } = await supabase.auth.getSession();
                    if (data?.session?.access_token) {
                      await fetch("/api/push/bidder-status", {
                        method: "POST",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
                        body: JSON.stringify({ providerId, status: "completed" }),
                      });
                    }
                  } catch {
                    /* ignore push failure */
                  }
                  setIsSubmitting(false);
                  onDealStart(false);
                }}
                className="flex-1 rounded-xl border border-green-200 py-2.5 text-sm font-medium text-green-600 hover:bg-green-50 disabled:opacity-50"
              >
                계약완료
              </button>
            </div>
          )}
          {isCategoryCompleted && !isCompleted ? (
            <p className="rounded-xl border border-gray-200 bg-gray-50 py-2.5 text-center text-sm font-medium text-gray-600">
              이 공정은 이미 계약이 완료되었습니다.
            </p>
          ) : !matchStatus || (matchStatus !== "in_progress" && matchStatus !== "completed") ? (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleDealStart}
              className="w-full rounded-xl bg-orange-500 py-2.5 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {isSubmitting ? "처리 중..." : "고민해보기"}
            </button>
          ) : isCompleted ? (
            <span className="block w-full rounded-xl bg-green-100 py-2.5 text-center text-sm font-medium text-green-700">계약완료</span>
          ) : null}
          <button type="button" onClick={onClose}
            className="w-full rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50">
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmLayer({
  title,
  message,
  confirmLabel,
  confirmType,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  confirmType: "publish" | "cancel";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onCancel]);
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 px-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold text-gray-900">{title}</h3>
        <p className="mt-3 whitespace-pre-line text-sm text-gray-600">{message}</p>
        <div className="mt-6 flex gap-2">
          <button type="button" onClick={onCancel}
            className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50">
            취소
          </button>
          <button type="button" onClick={onConfirm}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold text-white ${confirmType === "publish" ? "bg-indigo-600 hover:bg-indigo-700" : "bg-orange-600 hover:bg-orange-700"}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirmLayer({ onConfirm, onCancel, onValidationError }: { onConfirm: (password: string) => void; onCancel: () => void; onValidationError?: (message: string) => void }) {
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onCancel]);
  const handleSubmit = async () => {
    if (!password.trim()) {
      onValidationError?.("비밀번호를 입력해 주세요.");
      return;
    }
    setIsSubmitting(true);
    try {
      await onConfirm(password);
    } finally {
      setIsSubmitting(false);
    }
  };
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 px-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold text-gray-900">프로젝트 삭제</h3>
        <p className="mt-3 text-sm text-gray-600">
          삭제를 진행하려면 계정 비밀번호를 입력해 주세요.
        </p>
        <p className="mt-2 text-sm text-amber-600">
          • 3일 후에 프로젝트가 삭제됩니다.
          <br />
          • 3일 안에 복구할 수 있습니다.
        </p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호"
          className="mt-4 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          autoComplete="current-password"
        />
        <div className="mt-6 flex gap-2">
          <button type="button" onClick={onCancel}
            className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50">
            취소
          </button>
          <button type="button" onClick={handleSubmit} disabled={isSubmitting}
            className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
            {isSubmitting ? "처리 중..." : "삭제 요청"}
          </button>
        </div>
      </div>
    </div>
  );
}

