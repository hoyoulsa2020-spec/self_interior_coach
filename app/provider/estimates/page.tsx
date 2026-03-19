"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { formatArea } from "@/lib/area";
import AlertModal from "@/components/AlertModal";
import ProviderSearchBar from "@/components/ProviderSearchBar";

type WorkTreeItem = { cat: string; subs: string[] };
type WorkDetail = { requirements: string; image_urls: string[]; subs?: string[] };

type Project = {
  id: string;
  title: string;
  status: string;
  assigned_provider_id: string | null;
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

function categoryMatches(providerCat: string, projectCat: string): boolean {
  const a = (providerCat ?? "").trim();
  const b = (projectCat ?? "").trim();
  if (!a || !b) return false;
  return a === b;
}

function getProjectCategories(p: Project): string[] {
  const tree = p.work_tree ?? [];
  if (tree.length > 0) return tree.map((g) => (g.cat ?? "").trim()).filter(Boolean);
  if (p.work_details && Object.keys(p.work_details).length > 0) return Object.keys(p.work_details).map((k) => k.trim()).filter(Boolean);
  if (p.category?.length) return (p.category as string[]).map((c) => String(c).trim()).filter(Boolean);
  return [];
}

function formatAmountDisplay(val: string): string {
  const digits = (val ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("ko-KR");
}

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
function formatScheduleRange(processSchedule: Record<string, unknown> | null, catName: string): string {
  const raw = processSchedule?.[catName];
  if (!raw) return "";
  const ranges = Array.isArray(raw) ? raw : [raw];
  if (ranges.length === 0) return "";
  const r = ranges[ranges.length - 1] as { start: string; end: string };
  const fmt = (s: string) => {
    const part = (typeof s === "string" ? s : "").split("T")[0];
    const [y, m, d] = part.split("-").map(Number);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return "?";
    const date = new Date(y, m - 1, d);
    return `${m}/${d} (${DAY_LABELS[date.getDay()]})`;
  };
  return `${fmt(r.start)} ~ ${fmt(r.end)}`;
}

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

const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;

type BidStatus = "none" | "매칭대기" | "고민중" | "계약완료" | "매칭실패" | "거래취소";

function getBidStatusByCategory(
  p: Project,
  category: string,
  providerId: string,
  hasBidForCat: boolean,
  categoryAssignments: Record<string, { provider_id: string; match_status: string; match_started_at: string | null }>
): BidStatus {
  if (!hasBidForCat) return "none";
  const assigned = categoryAssignments[category];
  if (!assigned) return "매칭대기";
  if (assigned.provider_id !== providerId) return "매칭실패";
  if (assigned.match_status === "cancelled") return "거래취소";
  if (assigned.match_status === "completed") return "계약완료";
  if (assigned.match_status === "in_progress") return "고민중";
  return "매칭대기";
}

function format72hRemaining(matchStartedAt: string | null): string | null {
  if (!matchStartedAt) return null;
  const deadline = new Date(matchStartedAt).getTime() + SEVENTY_TWO_HOURS_MS;
  const remaining = deadline - Date.now();
  if (remaining <= 0) return null;
  const h = Math.floor(remaining / (60 * 60 * 1000));
  const m = Math.floor((remaining % (60 * 60 * 1000)) / 60_000);
  const s = Math.floor((remaining % 60_000) / 1000);
  return `${h}시간 ${m}분 ${s}초`;
}

type StatusFilter = "견적대기" | "계약완료" | "매칭실패";

function projectMatchesFilter(
  p: Project,
  statusFilter: StatusFilter,
  myEstimates: Record<string, Record<string, number>>,
  categoryAssignments: Record<string, Record<string, { provider_id: string; match_status: string; match_started_at: string | null }>>,
  providerId: string,
  getGroupsForProvider: (p: Project, bidCats?: string[]) => WorkTreeItem[]
): boolean {
  const hasBid = !!myEstimates[p.id] && Object.keys(myEstimates[p.id]).length > 0;
  const bidCats = hasBid ? Object.keys(myEstimates[p.id] ?? {}).filter((c) => (myEstimates[p.id]?.[c] ?? 0) >= 0) : undefined;
  const groups = getGroupsForProvider(p, bidCats);
  for (const g of groups) {
    const amt = hasBid ? (myEstimates[p.id]?.[g.cat] ?? null) : null;
    const hasBidForCat = hasBid && amt !== undefined && amt !== null;
    const catStatus = hasBidForCat ? getBidStatusByCategory(p, g.cat, providerId, true, categoryAssignments[p.id] ?? {}) : "none";
    if (statusFilter === "견적대기" && catStatus !== "계약완료" && catStatus !== "매칭실패") return true;
    if (statusFilter === "계약완료" && catStatus === "계약완료") return true;
    if (statusFilter === "매칭실패" && catStatus === "매칭실패") return true;
  }
  return false;
}

export default function ProviderEstimatesPage() {
  const pathname = usePathname();
  const statusFilter: StatusFilter =
    pathname === "/provider/estimates/completed" ? "계약완료"
    : pathname === "/provider/estimates/failed" ? "매칭실패"
    : "견적대기";

  const [myCategories, setMyCategories] = useState<string[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [myEstimates, setMyEstimates] = useState<Record<string, Record<string, number>>>({});
  const [categoryAssignments, setCategoryAssignments] = useState<Record<string, Record<string, { provider_id: string; match_status: string; match_started_at: string | null }>>>({});
  const [providerId, setProviderId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  const [bidModal, setBidModal] = useState<{ project: Project; category?: string } | null>(null);
  const [modalAmounts, setModalAmounts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [alertMessage, setAlertMessage] = useState<{ title?: string; message: string; variant?: "info" | "warning" | "error" } | null>(null);
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [tick, setTick] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const initializedRef = useRef(false);

  const hasInProgress = Object.values(categoryAssignments).some((cats) =>
    Object.values(cats).some((a) => a.match_status === "in_progress" && a.provider_id === providerId)
  );
  useEffect(() => {
    if (!hasInProgress) return;
    const iv = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(iv);
  }, [hasInProgress]);

  const getGroupsForProvider = (p: Project, bidCategories?: string[]): WorkTreeItem[] => {
    const providerCats = myCategories.map((c) => c.trim()).filter(Boolean);
    if (providerCats.length === 0) {
      let groups: WorkTreeItem[] = p.work_tree ?? [];
      if (groups.length === 0 && p.work_details) {
        groups = Object.keys(p.work_details).map((cat) => ({
          cat,
          subs: (p.work_details![cat] as WorkDetail).subs ?? [],
        }));
      }
      if (groups.length === 0 && p.category?.length) {
        groups = (p.category as string[]).map((cat) => ({ cat, subs: [] }));
      }
      return groups.length > 0 ? groups : (bidCategories?.length ? bidCategories.map((cat) => ({ cat, subs: [] as string[] })) : []);
    }
    const matches = (projectCat: string) =>
      providerCats.some((pc) => categoryMatches(pc, projectCat));
    let groups: WorkTreeItem[] = p.work_tree ?? [];
    if (groups.length === 0 && p.work_details) {
      groups = Object.keys(p.work_details).map((cat) => ({
        cat,
        subs: (p.work_details![cat] as WorkDetail).subs ?? [],
      }));
    }
    if (groups.length === 0 && p.category?.length) {
      groups = (p.category as string[]).map((cat) => ({ cat, subs: [] }));
    }
    let filtered = groups.filter((g) => matches(g.cat?.trim() ?? ""));
    if (filtered.length === 0 && bidCategories?.length) {
      filtered = bidCategories.map((cat) => ({ cat, subs: [] as string[] }));
    }
    if (filtered.length === 0 && groups.length > 0) return groups;
    if (filtered.length === 0) return [{ cat: "공사항목", subs: [] }];
    return filtered;
  };

  const load = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData?.session;
    if (!session) { window.location.href = "/login"; return; }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, category, status")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (!profile || profile.role !== "provider") {
      window.location.href = "/login";
      return;
    }

    setProviderId(session.user.id);
    setProfileStatus(profile.status ?? null);
    const cats = toArray(profile.category);
    setMyCategories(cats);
    setLoadError(null);

    const { data: projData, error: projError } = await supabase
      .from("projects")
      .select("id, title, status, assigned_provider_id, contact_name, contact_phone, contact_email, site_address1, site_address2, category, work_tree, work_details, start_date, move_in_date, supply_area_m2, exclusive_area_m2, is_expanded, process_schedule, created_at")
      .in("status", ["estimate_waiting", "active"])
      .order("created_at", { ascending: false });

    if (projError) {
      setLoadError(`프로젝트 조회 실패: ${projError.message}`);
      setAllProjects([]);
      setIsLoading(false);
      return;
    }

    const list = (projData ?? []) as Project[];
    const providerCats = cats.map((c) => c.trim()).filter(Boolean);
    const matchesProject = (projectCat: string) =>
      providerCats.some((pc) => categoryMatches(pc, projectCat));
    const matched = list.filter((p) => {
      if (providerCats.length === 0) return true;
      const projectCats = getProjectCategories(p);
      if (projectCats.length === 0) return true;
      return projectCats.some((projectCat) => matchesProject(projectCat));
    });

    const { data: estData } = await supabase
      .from("project_estimates")
      .select("project_id, amounts")
      .eq("provider_id", session.user.id);

    const allProjectIds = new Set(matched.map((m) => m.id));
    (estData ?? []).forEach((row) => allProjectIds.add(row.project_id));

    let extra: Project[] = [];
    if (allProjectIds.size > 0) {
      const idsNotInMatched = Array.from(allProjectIds).filter((id) => !matched.some((m) => m.id === id));
      if (idsNotInMatched.length > 0) {
        const { data: extraData } = await supabase
          .from("projects")
          .select("id, title, status, assigned_provider_id, contact_name, contact_phone, contact_email, site_address1, site_address2, category, work_tree, work_details, start_date, move_in_date, supply_area_m2, exclusive_area_m2, is_expanded, process_schedule, created_at")
          .in("id", idsNotInMatched);
        extra = (extraData ?? []) as Project[];
      }
    }

    const merged = [...matched];
    extra.forEach((p) => {
      if (!merged.some((m) => m.id === p.id)) merged.push(p);
    });
    merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const estMap: Record<string, Record<string, number>> = {};
    (estData ?? []).forEach((row) => {
      estMap[row.project_id] = (row.amounts as Record<string, number>) ?? {};
    });
    setMyEstimates(estMap);

    const projectIds = Array.from(allProjectIds);
    const assignMap: Record<string, Record<string, { provider_id: string; match_status: string; match_started_at: string | null }>> = {};
    const toAutoComplete: { id: string }[] = [];
    if (projectIds.length > 0) {
      const { data: assignData } = await supabase
        .from("project_category_assignments")
        .select("id, project_id, category, provider_id, match_status, match_started_at")
        .in("project_id", projectIds);
      const now = Date.now();
      (assignData ?? []).forEach((row) => {
        if (!assignMap[row.project_id]) assignMap[row.project_id] = {};
        let status = row.match_status ?? "in_progress";
        if (status === "in_progress" && row.match_started_at && row.provider_id === session.user.id) {
          const deadline = new Date(row.match_started_at).getTime() + SEVENTY_TWO_HOURS_MS;
          if (now >= deadline) toAutoComplete.push({ id: row.id });
        }
        assignMap[row.project_id][row.category] = {
          provider_id: row.provider_id,
          match_status: status,
          match_started_at: row.match_started_at,
        };
      });
      for (const { id } of toAutoComplete) {
        await supabase.from("project_category_assignments").update({ match_status: "completed" }).eq("id", id);
      }
      if (toAutoComplete.length > 0) {
        const { data: refreshed } = await supabase
          .from("project_category_assignments")
          .select("project_id, category, provider_id, match_status, match_started_at")
          .in("project_id", projectIds);
        refreshed?.forEach((row) => {
          if (!assignMap[row.project_id]) assignMap[row.project_id] = {};
          assignMap[row.project_id][row.category] = {
            provider_id: row.provider_id,
            match_status: row.match_status ?? "in_progress",
            match_started_at: row.match_started_at,
          };
        });
      }
    }
    setCategoryAssignments(assignMap);

    setAllProjects(merged);
    setIsLoading(false);
  };

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    load();
  }, []);

  useEffect(() => {
    if (refreshKey > 0) load();
  }, [refreshKey]);

  useEffect(() => {
    if (!bidModal) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setBidModal(null); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [bidModal]);

  const openBidModal = (p: Project, category?: string) => {
    setBidModal({ project: p, category });
    const existing = myEstimates[p.id] ?? {};
    if (category) {
      setModalAmounts({ [category]: String(existing[category] ?? "") });
    } else {
      setModalAmounts(Object.fromEntries(Object.entries(existing).map(([k, v]) => [k, String(v ?? "")])));
    }
  };

  const handleSaveBid = async () => {
    if (!providerId || !bidModal) return;
    if (profileStatus !== "active") {
      setAlertMessage({
        title: "계정 비활성화",
        message: "계정이 비활성화 상태입니다.\n셀인코치에게 문의 하세요.",
        variant: "warning",
      });
      return;
    }
    const proj = bidModal.project;
    setSavingId(proj.id);
    const amountsNum: Record<string, number> = {};
    for (const [cat, val] of Object.entries(modalAmounts)) {
      const n = parseInt((val ?? "").replace(/\D/g, ""), 10);
      if (!Number.isNaN(n) && n >= 0) amountsNum[cat] = n;
    }
    const mergedAmounts = bidModal.category
      ? { ...(myEstimates[proj.id] ?? {}), ...amountsNum }
      : amountsNum;
    const { data: profile } = await supabase
      .from("profiles")
      .select("business_name")
      .eq("user_id", providerId)
      .maybeSingle();
    const payload = {
      project_id: proj.id,
      provider_id: providerId,
      amounts: mergedAmounts,
      project_snapshot: {
        title: proj.title,
        site_address1: proj.site_address1,
        site_address2: proj.site_address2,
        supply_area_m2: proj.supply_area_m2,
        exclusive_area_m2: proj.exclusive_area_m2,
        is_expanded: proj.is_expanded,
        start_date: proj.start_date,
        move_in_date: proj.move_in_date,
        work_tree: getGroupsForProvider(proj, Object.keys(mergedAmounts).filter((k) => mergedAmounts[k] != null)),
      },
      process_schedule: proj.process_schedule,
      provider_business_name: profile?.business_name ?? null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from("project_estimates")
      .upsert(payload, { onConflict: "project_id,provider_id" });
    setSavingId(null);
    if (error) {
      setAlertMessage({ message: `저장 실패: ${error.message}`, variant: "error" });
      return;
    }
    setBidModal(null);
    setAlertMessage({ message: "견적이 저장되었습니다.", variant: "info" });
    setRefreshKey((k) => k + 1);
  };

  const filteredBySearch = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allProjects;
    return allProjects.filter((p) => {
      const title = (p.title ?? "").toLowerCase();
      const addr = (p.site_address1 ?? "").toLowerCase();
      const contact = (p.contact_name ?? "").toLowerCase();
      return title.includes(q) || addr.includes(q) || contact.includes(q);
    });
  }, [allProjects, searchQuery]);

  const filteredByStatus = useMemo(() => {
    if (!providerId) return filteredBySearch;
    return filteredBySearch.filter((p) =>
      projectMatchesFilter(p, statusFilter, myEstimates, categoryAssignments, providerId, getGroupsForProvider)
    );
  }, [filteredBySearch, statusFilter, myEstimates, categoryAssignments, providerId]);

  const fmtDate = (d: string) => new Date(d).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-800">공사금액제안</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          {statusFilter === "견적대기" && "견적대기 중인 프로젝트입니다. 입찰하기를 눌러 견적을 입력하세요."}
          {statusFilter === "계약완료" && "계약이 완료된 프로젝트 목록입니다."}
          {statusFilter === "매칭실패" && "다른 업체에 매칭된 프로젝트 목록입니다."}
        </p>
      </div>

      <ProviderSearchBar
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="프로젝트명, 주소, 담당자명으로 검색"
      />

      {loadError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">{loadError}</p>
        </div>
      )}

      {filteredByStatus.length === 0 ? (
        <div className="flex items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white py-24">
          <div className="text-center">
            <svg className="mx-auto mb-3 text-gray-300" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            <p className="text-sm font-medium text-gray-400">
              {searchQuery.trim() ? "검색 결과가 없습니다." : statusFilter === "견적대기" ? "아직 견적 요청이 없습니다." : statusFilter === "계약완료" ? "계약완료된 프로젝트가 없습니다." : "매칭실패한 프로젝트가 없습니다."}
            </p>
            {!searchQuery.trim() && statusFilter === "견적대기" && myCategories.length > 0 && (
              <p className="mt-1 text-xs text-gray-300">내 전문분야({myCategories.join(", ")})와 매칭되는 프로젝트가 생기면 여기에 표시됩니다.</p>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filteredByStatus.map((p) => {
            const hasBid = !!myEstimates[p.id] && Object.keys(myEstimates[p.id]).length > 0;
            const bidCats = hasBid ? Object.keys(myEstimates[p.id] ?? {}).filter((c) => (myEstimates[p.id]?.[c] ?? 0) >= 0) : undefined;
            const allGroups = getGroupsForProvider(p, bidCats);
            const groups = allGroups.filter((g) => {
              const amt = hasBid ? (myEstimates[p.id]?.[g.cat] ?? null) : null;
              const hasBidForCat = hasBid && amt !== undefined && amt !== null;
              const catStatus = hasBidForCat ? getBidStatusByCategory(p, g.cat, providerId ?? "", true, categoryAssignments[p.id] ?? {}) : "none";
              if (statusFilter === "견적대기") return catStatus !== "계약완료" && catStatus !== "매칭실패";
              if (statusFilter === "계약완료") return catStatus === "계약완료";
              if (statusFilter === "매칭실패") return catStatus === "매칭실패";
              return true;
            });
            if (groups.length === 0) return null;
            const totalBid = hasBid ? groups.reduce((s, g) => s + (myEstimates[p.id]?.[g.cat] ?? 0), 0) : 0;

            return (
              <div key={p.id} className="flex flex-col rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100">
                  <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
                    <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                      {p.status === "estimate_waiting" ? "견적대기" : p.status === "active" ? "진행중" : p.status}
                    </span>
                    <p className="text-sm font-bold text-gray-900 line-clamp-2 leading-snug">{p.title || "제목 없음"}</p>
                  </div>
                  <span className="shrink-0 ml-2 text-[11px] text-gray-400">{fmtDate(p.created_at)}</span>
                </div>

                <div className="px-5 py-3 space-y-3">
                  <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-gray-500">
                    {p.site_address1 && (
                      <div className="flex items-center gap-1">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                        <span>{p.site_address1}</span>
                      </div>
                    )}
                    {(p.start_date || p.move_in_date) && (
                      <div className="flex items-center gap-1">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                        <span>{p.start_date ? fmtDate(p.start_date) : "—"} → {p.move_in_date ? fmtDate(p.move_in_date) : "—"}</span>
                      </div>
                    )}
                    {(p.supply_area_m2 || p.exclusive_area_m2) && (
                      <div className="flex items-center gap-1.5">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="1" /><path d="M3 9h18M9 21V9" /></svg>
                        <span>{p.supply_area_m2 ? `공급 ${formatArea(p.supply_area_m2)}` : ""}{p.supply_area_m2 && p.exclusive_area_m2 ? " / " : ""}{p.exclusive_area_m2 ? `전용 ${formatArea(p.exclusive_area_m2)}` : ""}</span>
                        {p.is_expanded != null && (
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${p.is_expanded ? "bg-indigo-50 text-indigo-600" : "bg-gray-100 text-gray-500"}`}>{p.is_expanded ? "확장" : "비확장"}</span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <p className="text-[11px] font-semibold text-gray-500">대공정별</p>
                    {groups.map((g) => {
                      const scheduleStr = formatScheduleRange(p.process_schedule, g.cat);
                      const amt = hasBid ? (myEstimates[p.id]?.[g.cat] ?? null) : null;
                      const hasBidForCat = hasBid && amt !== undefined && amt !== null;
                      const detail = p.work_details?.[g.cat] as { requirements?: string; image_urls?: string[]; subs?: string[] } | undefined;
                      const subs = g.subs ?? detail?.subs ?? [];
                      const catStatus = hasBidForCat ? getBidStatusByCategory(p, g.cat, providerId ?? "", true, categoryAssignments[p.id] ?? {}) : "none";
                      const assign = categoryAssignments[p.id]?.[g.cat];
                      const isInProgress = catStatus === "고민중";
                      const remaining72h = isInProgress && assign?.match_started_at ? format72hRemaining(assign.match_started_at) : null;
                      return (
                        <div key={g.cat} className="rounded-xl border border-gray-200 bg-gray-50/50 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-gray-800">
                              {g.cat}
                              {scheduleStr && <span className="ml-1.5 font-normal text-gray-500 text-xs">· {scheduleStr}</span>}
                            </p>
                            {hasBidForCat && (
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-indigo-600">{(amt ?? 0).toLocaleString("ko-KR")}원</span>
                                {catStatus !== "none" && (
                                  <span
                                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold
                                      ${catStatus === "매칭대기" ? "bg-blue-100 text-blue-700 animate-pulse" : ""}
                                      ${catStatus === "고민중" ? "bg-green-100 text-green-700" : ""}
                                      ${catStatus === "계약완료" ? "bg-red-100 text-red-700" : ""}
                                      ${catStatus === "매칭실패" ? "bg-orange-100 text-orange-700" : ""}
                                      ${catStatus === "거래취소" ? "bg-gray-100 text-gray-500" : ""}`}
                                  >
                                    {catStatus}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          {hasBidForCat && isInProgress && (
                            <span className="mt-1 block text-[10px] font-medium text-green-700">
                              {remaining72h ? `72시간 ${remaining72h} 남음` : "72시간 경과"}
                            </span>
                          )}
                          {subs.length > 0 && (
                            <ol className="mt-2 space-y-0.5 pl-3 text-[11px] text-gray-600">
                              {subs.map((s, si) => (
                                <li key={si}><span className="text-gray-400">{si + 1}.</span> {s}</li>
                              ))}
                            </ol>
                          )}
                          {detail?.requirements?.trim() && (
                            <div className="mt-2 rounded border border-gray-200 bg-white px-2.5 py-1.5">
                              <p className="mb-0.5 text-[10px] font-semibold text-gray-500">소비자 요구사항</p>
                              <p className="text-[11px] text-gray-700 whitespace-pre-line leading-relaxed">{detail.requirements}</p>
                            </div>
                          )}
                          {detail?.image_urls && detail.image_urls.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {detail.image_urls.map((url, i) => (
                                <button key={i} type="button" onClick={() => setLightbox({ urls: detail.image_urls!, index: i })}>
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={url} alt={`참고 ${i + 1}`} className="h-10 w-10 rounded object-cover border border-gray-200 hover:opacity-80" />
                                </button>
                              ))}
                            </div>
                          )}
                          {catStatus !== "계약완료" && catStatus !== "매칭실패" && (
                            <div className="mt-3 flex justify-end">
                              <button
                                type="button"
                                onClick={() => openBidModal(p, g.cat)}
                                className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-indigo-700"
                              >
                                {hasBidForCat ? "견적수정" : "견적내기"}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {hasBid && (
                      <div className="flex items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50/50 px-3 py-2 text-xs font-semibold">
                        <span className="text-gray-800">합계</span>
                        <span className="text-indigo-600">{totalBid.toLocaleString("ko-KR")}원</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {bidModal && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4 overflow-y-auto" onClick={() => setBidModal(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">{bidModal.project.title || "제목 없음"}{bidModal.category ? ` · ${bidModal.category}` : ""}</h3>
              <button type="button" onClick={() => setBidModal(null)} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="p-5 space-y-4">
              {getGroupsForProvider(bidModal.project, Object.keys(modalAmounts).filter((k) => modalAmounts[k]?.trim())).filter((g) => !bidModal.category || g.cat === bidModal.category).map((g) => {
                const detail = bidModal.project.work_details?.[g.cat];
                const scheduleStr = formatScheduleRange(bidModal.project.process_schedule, g.cat);
                return (
                  <div key={g.cat} className="rounded-xl border border-gray-200 p-4">
                    <p className="text-sm font-bold text-gray-900">
                      {g.cat}
                      {scheduleStr && <span className="ml-1.5 font-normal text-gray-500 text-xs">· {scheduleStr}</span>}
                    </p>
                    {g.subs.length > 0 && (
                      <ol className="mt-2 space-y-0.5 pl-4 text-xs text-gray-600">
                        {g.subs.map((s, si) => (
                          <li key={s}><span className="text-gray-400">{si + 1}.</span> {s}</li>
                        ))}
                      </ol>
                    )}
                    {detail?.requirements && (
                      <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                        <p className="mb-1 text-[10px] font-semibold text-gray-400">고객 요구사항</p>
                        <p className="text-xs text-gray-600 whitespace-pre-line">{detail.requirements}</p>
                      </div>
                    )}
                    {detail?.image_urls && detail.image_urls.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {detail.image_urls.map((url, i) => (
                          <button key={i} type="button" onClick={() => setLightbox({ urls: detail.image_urls, index: i })}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt={`참고 ${i + 1}`} className="h-12 w-12 rounded-lg object-cover border border-gray-200 hover:opacity-80" />
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="mt-3 flex items-center gap-2">
                      <label className="text-xs font-medium text-gray-600 shrink-0">금액</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="0"
                        value={formatAmountDisplay(modalAmounts[g.cat] ?? "")}
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, "");
                          setModalAmounts((prev) => ({ ...prev, [g.cat]: v }));
                        }}
                        className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <span className="text-xs font-medium text-gray-500 shrink-0">원</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="sticky bottom-0 border-t border-gray-200 bg-white px-5 py-4">
              <button
                type="button"
                disabled={savingId === bidModal.project.id || !providerId}
                onClick={handleSaveBid}
                className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {savingId === bidModal.project.id ? "저장 중..." : "견적입력완료"}
              </button>
            </div>
          </div>
        </div>
      )}

      {lightbox && <Lightbox urls={lightbox.urls} index={lightbox.index} onClose={() => setLightbox(null)} />}

      {alertMessage && (
        <AlertModal
          title={alertMessage.title}
          message={alertMessage.message}
          variant={alertMessage.variant ?? "info"}
          onClose={() => setAlertMessage(null)}
        />
      )}
    </div>
  );
}
