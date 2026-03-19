"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

type WorkTreeItem = { cat: string; subs: string[] };
type WorkDetail = { requirements?: string; image_urls?: string[]; subs?: string[] };

type Project = {
  id: string;
  title: string | null;
  status: string;
  contact_name: string | null;
  site_address1: string | null;
  category: string[] | null;
  work_tree: WorkTreeItem[] | null;
  work_details: Record<string, WorkDetail> | null;
  created_at: string;
};

type Estimate = {
  project_id: string;
  provider_id: string;
  provider_business_name: string | null;
  amounts: Record<string, number>;
};

type Assignment = {
  project_id: string;
  category: string;
  provider_id: string;
  match_status: string | null;
};

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  estimate_waiting: { label: "견적대기", color: "bg-blue-50 text-blue-700" },
  active: { label: "진행중", color: "bg-green-50 text-green-700" },
};

function getWorkGroups(p: Project): WorkTreeItem[] {
  if (p.work_tree && p.work_tree.length > 0) return p.work_tree;
  if (p.work_details) {
    return Object.entries(p.work_details).map(([cat, d]) => ({
      cat,
      subs: d.subs ?? [],
    }));
  }
  if (p.category?.length) {
    return p.category.map((c) => ({ cat: c, subs: [] }));
  }
  return [];
}

function getTopBidders(estimates: Estimate[], projectId: string, category: string, limit = 5): { name: string; amount: number; providerId: string }[] {
  return estimates
    .filter((e) => e.project_id === projectId)
    .map((e) => {
      const amt = e.amounts?.[category];
      return { name: e.provider_business_name || "—", amount: typeof amt === "number" ? amt : 0, providerId: e.provider_id };
    })
    .filter((b) => b.amount > 0)
    .sort((a, b) => a.amount - b.amount)
    .slice(0, limit);
}

const STATUS_LABEL_MAP: Record<string, string> = {
  in_progress: "거래진행중",
  completed: "계약완료",
  cancelled: "거래취소",
};

function getBidderStatus(assignments: Assignment[], projectId: string, category: string, providerId: string): string | null {
  const a = assignments.find(
    (x) => x.project_id === projectId && x.category === category && x.provider_id === providerId
  );
  return a?.match_status ?? null;
}

function getCompletedProviderId(assignments: Assignment[], projectId: string, category: string): string | null {
  const a = assignments.find(
    (x) => x.project_id === projectId && x.category === category && x.match_status === "completed"
  );
  return a?.provider_id ?? null;
}

const formatMoney = (n: number) => n.toLocaleString("ko-KR");

