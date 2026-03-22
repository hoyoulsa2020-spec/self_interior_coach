"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import ProjectCreateModal, { type ProjectForEdit } from "@/components/ProjectCreateModal";
import ProjectCreateAIModal from "@/components/ProjectCreateAIModal";
import ProcessScheduleModal from "@/components/ProcessScheduleModal";
import { useDashboardLayout } from "@/app/dashboard/DashboardLayoutContext";
import AlertModal from "@/components/AlertModal";
import DashboardProjectDetailContent from "@/components/DashboardProjectDetailContent";
import ProviderBidDetailModal from "@/components/ProviderBidDetailModal";
import ConsentAgreementSection from "@/components/ConsentAgreementSection";
import { formatArea } from "@/lib/area";
import { CONSENT_VERSION } from "@/lib/consentPolicy";
import { normalizeWorkLabel, normalizeWorkTreeGroup } from "@/lib/workTreeLabels";

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

function RollingBidTicker({
  items,
}: {
  items: Array<{ label: string; status: "견적제안" | "고민중" | "계약완료" }>;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [items]);

  useEffect(() => {
    if (items.length <= 1) return;
    const iv = setInterval(() => {
      setIndex((prev) => (prev + 1) % items.length);
    }, 2300);
    return () => clearInterval(iv);
  }, [items]);

  if (items.length === 0) return null;

  return (
    <div className="project-bid-ticker">
      <div key={`${index}-${items[index].label}`} className="project-bid-ticker-item">
        <span className="project-bid-ticker-text">{items[index].label}</span>
        <span
          className={`project-bid-status-badge ${
            items[index].status === "계약완료"
              ? "project-bid-status-badge--completed"
              : items[index].status === "고민중"
                ? "project-bid-status-badge--progress"
                : "project-bid-status-badge--quoted"
          }`}
        >
          {items[index].status}
        </span>
      </div>
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
  privacy_consent_accepted: boolean;
  privacy_consent_accepted_at: string | null;
  alimtalk_consent_accepted: boolean;
  alimtalk_consent_accepted_at: string | null;
  consent_version: string | null;
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

type ScheduleRangeLike = { start?: string; end?: string };

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

function getProjectTopLevelCategories(project: Project): string[] {
  const workTreeGroups = Array.isArray(project.work_tree)
    ? project.work_tree
        .map((item) => normalizeWorkTreeGroup(item))
        .map((group) => group.cat)
        .filter(Boolean)
    : [];

  if (workTreeGroups.length > 0) {
    return [...new Set(workTreeGroups)];
  }

  if (project.work_details && typeof project.work_details === "object") {
    const detailKeys = Object.keys(project.work_details).filter(Boolean);
    if (detailKeys.length > 0) {
      return [...new Set(detailKeys)];
    }
  }

  if (Array.isArray(project.category)) {
    return [...new Set(project.category.filter(Boolean))];
  }

  return [];
}

function hasValidScheduleRange(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => hasValidScheduleRange(item));
  }

  if (!value || typeof value !== "object") {
    return false;
  }

  const range = value as ScheduleRangeLike;
  return Boolean(String(range.start ?? "").trim() && String(range.end ?? "").trim());
}

function hasAnyProcessSchedule(project: Project): boolean {
  if (project.process_schedule == null || typeof project.process_schedule !== "object") {
    return false;
  }

  return Object.values(project.process_schedule).some((value) => hasValidScheduleRange(value));
}

function hasCompleteProcessSchedule(project: Project): boolean {
  const categories = getProjectTopLevelCategories(project);
  if (categories.length === 0) {
    return false;
  }

  if (project.process_schedule == null || typeof project.process_schedule !== "object") {
    return false;
  }

  return categories.every((category, index) => {
    const byName = project.process_schedule?.[category];
    if (hasValidScheduleRange(byName)) {
      return true;
    }

    const byIndex = project.process_schedule?.[String(index)];
    return hasValidScheduleRange(byIndex);
  });
}

function getMissingProcessScheduleCategories(project: Project): string[] {
  const categories = getProjectTopLevelCategories(project);
  if (categories.length === 0) {
    return [];
  }

  return categories.filter((category, index) => {
    const byName = project.process_schedule?.[category];
    if (hasValidScheduleRange(byName)) {
      return false;
    }

    const byIndex = project.process_schedule?.[String(index)];
    return !hasValidScheduleRange(byIndex);
  });
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  active:            { label: "진행중",        color: "bg-green-50 text-green-700" },
  pending:           { label: "대기중",        color: "bg-yellow-50 text-yellow-700" },
  publish_requested: { label: "최종발행요청",   color: "bg-orange-50 text-orange-700" },
  estimate_waiting:   { label: "견적대기",      color: "bg-blue-50 text-blue-700" },
  completed:         { label: "완료",          color: "bg-blue-50 text-blue-700" },
  cancelled:         { label: "취소",          color: "bg-gray-100 text-gray-500" },
};

const STATUS_ORDER = ["pending", "publish_requested", "estimate_waiting", "active", "completed", "cancelled"] as const;

const KAKAO_MAP_KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY ?? "";
const AI_BUBBLE_HIDE_KEY = "dashboard-ai-bubble-hidden";
const AI_BUBBLE_HIDE_MS = 24 * 60 * 60 * 1000;

