"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import ProviderSearchBar from "@/components/ProviderSearchBar";

type WorkTreeItem = { cat: string; subs: string[] };

type ProjectWithMeta = {
  id: string;
  title: string;
  work_tree: WorkTreeItem[] | null;
  work_details: Record<string, { subs?: string[] }> | null;
  process_schedule: Record<string, unknown> | null;
};

type CompletedRow = {
  projectId: string;
  projectTitle: string;
  category: string;
  subs: string[];
  scheduleStr: string;
  completedAt: string | null;
  providerId: string;
  providerBusinessName: string;
  providerPhone: string | null;
};

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function formatScheduleDate(processSchedule: Record<string, unknown> | null, catName: string): string {
  const raw = processSchedule?.[catName];
  if (!raw) return "—";
  const ranges = Array.isArray(raw) ? raw : [raw];
  if (ranges.length === 0) return "—";
  const r = ranges[ranges.length - 1] as { start: string; end: string };
  const fmt = (s: string) => {
    const part = (typeof s === "string" ? s : "").split("T")[0];
    const [y, m, d] = part.split("-").map(Number);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return "?";
    const date = new Date(y, m - 1, d);
    return `${y}년 ${m}월 ${d}일 (${DAY_LABELS[date.getDay()]})`;
  };
  return `${fmt(r.start)} ~ ${fmt(r.end)}`;
}

function formatCompletedAt(iso: string | null): string {
  if (!iso) return "—";
  const part = iso.split("T")[0];
  const [y, m, d] = part.split("-").map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return "—";
  const date = new Date(y, m - 1, d);
  return `${y}년 ${m}월 ${d}일 (${DAY_LABELS[date.getDay()]})`;
}

function PhoneLink({ phone }: { phone: string | null }) {
  if (!phone) return <span className="text-gray-700">—</span>;
  const digits = phone.replace(/\D/g, "");
  return (
    <a
      href={`tel:${digits}`}
      className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-2.5 py-1 text-sm font-medium text-gray-700 transition hover:bg-gray-200"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6.29 6.29l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
      </svg>
      {phone}
    </a>
  );
}