export default function AdminBidMonitorPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    setIsLoading(true);

    let query = supabase
      .from("projects")
      .select("id, title, status, contact_name, site_address1, category, work_tree, work_details, created_at")
      .in("status", ["estimate_waiting", "active"])
      .is("scheduled_delete_at", null)
      .order("created_at", { ascending: false });

    if (appliedSearch.trim()) {
      const kw = appliedSearch.trim();
      query = query.or(
        `title.ilike.%${kw}%,contact_name.ilike.%${kw}%,site_address1.ilike.%${kw}%`
      );
    }

    const { data: projectsData, error } = await query;

    if (error) {
      console.error("프로젝트 조회 오류:", error.message);
      setProjects([]);
      setEstimates([]);
      setAssignments([]);
    } else {
      const list = projectsData ?? [];
      setProjects(list);

      if (list.length > 0) {
        const ids = list.map((p) => p.id);
        const [estRes, assignRes] = await Promise.all([
          supabase.from("project_estimates").select("project_id, provider_id, provider_business_name, amounts").in("project_id", ids),
          supabase.from("project_category_assignments").select("project_id, category, provider_id, match_status").in("project_id", ids),
        ]);
        setEstimates(estRes.data ?? []);
        setAssignments(assignRes.data ?? []);
      } else {
        setEstimates([]);
        setAssignments([]);
      }
    }
    setIsLoading(false);
  }, [appliedSearch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSearch = () => setAppliedSearch(search);

  const toggleProject = (id: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleCategory = (key: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-800">견적입찰모니터</h1>
        <p className="mt-0.5 text-sm text-gray-500">현재 진행 중인 프로젝트의 대공정·하위공정을 확인합니다.</p>
      </div>

      {/* 검색 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 gap-2">
          <input
            type="text"
            placeholder="프로젝트명 / 신청자 / 주소 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm outline-none placeholder:text-gray-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 sm:w-72 sm:flex-none"
          />
          <button
            type="button"
            onClick={handleSearch}
            className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
          >
            검색
          </button>
        </div>
        <span className="text-xs text-gray-400">전체 {projects.length}개</span>
      </div>

      {/* 프로젝트 목록 */}
      {isLoading ? (
        <div className="flex items-center justify-center rounded-2xl border border-gray-200 bg-white py-20">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white py-20 text-center text-sm text-gray-400">
          {appliedSearch ? "검색 결과가 없습니다." : "현재 진행 중인 프로젝트가 없습니다."}
        </div>
      ) : (
        <div className="space-y-4">
          {projects.map((project) => {
            const groups = getWorkGroups(project);
            const isProjectExpanded = expandedProjects.has(project.id);
            const si = STATUS_LABEL[project.status] ?? { label: project.status, color: "bg-gray-100 text-gray-600" };

            return (
              <div
                key={project.id}
                className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
              >
                {/* 프로젝트 헤더 */}
                <button
                  type="button"
                  onClick={() => toggleProject(project.id)}
                  className="flex w-full items-center justify-between gap-3 border-b border-gray-100 bg-gray-50 px-5 py-4 text-left hover:bg-gray-100"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`shrink-0 text-gray-400 transition-transform ${isProjectExpanded ? "rotate-180" : ""}`}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </span>
                    <h2 className="text-base font-bold text-gray-900">{project.title || "프로젝트"}</h2>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${si.color}`}>
                      {si.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-right">
                    <span className="text-xs text-gray-500">{project.contact_name || "—"}</span>
                    <span className="text-xs text-gray-400">{fmtDate(project.created_at)}</span>
                  </div>
                </button>

                {/* 대공정·하위공정 (접혀 있으면 미표시) */}
                {isProjectExpanded && groups.length > 0 && (
                  <div>
                    {groups.map((g) => {
                      const catKey = `${project.id}:${g.cat}`;
                      const isCatExpanded = expandedCategories.has(catKey);
                      const hasSubs = g.subs.length > 0;
                      const topBidders = getTopBidders(estimates, project.id, g.cat);

                      return (
                        <div key={g.cat} className="border-b-2 border-gray-200 last:border-b-0">
                          {/* 대공정 행 */}
                          <button
                            type="button"
                            onClick={() => hasSubs && toggleCategory(catKey)}
                            className={`flex w-full items-center justify-between gap-3 border-l-4 border-indigo-400 bg-gray-100 px-5 py-4 text-left ${hasSubs ? "hover:bg-gray-200" : "cursor-default"}`}
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className={`shrink-0 text-gray-500 transition-transform ${hasSubs ? "" : "invisible"} ${isCatExpanded ? "rotate-180" : ""}`}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="6 9 12 15 18 9" />
                                </svg>
                              </span>
                              <span className="font-bold text-gray-900">{g.cat}</span>
                              {hasSubs && (
                                <span className="text-xs text-gray-500">({g.subs.length}개)</span>
                              )}
                            </div>
                          </button>

                          {/* 하위공정 (대공정 바로 아래) */}
                          {hasSubs && isCatExpanded && (
                            <ul className="border-t border-gray-200 bg-gray-50/80 px-5 py-2.5 pl-12">
                              {g.subs.map((sub) => (
                                <li key={sub} className="py-1.5 text-sm text-gray-600">
                                  <span className="mr-2 text-gray-400">·</span>
                                  {sub}
                                </li>
                              ))}
                            </ul>
                          )}

                          {/* 입찰 업체 1~5위 */}
                          {topBidders.length > 0 && (
                            <div className="border-t border-gray-200 bg-white px-5 py-2.5 pl-11">
                              <ul className="space-y-1.5 text-sm">
                                {topBidders.map((b, i) => {
                                  const status = getBidderStatus(assignments, project.id, g.cat, b.providerId);
                                  const statusText = status ? STATUS_LABEL_MAP[status] ?? status : "입찰중";
                                  const completedProviderId = getCompletedProviderId(assignments, project.id, g.cat);
                                  const strikeThrough = completedProviderId != null && b.providerId !== completedProviderId;
                                  return (
                                    <li key={i} className="flex items-center justify-between gap-4">
                                      <span className="flex items-center gap-2">
                                        <span className="w-5 shrink-0 rounded bg-gray-200 px-1 text-center text-xs font-medium text-gray-600">{i + 1}</span>
                                        <span className={strikeThrough ? "line-through text-gray-400" : "text-gray-700"}>{b.name}</span>
                                        <span className="inline-flex items-center justify-center rounded-full border border-gray-300 bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                                          {statusText}
                                        </span>
                                      </span>
                                      <span className="shrink-0 font-medium text-gray-800">₩{formatMoney(b.amount)}</span>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {isProjectExpanded && groups.length === 0 && (
                  <div className="px-5 py-4 text-sm text-gray-400">등록된 공정이 없습니다.</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