function loadKakaoMapServices(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (!KAKAO_MAP_KEY) return Promise.reject(new Error("no key"));

  const w = window as any;
  if (typeof w.kakao?.maps?.load === "function") {
    return new Promise((resolve, reject) => {
      try {
        w.kakao.maps.load(() => resolve());
      } catch (e) {
        reject(e instanceof Error ? e : new Error("kakao.maps.load"));
      }
    });
  }

  if (!document.getElementById("kakao-maps-sdk")) {
    const script = document.createElement("script");
    script.id = "kakao-maps-sdk";
    script.async = true;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_MAP_KEY}&autoload=false&libraries=services`;
    document.head.appendChild(script);
  }

  return new Promise((resolve, reject) => {
    const script = document.getElementById("kakao-maps-sdk") as HTMLScriptElement | null;
    let done = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (script) {
        script.removeEventListener("load", handleLoad);
        script.removeEventListener("error", handleError);
      }
      if (timeoutId != null) clearTimeout(timeoutId);
    };
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      cleanup();
      fn();
    };
    const handleError = () => finish(() => reject(new Error("kakao sdk script onerror")));
    const handleLoad = () => {
      if (typeof w.kakao?.maps?.load !== "function") {
        finish(() => reject(new Error("kakao maps namespace missing after script load")));
        return;
      }
      try {
        w.kakao.maps.load(() => finish(() => resolve()));
      } catch (e) {
        finish(() => reject(e instanceof Error ? e : new Error("kakao.maps.load")));
      }
    };

    if (!script) {
      reject(new Error("kakao sdk script missing"));
      return;
    }
    script.addEventListener("load", handleLoad);
    script.addEventListener("error", handleError);
    if (typeof w.kakao?.maps?.load === "function") {
      handleLoad();
      return;
    }
    timeoutId = setTimeout(() => {
      if (typeof w.kakao?.maps?.load === "function") handleLoad();
      else finish(() => reject(new Error("kakao sdk load timeout")));
    }, 20000);
  });
}

export default function ProjectsPage() {
  const router = useRouter();
  const { setAiModalOpen } = useDashboardLayout();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState({ name: "", phone: "", email: "" });
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [bubbleHidden, setBubbleHidden] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; projectId: string; type: "publish" | "cancel" } | null>(null);
  const [publishConsentState, setPublishConsentState] = useState({ privacy: false, alimtalk: false });
  const [deleteModal, setDeleteModal] = useState<{ projectId: string } | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [processModalProjectId, setProcessModalProjectId] = useState<string | null>(null);
  const [processModalViewOnly, setProcessModalViewOnly] = useState(false);
  const [alertModal, setAlertModal] = useState<{ title?: string; message: string; variant?: "info" | "warning" | "error" | "success" } | null>(null);
  const [tick, setTick] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [projectDetailModalId, setProjectDetailModalId] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<"latest" | "oldest" | "status">("latest");
  const [viewMode, setViewMode] = useState<"all" | "grouped">("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const initializedRef = useRef(false);

  // 진행중 프로젝트: 견적·업체 프로필 (입찰 단가 확인용)
  type EstimateRow = { provider_id: string; provider_business_name: string; amounts: Record<string, number> };
  const [estimatesByProject, setEstimatesByProject] = useState<Record<string, EstimateRow[]>>({});
  const [bidCheckDone, setBidCheckDone] = useState<Record<string, boolean>>({});
  const [geoPointCache, setGeoPointCache] = useState<Record<string, { lat: number; lng: number } | null>>({});
  const [providerProfiles, setProviderProfiles] = useState<Record<string, { business_name: string; owner_name: string; phone: string; address1: string; address2: string; introduction: string; warranty_period: string | null; badges: string[] | null }>>({});
  const [providerDetailModal, setProviderDetailModal] = useState<{ providerId: string; projectId: string; businessName: string; ownerName: string; phone: string; address: string; introduction: string; warrantyPeriod: string | null; badges: string[]; amount?: number; category: string; isCategoryCompleted: boolean; siteAddress: string; distanceText: string; isSelectedProvider: boolean; matchStatus: string | null; matchStartedAt: string | null } | null>(null);
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 639px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const SELECT_COLS = "id, title, status, publish_requested_at, privacy_consent_accepted, privacy_consent_accepted_at, alimtalk_consent_accepted, alimtalk_consent_accepted_at, consent_version, scheduled_delete_at, contact_name, contact_phone, contact_email, site_address1, site_address2, category, work_tree, work_details, start_date, move_in_date, supply_area_m2, exclusive_area_m2, is_expanded, process_schedule, created_at";

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

  /** 대시보드 등에서 ?highlight= 로 들어온 경우 해당 카드로 스크롤 */
  useEffect(() => {
    if (typeof window === "undefined" || projects.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const highlightId = params.get("highlight");
    if (!highlightId || !projects.some((p) => p.id === highlightId)) return;
    const t = window.setTimeout(() => {
      document.getElementById(`project-${highlightId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      router.replace("/dashboard/projects", { scroll: false });
    }, 450);
    return () => window.clearTimeout(t);
  }, [projects, router]);

  const openPublishConfirm = (p: Project) => {
    if (profileStatus !== "active") {
      setAlertModal({
        title: "계정 비활성화",
        message: "계정이 비활성화 상태입니다.\n셀인코치에게 문의 하세요.",
        variant: "warning",
      });
      return;
    }
    if (p.status === "pending" && !hasCompleteProcessSchedule(p)) {
      setAlertModal({ message: "선택한 모든 대공정의 공정표를 작성하셔야 최종발행요청이 됩니다.", variant: "warning" });
      return;
    }
    setPublishConsentState({
      privacy: p.privacy_consent_accepted ?? false,
      alimtalk: p.alimtalk_consent_accepted ?? false,
    });
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
      const acceptedAt = new Date().toISOString();
      await supabase.from("projects").update({
        status: "publish_requested",
        publish_requested_at: acceptedAt,
        privacy_consent_accepted: true,
        privacy_consent_accepted_at: acceptedAt,
        alimtalk_consent_accepted: true,
        alimtalk_consent_accepted_at: acceptedAt,
        consent_version: CONSENT_VERSION,
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
    setPublishConsentState({ privacy: false, alimtalk: false });
    fetchProjects(userId);
  };

  const canCancelPublish = (p: Project) => {
    if (p.status !== "publish_requested" || !p.publish_requested_at) return false;
    const requestedAt = new Date(p.publish_requested_at).getTime();
    return Date.now() - requestedAt < ONE_HOUR_MS;
  };

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

  // 1시간 경과 시 발행취소 버튼 제거 (tick으로 실시간 갱신)
  useEffect(() => {
    const hasPublishRequested = projects.some((p) => p.status === "publish_requested");
    if (!userId || !hasPublishRequested) return;
    const iv = setInterval(() => fetchProjects(userId), 60_000);
    return () => clearInterval(iv);
  }, [userId, projects, fetchProjects]);

  useEffect(() => {
    const addressEntries = [
      ...projects
        .filter((p) => p.status === "active")
        .map((p) => String(p.site_address1 ?? "").trim()),
      ...Object.values(providerProfiles).map((profile) => String(profile.address1 ?? "").trim()),
    ]
      .filter(Boolean)
      .filter((address, index, arr) => arr.indexOf(address) === index)
      .filter((address) => !(address in geoPointCache));

    if (addressEntries.length === 0) return;

    let cancelled = false;
    const load = async () => {
      try {
        await loadKakaoMapServices();
      } catch {
        return;
      }
      if (cancelled) return;
      const kakao = (window as any).kakao;
      if (!kakao?.maps?.services?.Geocoder) return;
      const geocoder = new kakao.maps.services.Geocoder();

      for (const address of addressEntries) {
        if (cancelled) return;
        const point = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
          geocoder.addressSearch(address, (result: any[], status: string) => {
            if (status === kakao.maps.services.Status.OK && result?.[0]) {
              const lat = parseFloat(result[0].y);
              const lng = parseFloat(result[0].x);
              if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
                resolve({ lat, lng });
                return;
              }
            }
            resolve(null);
          });
        });
        if (cancelled) return;
        setGeoPointCache((prev) => (address in prev ? prev : { ...prev, [address]: point }));
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [projects, providerProfiles, geoPointCache]);

  // 진행중/견적대기 프로젝트: 견적·업체 프로필 로드
  useEffect(() => {
    const bidTargetIds = projects
      .filter((p) => p.status === "active" || p.status === "estimate_waiting")
      .map((p) => p.id);
    if (bidTargetIds.length === 0) return;
    const load = async () => {
      const { data: estData } = await supabase
        .from("project_estimates")
        .select("project_id, provider_id, amounts, provider_business_name")
        .in("project_id", bidTargetIds);
      const estMap: Record<string, EstimateRow[]> = {};
      (estData ?? []).forEach((r) => {
        if (!estMap[r.project_id]) estMap[r.project_id] = [];
        estMap[r.project_id].push({
          provider_id: r.provider_id,
          provider_business_name: r.provider_business_name || "업체",
          amounts: (r.amounts as Record<string, number>) ?? {},
        });
      });
      setEstimatesByProject((prev) => {
        const next = { ...prev };
        bidTargetIds.forEach((id) => {
          next[id] = estMap[id] ?? [];
        });
        return next;
      });
      setBidCheckDone((prev) => {
        const next = { ...prev };
        bidTargetIds.forEach((id) => {
          next[id] = true;
        });
        return next;
      });

      const providerIds = [...new Set((estData ?? []).map((r) => r.provider_id))];
      if (providerIds.length > 0) {
        const { data: profData } = await supabase
          .from("profiles")
          .select("user_id, business_name, owner_name, phone, address1, address2, introduction, warranty_period, badges")
          .in("user_id", providerIds);
        const toArray = (v: unknown): string[] => {
          if (!v) return [];
          if (Array.isArray(v)) {
            return v
              .map((item) => {
                if (item == null) return "";
                if (typeof item === "string") return item.trim();
                if (typeof item === "object" && item !== null && "id" in item && typeof (item as { id: unknown }).id === "string") {
                  return (item as { id: string }).id.trim();
                }
                return String(item);
              })
              .filter(Boolean);
          }
          if (typeof v === "string") {
            try {
              const p = JSON.parse(v);
              if (Array.isArray(p)) return toArray(p);
            } catch { return v.split(",").map((s) => s.trim()).filter(Boolean); }
          }
          return [];
        };
        const profMap: Record<string, { business_name: string; owner_name: string; phone: string; address1: string; address2: string; introduction: string; warranty_period: string | null; badges: string[] | null }> = {};
        (profData ?? []).forEach((r) => {
          profMap[r.user_id] = {
            business_name: r.business_name ?? "",
            owner_name: r.owner_name ?? "",
            phone: r.phone ?? "",
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
        .in("project_id", bidTargetIds);
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
          .in("project_id", bidTargetIds);
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

  const openProjectDetail = useCallback((projectId: string) => {
    if (isMobile) {
      router.push(`/dashboard/projects/${projectId}`);
      return;
    }
    setProjectDetailModalId(projectId);
  }, [isMobile, router]);

  const selectedDetailProject = projectDetailModalId
    ? projects.find((project) => project.id === projectDetailModalId) ?? null
    : null;

  const projectCountsByStatus = useMemo(() => {
    const counts: Record<string, number> = { all: projects.length };
    for (const project of projects) {
      counts[project.status] = (counts[project.status] ?? 0) + 1;
    }
    return counts;
  }, [projects]);

  const sortedProjects = useMemo(() => {
    const list = [...projects];
    list.sort((a, b) => {
      if (sortMode === "oldest") {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      if (sortMode === "status") {
        const aIndex = STATUS_ORDER.indexOf(a.status as (typeof STATUS_ORDER)[number]);
        const bIndex = STATUS_ORDER.indexOf(b.status as (typeof STATUS_ORDER)[number]);
        if (aIndex !== bIndex) {
          return (aIndex === -1 ? STATUS_ORDER.length : aIndex) - (bIndex === -1 ? STATUS_ORDER.length : bIndex);
        }
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return list;
  }, [projects, sortMode]);

  const visibleProjects = useMemo(
    () => sortedProjects.filter((project) => statusFilter === "all" || project.status === statusFilter),
    [sortedProjects, statusFilter],
  );

  const groupedProjects = useMemo(
    () =>
      STATUS_ORDER.map((status) => ({
        status,
        items: visibleProjects.filter((project) => project.status === status),
      })).filter((group) => group.items.length > 0),
    [visibleProjects],
  );

  return (
    <div className="space-y-5">
      {/* 헤더: 제목 + (AI열: 버튼·말풍선·다시보기 | 생성열: 버튼만) */}
      <div className="overflow-visible rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight text-gray-900">내 프로젝트</h1>
            <p className="mt-1 text-sm leading-relaxed text-gray-500">진행 중인 셀인 프로젝트를 관리하세요.</p>
          </div>
          <div className="relative flex w-full shrink-0 flex-col overflow-visible sm:w-auto sm:min-w-0 sm:items-end">
            {/* AI 열 + 생성 열 — 말풍선은 레이아웃 밖(absolute)이라 카드 높이 불변 */}
            <div className="flex w-full flex-wrap gap-2 overflow-visible sm:w-auto sm:justify-end">
              <div className="relative min-w-0 flex-1 sm:flex-initial">
                <button
                  type="button"
                  onClick={() => setShowAIModal(true)}
                  className="inline-flex min-h-[44px] w-full flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 active:scale-95 ring-2 ring-indigo-300 ring-offset-2 ring-offset-transparent sm:min-h-0 sm:w-auto sm:flex-initial"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span className="hidden sm:inline">쉬운 AI 모드</span>
                  <span className="sm:hidden">AI</span>
                </button>
                {!bubbleHidden ? (
                  <div
                    className="pointer-events-none absolute left-1/2 top-full z-30 mt-1 w-[min(100%,10.75rem)] -translate-x-1/2"
                    aria-live="polite"
                  >
                    <span
                      className="pointer-events-none absolute -top-1 left-1/2 z-10 block size-2 -translate-x-1/2 rotate-45 border-l border-t border-amber-200/95 bg-amber-50 shadow-[0_-1px_0_0_rgba(251,191,36,0.25)]"
                      aria-hidden
                    />
                    <div className="animate-bubble-cute pointer-events-auto relative rounded-2xl border border-amber-200/90 bg-amber-50 px-2.5 py-2 pr-6 text-center shadow-md ring-1 ring-amber-100/80">
                      <p className="text-[10px] font-semibold leading-tight tracking-tight text-amber-950">
                        너무 어려우세요?
                        <span className="mt-0.5 block font-medium text-amber-800/95">제가 도울게요 ✨</span>
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setBubbleHidden(true);
                          try { localStorage.setItem(AI_BUBBLE_HIDE_KEY, String(Date.now() + AI_BUBBLE_HIDE_MS)); } catch { /* ignore */ }
                        }}
                        className="absolute right-1 top-1 rounded-full p-0.5 text-amber-600/90 transition hover:bg-amber-100/90"
                        aria-label="말풍선 닫기"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="flex min-w-0 flex-1 flex-col sm:flex-initial">
                <button
                  type="button"
                  onClick={() => setShowModal(true)}
                  className="inline-flex min-h-[44px] w-full flex-1 items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-sm font-medium text-indigo-600 shadow-sm transition hover:bg-indigo-50 active:scale-95 sm:min-h-0 sm:w-auto sm:flex-initial"
                >
                  <span className="text-base leading-none">+</span>
                  <span className="whitespace-nowrap">프로젝트 생성</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">내 프로젝트 정렬</p>
              <p className="mt-1 text-xs text-gray-500">전체 보기와 상태별 묶어보기를 빠르게 전환할 수 있습니다.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setViewMode("all")}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${viewMode === "all" ? "bg-violet-600 text-white" : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}
              >
                전체 보기
              </button>
              <button
                type="button"
                onClick={() => setViewMode("grouped")}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${viewMode === "grouped" ? "bg-violet-600 text-white" : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}
              >
                상태별 묶어보기
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${statusFilter === "all" ? "bg-indigo-600 text-white" : "border border-gray-200 bg-white text-gray-600"}`}
              >
                전체 {projectCountsByStatus.all ?? 0}
              </button>
              {STATUS_ORDER.map((status) => {
                const info = STATUS_LABEL[status];
                const count = projectCountsByStatus[status] ?? 0;
                if (count === 0) return null;
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setStatusFilter(status)}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${statusFilter === status ? "bg-indigo-600 text-white" : "border border-gray-200 bg-white text-gray-600"}`}
                  >
                    {info.label} {count}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="project-sort-mode" className="shrink-0 text-xs font-medium text-gray-500">정렬</label>
              <select
                id="project-sort-mode"
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as "latest" | "oldest" | "status")}
                className="min-h-[40px] rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none ring-0 focus:border-violet-300"
              >
                <option value="latest">최신순</option>
                <option value="oldest">오래된순</option>
                <option value="status">상태순</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* 목록 */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-gray-100" />)}
        </div>
      ) : visibleProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center overflow-visible rounded-2xl border border-dashed border-gray-200 bg-white py-20 text-center shadow-sm">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-400">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </div>
          <p className="mt-4 text-sm font-medium text-gray-700">{projects.length === 0 ? "아직 등록한 프로젝트가 없습니다" : "선택한 조건의 프로젝트가 없습니다"}</p>
          <p className="mt-1 text-xs text-gray-400">{projects.length === 0 ? `+ 프로젝트 생성 버튼을 눌러 첫 프로젝트를 시작해보세요.` : "상태 필터나 정렬 조건을 바꿔서 다시 확인해보세요."}</p>
          <div className="relative mt-6 flex w-full max-w-md flex-col items-center gap-3 overflow-visible">
            <div className="flex w-full flex-wrap items-start justify-center gap-2 overflow-visible">
              <div className="relative min-w-0 flex-1 sm:max-w-[10rem] sm:flex-initial">
                <button type="button" onClick={() => setShowAIModal(true)}
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  쉬운 AI 모드
                </button>
                {!bubbleHidden ? (
                  <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-1 w-[min(100%,10.75rem)] -translate-x-1/2">
                    <span
                      className="pointer-events-none absolute -top-1 left-1/2 z-10 block size-2 -translate-x-1/2 rotate-45 border-l border-t border-amber-200/95 bg-amber-50 shadow-[0_-1px_0_0_rgba(251,191,36,0.25)]"
                      aria-hidden
                    />
                    <div className="animate-bubble-cute pointer-events-auto relative rounded-2xl border border-amber-200/90 bg-amber-50 px-2.5 py-2 pr-6 text-center shadow-md ring-1 ring-amber-100/80">
                      <p className="text-[10px] font-semibold leading-tight tracking-tight text-amber-950">
                        너무 어려우세요?
                        <span className="mt-0.5 block font-medium text-amber-800/95">제가 도울게요 ✨</span>
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setBubbleHidden(true);
                          try { localStorage.setItem(AI_BUBBLE_HIDE_KEY, String(Date.now() + AI_BUBBLE_HIDE_MS)); } catch { /* ignore */ }
                        }}
                        className="absolute right-1 top-1 rounded-full p-0.5 text-amber-600/90 transition hover:bg-amber-100/90"
                        aria-label="말풍선 닫기"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="flex min-w-0 flex-1 flex-col sm:max-w-[10rem] sm:flex-initial">
                <button type="button" onClick={() => setShowModal(true)}
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-white px-5 py-2.5 text-sm font-semibold text-indigo-700 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50/80">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  + 프로젝트 생성
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {(viewMode === "grouped"
            ? groupedProjects
            : [{ status: "all", items: visibleProjects }]).map((group) => {
            const statusInfo =
              group.status === "all"
                ? null
                : STATUS_LABEL[group.status] ?? { label: group.status, color: "bg-gray-100 text-gray-500" };
            return (
              <section key={group.status} className="space-y-3">
                {viewMode === "grouped" && statusInfo && (
                  <div className="flex items-center justify-between rounded-2xl border border-violet-100 bg-violet-50/60 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusInfo.color}`}>{statusInfo.label}</span>
                      <p className="text-sm font-semibold text-gray-800">{group.items.length}개</p>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                  {group.items.map((p) => {
            const statusInfo = STATUS_LABEL[p.status] ?? { label: p.status, color: "bg-gray-100 text-gray-500" };
            const isScheduledDelete = !!p.scheduled_delete_at && Date.now() < new Date(p.scheduled_delete_at).getTime();
            const projectEstimates = estimatesByProject[p.id] ?? [];
            const projectAssignments = categoryAssignments[p.id] ?? {};
            const siteAddress = String(p.site_address1 ?? "").trim();
            const siteGeo = siteAddress ? geoPointCache[siteAddress] : null;
            const waitingBidItems = Array.from(
              new Set(
                projectEstimates.flatMap((estimate) => {
                  const providerName = estimate.provider_business_name?.trim() || "업체";
                  return Object.entries(estimate.amounts ?? {})
                    .filter(([, amount]) => typeof amount === "number" && amount >= 0)
                    .map(([cat, amount]) => `${cat} ${providerName} : ${Number(amount).toLocaleString("ko-KR")}원`);
                }),
              ),
            );
            const hasNoBidsYet =
              p.status === "estimate_waiting" &&
              bidCheckDone[p.id] === true &&
              (estimatesByProject[p.id]?.length ?? 0) === 0;
            const hasWaitingBids =
              p.status === "estimate_waiting" &&
              bidCheckDone[p.id] === true &&
              waitingBidItems.length > 0;
            const fmtDate = (d: string) => new Date(d).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });

            // work_tree 우선, 없으면 work_details 의 subs 로 재구성, 그것도 없으면 flat fallback
            let groups: WorkTreeItem[] = (p.work_tree ?? []).map((g) => normalizeWorkTreeGroup(g));
            if (groups.length === 0 && p.work_details) {
              // work_details 에 subs 가 있으면 정확한 계층 복원 가능
              const cats = Object.keys(p.work_details);
              if (cats.length > 0) {
                groups = cats.map((cat) =>
                  normalizeWorkTreeGroup({
                    cat,
                    subs: (p.work_details![cat] as WorkDetail).subs ?? [],
                  })
                );
              }
            }
            const isLegacy = groups.length === 0;
            const legacySubs = isLegacy ? (p.category ?? []).map(normalizeWorkLabel).filter(Boolean) : [];
            const hasAnyProjectBids = projectEstimates.some((estimate) =>
              groups.some((g) => {
                const amount = estimate.amounts?.[g.cat];
                return typeof amount === "number" && amount >= 0;
              }),
            );
            const orderedGroups = hasAnyProjectBids
              ? [...groups].sort((a, b) => {
                  const aHasBid = projectEstimates.some((estimate) => {
                    const amount = estimate.amounts?.[a.cat];
                    return typeof amount === "number" && amount >= 0;
                  });
                  const bHasBid = projectEstimates.some((estimate) => {
                    const amount = estimate.amounts?.[b.cat];
                    return typeof amount === "number" && amount >= 0;
                  });
                  if (aHasBid === bHasBid) return 0;
                  return aHasBid ? -1 : 1;
                })
              : groups;
            const requestedCats = groups.map((g) => g.cat).filter(Boolean);
            const requestedProcessCount = requestedCats.length;
            const proposedProviderIds = new Set(
              projectEstimates
                .filter((estimate) =>
                  requestedCats.some((cat) => {
                    const amount = estimate.amounts?.[cat];
                    return typeof amount === "number" && amount >= 0;
                  }),
                )
                .map((estimate) => estimate.provider_id)
                .filter(Boolean),
            );
            const proposedProcessCount = requestedCats.filter((cat) =>
              projectEstimates.some((estimate) => {
                const amount = estimate.amounts?.[cat];
                return typeof amount === "number" && amount >= 0;
              }),
            ).length;
            const lackingProcessCount = Math.max(0, requestedProcessCount - proposedProcessCount);
            const activeTopBidItems =
              p.status === "active"
                ? groups.flatMap((g) => {
                    const assignment = projectAssignments[g.cat];
                    const topBid = projectEstimates
                      .map((estimate) => ({
                        providerId: estimate.provider_id,
                        providerName: estimate.provider_business_name?.trim() || "업체",
                        amount: estimate.amounts[g.cat],
                      }))
                      .filter((row): row is { providerId: string; providerName: string; amount: number } =>
                        typeof row.amount === "number" && row.amount >= 0,
                      )
                      .sort((a, b) => a.amount - b.amount)[0];

                    return topBid
                      ? [
                          {
                            label: `${g.cat} - ${topBid.providerName} - ${topBid.amount.toLocaleString("ko-KR")}원`,
                            status:
                              assignment?.provider_id === topBid.providerId
                                ? assignment.match_status === "completed"
                                  ? "계약완료"
                                  : "고민중"
                                : "견적제안",
                          } as const,
                        ]
                      : [];
                  })
                : [];

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
                    {(p.status === "pending" || p.status === "publish_requested") && !p.scheduled_delete_at && !hasAnyProcessSchedule(p) && (
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
                    {hasAnyProcessSchedule(p) && !p.scheduled_delete_at && (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
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
                          {p.status === "pending" && !hasCompleteProcessSchedule(p) && (
                            <span className="project-bid-waiting-blink hidden text-[11px] font-medium leading-relaxed text-rose-400 sm:inline">
                              {`👈 ${getMissingProcessScheduleCategories(p).join(", ")} 스케줄을 선택해주세요.`}
                            </span>
                          )}
                        </div>
                        {p.status === "pending" && !hasCompleteProcessSchedule(p) && (
                          <span className="project-bid-waiting-blink pl-1 text-[11px] font-medium leading-relaxed text-rose-400 sm:hidden">
                            {`☝️ ${getMissingProcessScheduleCategories(p).join(", ")} 스케줄을 선택해주세요.`}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
                    <Link
                      href={`/dashboard/projects/${p.id}/quote`}
                      className="rounded-full border border-indigo-200 bg-indigo-50/80 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-100"
                    >
                      견적서
                    </Link>
                    <span className="text-[11px] text-gray-400">{fmtDate(p.created_at)}</span>
                  </div>
                </div>

                {hasNoBidsYet && (
                  <div className="border-b border-blue-100 bg-blue-50/80 px-5 py-3">
                    <p className="mb-2 text-center text-[11px] font-medium text-blue-800 sm:text-xs">
                      총 요청한 공정수는 {requestedProcessCount}개이며 현재 {proposedProcessCount}개의 공정이 단가 입력 되었습니다. 총 입찰업체는 {proposedProviderIds.size}개 입니다. 부족한 공정수는 {lackingProcessCount}개 입니다.
                    </p>
                    <p className="project-bid-waiting-message project-bid-waiting-blink text-blue-700">
                      <span className="block sm:inline">시공업체가 내용을 확인하고 있어요.</span>
                      <span className="block sm:ml-1 sm:inline">곧 업체의 제안이 들어 옵니다.</span>
                    </p>
                  </div>
                )}

                {hasWaitingBids && (
                  <div className="border-b border-emerald-100 bg-emerald-50/85 px-5 py-3">
                    <p className="mb-2 text-center text-[11px] font-medium text-emerald-800 sm:text-xs">
                      총 요청한 공정수는 {requestedProcessCount}개이며 현재 {proposedProcessCount}개의 공정이 단가 입력 되었습니다. 총 입찰업체는 {proposedProviderIds.size}개 입니다. 부족한 공정수는 {lackingProcessCount}개 입니다.
                    </p>
                    <p className="project-bid-waiting-blink text-center text-[11px] font-semibold leading-relaxed text-emerald-700 sm:text-xs">
                      {waitingBidItems.map((item) => `{${item}}`).join(", ")} 제안 했습니다.
                    </p>
                  </div>
                )}

                {p.status === "active" && activeTopBidItems.length > 0 && (
                  <div className="border-b border-violet-100 bg-violet-50/85 px-5 py-3">
                    <p className="mb-2 text-center text-[11px] font-medium text-violet-800 sm:text-xs">
                      총 요청한 공정수는 {requestedProcessCount}개이며 현재 {proposedProcessCount}개의 공정이 단가 입력 되었습니다. 총 입찰업체는 {proposedProviderIds.size}개 입니다. 부족한 공정수는 {lackingProcessCount}개 입니다.
                    </p>
                    <p className="text-center text-[11px] font-semibold text-violet-700 sm:text-xs">
                      대공정별 견적 최저가 1위
                    </p>
                    <div className="mt-2">
                      <RollingBidTicker items={activeTopBidItems} />
                    </div>
                  </div>
                )}

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

                {(orderedGroups.length > 0 || legacySubs.length > 0) && (
                  <div className="border-t border-gray-100 px-5 py-4">
                    <div className="flex flex-col gap-3 rounded-2xl border border-violet-200 bg-violet-50/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-violet-900">프로젝트 상세는 별도 화면으로 정리했습니다.</p>
                        <p className="mt-1 text-xs leading-relaxed text-violet-700/90">
                          대공정 {orderedGroups.length || legacySubs.length}개, 하위공정은 기본 접힘 상태로 확인할 수 있습니다.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => openProjectDetail(p.id)}
                        className="inline-flex min-h-[42px] items-center justify-center rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
                      >
                        자세히보기
                      </button>
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
                    <div className="group relative flex-1 min-w-[80px]">
                      {!hasCompleteProcessSchedule(p) && (
                        <div
                          className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-2xl border border-pink-200 bg-gradient-to-b from-pink-50 via-rose-50 to-pink-50 px-2.5 py-1.5 text-center text-[10px] font-semibold leading-tight text-pink-700 shadow-md ring-1 ring-pink-100/90"
                          role="tooltip"
                        >
                          모든 대공정 공정표 작성후 활성가능
                          <span
                            className="absolute left-1/2 top-full -mt-px -translate-x-1/2 border-[7px] border-transparent border-t-pink-100"
                            aria-hidden
                          />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => openPublishConfirm(p)}
                        disabled={!hasCompleteProcessSchedule(p) || publishingId === p.id}
                        className={`w-full rounded-xl py-2.5 text-xs font-medium text-white ${hasCompleteProcessSchedule(p) ? "bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50" : "cursor-not-allowed bg-gray-300"}`}
                      >
                        {publishingId === p.id ? "요청 중..." : "최종발행요청"}
                      </button>
                    </div>
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
              </section>
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
      {showAIModal && userId && (
        <ProjectCreateAIModal
          userId={userId}
          userProfile={userProfile}
          onClose={() => setShowAIModal(false)}
          onCreated={(projectId) => {
            void fetchProjects(userId).then(() => {
              setShowAIModal(false);
              if (projectId) {
                window.setTimeout(() => {
                  document.getElementById(`project-${projectId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                }, 200);
              }
            });
          }}
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
      {selectedDetailProject && (
        <div className="fixed inset-0 z-[92] hidden overflow-y-auto bg-black/55 px-4 pb-6 pt-24 sm:block" onClick={() => setProjectDetailModalId(null)}>
          <div
            className="mx-auto flex max-h-[calc(100vh-7rem)] min-h-[28rem] max-w-6xl flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-violet-100 px-6 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-500">Project Detail</p>
                <h2 className="mt-1 text-xl font-bold text-gray-900">{selectedDetailProject.title}</h2>
              </div>
              <button
                type="button"
                onClick={() => setProjectDetailModalId(null)}
                className="rounded-full border border-violet-200 p-2 text-violet-600 hover:bg-violet-50"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto bg-violet-50/40 px-6 py-5">
              <DashboardProjectDetailContent
                project={selectedDetailProject}
                estimates={estimatesByProject[selectedDetailProject.id] ?? []}
                categoryAssignments={categoryAssignments[selectedDetailProject.id] ?? {}}
                providerProfiles={providerProfiles}
                geoPointCache={geoPointCache}
                siteAddress={String(selectedDetailProject.site_address1 ?? "").trim()}
                siteGeo={selectedDetailProject.site_address1 ? geoPointCache[String(selectedDetailProject.site_address1).trim()] ?? null : null}
                onLightboxOpen={(urls, index) => setLightbox({ urls, index })}
                onOpenProviderDetail={(payload) => setProviderDetailModal(payload)}
              />
            </div>
          </div>
        </div>
      )}

      {/* 확인 레이어팝업 */}
      {confirmModal && (
        <ConfirmLayer
          title={confirmModal.title}
          message={confirmModal.message}
          confirmLabel={confirmModal.type === "publish" ? "최종발행요청" : "확인"}
          confirmType={confirmModal.type}
          onConfirm={executeConfirm}
          onCancel={() => {
            setConfirmModal(null);
            setPublishConsentState({ privacy: false, alimtalk: false });
          }}
          confirmDisabled={confirmModal.type === "publish" && (!publishConsentState.privacy || !publishConsentState.alimtalk)}
        >
          {confirmModal.type === "publish" && (
            <div className="mt-5">
              <ConsentAgreementSection
                title="최종발행 필수 동의"
                description="최종발행요청 전 아래 필수 항목에 동의해야 합니다."
                privacyChecked={publishConsentState.privacy}
                alimtalkChecked={publishConsentState.alimtalk}
                onPrivacyChange={(checked) => setPublishConsentState((prev) => ({ ...prev, privacy: checked }))}
                onAlimtalkChange={(checked) => setPublishConsentState((prev) => ({ ...prev, alimtalk: checked }))}
              />
            </div>
          )}
        </ConfirmLayer>
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
        <ProviderBidDetailModal
          projectId={providerDetailModal.projectId}
          providerId={providerDetailModal.providerId}
          category={providerDetailModal.category}
          businessName={providerDetailModal.businessName}
          ownerName={providerDetailModal.ownerName}
          phone={providerDetailModal.phone}
          address={providerDetailModal.address}
          introduction={providerDetailModal.introduction}
          warrantyPeriod={providerDetailModal.warrantyPeriod}
          badges={providerDetailModal.badges}
          amount={providerDetailModal.amount}
          siteAddress={providerDetailModal.siteAddress}
          distanceText={providerDetailModal.distanceText}
          matchStatus={providerDetailModal.matchStatus}
          matchStartedAt={providerDetailModal.matchStartedAt}
          isCategoryCompleted={providerDetailModal.isCategoryCompleted}
          isSelectedProvider={providerDetailModal.isSelectedProvider}
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
  siteAddress,
  distanceText,
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
  siteAddress: string;
  distanceText: string;
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
                  {badges.map((bid, bidx) => {
                    const bidStr =
                      typeof bid === "string"
                        ? bid
                        : bid && typeof bid === "object" && bid !== null && "id" in bid && typeof (bid as { id: unknown }).id === "string"
                          ? (bid as { id: string }).id
                          : "";
                    const b = PROVIDER_BADGES.find((x) => x.id === bidStr);
                    return b ? (
                      <span key={`pb-${bidStr || "x"}-${bidx}`} className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${b.bg} ${b.color}`}>
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
          {siteAddress && (
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">현장 &lt;-&gt; 업체</p>
              <p className="mt-0.5 text-sm text-gray-700">{distanceText}</p>
              <p className="mt-1 text-xs leading-relaxed text-gray-500">{siteAddress}</p>
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
  confirmDisabled = false,
  children,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  confirmType: "publish" | "cancel";
  onConfirm: () => void;
  onCancel: () => void;
  confirmDisabled?: boolean;
  children?: React.ReactNode;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onCancel]);
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 px-4" onClick={onCancel}>
      <div className={`w-full rounded-2xl bg-white p-6 shadow-xl ${confirmType === "publish" ? "max-w-lg" : "max-w-sm"}`} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold text-gray-900">{title}</h3>
        <p className="mt-3 whitespace-pre-line text-sm text-gray-600">{message}</p>
        {children}
        <div className="mt-6 flex gap-2">
          <button type="button" onClick={onCancel}
            className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50">
            취소
          </button>
          <button type="button" onClick={onConfirm} disabled={confirmDisabled}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold text-white ${confirmType === "publish" ? "bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300" : "bg-orange-600 hover:bg-orange-700 disabled:bg-orange-300"} disabled:cursor-not-allowed`}>
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