export default function CompletedWorkPage() {
  const [rows, setRows] = useState<CompletedRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const initializedRef = useRef(false);

  const toggleProject = (id: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const load = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      if (!session) {
        setIsLoading(false);
        return;
      }
      const uid = session.user.id;

      const { data: projectsData } = await supabase
        .from("projects")
        .select("id, title, work_tree, work_details, process_schedule")
        .eq("user_id", uid);
      const projectIds = (projectsData ?? []).map((p) => p.id);
      const projectMap = new Map((projectsData ?? []).map((p) => [p.id, p as ProjectWithMeta]));

      if (projectIds.length === 0) {
        setRows([]);
        setIsLoading(false);
        return;
      }

      const { data: assignData } = await supabase
        .from("project_category_assignments")
        .select("project_id, category, provider_id")
        .in("project_id", projectIds)
        .eq("match_status", "completed");

      if (!assignData || assignData.length === 0) {
        setRows([]);
        setIsLoading(false);
        return;
      }

      const { data: compData } = await supabase
        .from("provider_work_completions")
        .select("project_id, category, completed_subs, completed_at")
        .in("project_id", projectIds);

      const compMap: Record<string, string[]> = {};
      const atMap: Record<string, string> = {};
      (compData ?? []).forEach((r) => {
        const key = `${r.project_id}-${r.category}`;
        compMap[key] = (r.completed_subs ?? []) as string[];
        if (r.completed_at) atMap[key] = r.completed_at;
      });

      const providerIds = [...new Set(assignData.map((r) => r.provider_id))];

      const { data: profData } = await supabase
        .from("profiles")
        .select("user_id, business_name, phone")
        .in("user_id", providerIds);
      const profMap = new Map((profData ?? []).map((p) => [p.user_id, { business_name: p.business_name ?? "업체", phone: p.phone ?? null }]));

      const getSubs = (project: ProjectWithMeta, catName: string): string[] => {
        const tree = project.work_tree ?? [];
        if (tree.length > 0) {
          const found = tree.find((g) => g.cat === catName);
          return found?.subs ?? [];
        }
        if (project.work_details) {
          const detail = project.work_details[catName] as { subs?: string[] } | undefined;
          return detail?.subs ?? [];
        }
        return [];
      };

      const result: CompletedRow[] = [];
      for (const row of assignData) {
        const project = projectMap.get(row.project_id);
        if (!project) continue;

        const key = `${row.project_id}-${row.category}`;
        const completedSubs = compMap[key] ?? [];
        const subs = getSubs(project, row.category);
        const isFullyCompleted = subs.length === 0 || completedSubs.length >= subs.length;
        if (!isFullyCompleted) continue;

        const prof = profMap.get(row.provider_id);
        result.push({
          projectId: project.id,
          projectTitle: project.title || "프로젝트",
          category: row.category,
          subs,
          scheduleStr: formatScheduleDate(project.process_schedule, row.category),
          completedAt: atMap[key] ?? null,
          providerId: row.provider_id,
          providerBusinessName: prof?.business_name ?? "업체",
          providerPhone: prof?.phone ?? null,
        });
      }

      result.sort((a, b) => {
        const catCmp = a.category.localeCompare(b.category);
        if (catCmp !== 0) return catCmp;
        const titleCmp = a.projectTitle.localeCompare(b.projectTitle);
        if (titleCmp !== 0) return titleCmp;
        return (a.completedAt ?? "").localeCompare(b.completedAt ?? "");
      });

      setRows(result);
      setIsLoading(false);
    };

    load();
  }, []);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.projectTitle.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        r.providerBusinessName.toLowerCase().includes(q) ||
        (r.providerPhone ?? "").replace(/\D/g, "").includes(q.replace(/\D/g, ""))
    );
  }, [rows, search]);

  const byProject = useMemo(() => {
    const map = new Map<string, { title: string; rows: CompletedRow[] }>();
    filteredRows.forEach((r) => {
      if (!map.has(r.projectId)) map.set(r.projectId, { title: r.projectTitle, rows: [] });
      map.get(r.projectId)!.rows.push(r);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].title.localeCompare(b[1].title));
  }, [filteredRows]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-800">완료된 공정</h1>
        <p className="mt-0.5 text-sm text-gray-500">하위공정이 모두 완료된 대공정을 대공정별로 확인하세요.</p>
      </div>

      <ProviderSearchBar
        value={search}
        onChange={setSearch}
        placeholder="프로젝트명, 대공정, 업체명, 전화번호 검색"
      />

      {isLoading ? (
        <div className="flex items-center justify-center rounded-2xl border border-gray-200 bg-white py-20">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="flex items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white py-24">
          <div className="text-center">
            <svg className="mx-auto mb-3 text-gray-300" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm font-medium text-gray-400">
              {rows.length === 0 ? "완료된 공정이 없습니다." : "검색 결과가 없습니다."}
            </p>
            <p className="mt-1 text-xs text-gray-300">
              {rows.length === 0
                ? "시공업체가 하위공정 완료를 등록하면 여기에 표시됩니다."
                : "다른 검색어를 입력해 보세요."}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {byProject.map(([projectId, { title, rows: projectRows }]) => {
            const isExpanded = expandedProjects.has(projectId);
            return (
              <div key={projectId} className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleProject(projectId)}
                  className="flex w-full items-center justify-between gap-3 border-b border-gray-100 bg-gray-50 px-5 py-4 text-left hover:bg-gray-100"
                >
                  <div className="flex items-center gap-2">
                    <span className={`shrink-0 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </span>
                    <h2 className="text-base font-bold text-gray-900">{title}</h2>
                  </div>
                  <span className="text-xs text-gray-500">{projectRows.length}건 완료</span>
                </button>
                {isExpanded && (
                <div className="divide-y divide-gray-100">
                  {projectRows.map((row, idx) => (
                    <div key={`${row.projectId}-${row.category}-${idx}`} className="px-5 py-4">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-gray-800">{row.category}</p>
                        <div className="mt-2 space-y-1 text-sm">
                          <p><span className="text-gray-500">시공업체:</span> <span className="font-medium text-gray-700">{row.providerBusinessName}</span></p>
                          <p className="flex items-center gap-2"><span className="text-gray-500 shrink-0">연락처:</span> <PhoneLink phone={row.providerPhone} /></p>
                          <p><span className="text-gray-500">공정일자:</span> <span className="text-gray-700">{row.scheduleStr}</span></p>
                          <p><span className="text-gray-500">완료일자:</span> <span className="text-gray-700">{formatCompletedAt(row.completedAt)}</span></p>
                        </div>
                        {row.subs.length > 0 && (
                          <ul className="mt-2 space-y-0.5 text-xs text-gray-600">
                            {row.subs.map((sub) => (
                              <li key={sub} className="flex items-center gap-1.5">
                                <span className="text-green-500">✓</span>
                                {sub}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
