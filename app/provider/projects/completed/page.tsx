"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import ProviderSearchBar from "@/components/ProviderSearchBar";

type WorkTreeItem = { cat: string; subs: string[] };

type ProjectWithMeta = {
  id: string;
  title: string;
  user_id: string;
  contact_name: string | null;
  contact_phone: string | null;
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
  consumerName: string;
  consumerPhone: string;
};

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function getEarliestScheduleDate(processSchedule: Record<string, unknown> | null, catName: string): string | null {
  const raw = processSchedule?.[catName];
  if (!raw) return null;
  const ranges = Array.isArray(raw) ? raw : [raw];
  let earliest: string | null = null;
  for (const r of ranges) {
    const range = r as { start: string; end: string };
    const startPart = (range.start || "").split("T")[0];
    if (startPart && /^\d{4}-\d{2}-\d{2}$/.test(startPart)) {
      if (!earliest || startPart < earliest) earliest = startPart;
    }
  }
  return earliest;
}

function formatScheduleDate(processSchedule: Record<string, unknown> | null, catName: string): string {
  const raw = processSchedule?.[catName];
  if (!raw) return "—";
  const ranges = Array.isArray(raw) ? raw : [raw];
  if (ranges.length === 0) return "—";
  const days: string[] = [];
  const seen = new Set<string>();
  for (const r of ranges) {
    const range = r as { start: string; end: string };
    const [sy, sm, sd] = (range.start || "").split("T")[0].split("-").map(Number);
    const [ey, em, ed] = (range.end || "").split("T")[0].split("-").map(Number);
    if (isNaN(sy) || isNaN(sm) || isNaN(sd)) continue;
    const start = new Date(sy, sm - 1, sd);
    const end = new Date(ey, em - 1, ed);
    if (start > end) continue;
    for (let d = new Date(start.getTime()); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (seen.has(dateStr)) continue;
      seen.add(dateStr);
      const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      days.push(`${d.getMonth() + 1}월 ${d.getDate()}일 (${DAY_LABELS[date.getDay()]})`);
    }
  }
  return days.length > 0 ? days.join(", ") : "—";
}

function formatCompletedAt(iso: string | null): string {
  if (!iso) return "—";
  const part = iso.split("T")[0];
  const [y, m, d] = part.split("-").map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return "—";
  const date = new Date(y, m - 1, d);
  return `${y}년 ${m}월 ${d}일 (${DAY_LABELS[date.getDay()]})`;
}

function PhoneLink({ phone }: { phone: string }) {
  if (!phone || phone === "—") return <span className="text-gray-500">—</span>;
  const digits = phone.replace(/\D/g, "");
  return (
    <a
      href={`tel:${digits}`}
      className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-2.5 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-200"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6.29 6.29l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
      </svg>
      {phone}
    </a>
  );
}

export default function CompletedProjectsPage() {
  const [rows, setRows] = useState<CompletedRow[]>([]);
  const [completionsMap, setCompletionsMap] = useState<Record<string, string[]>>({});
  const [completedAtMap, setCompletedAtMap] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const load = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      if (!session) {
        window.location.href = "/login";
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (profile?.role !== "provider") {
        window.location.href = "/login";
        return;
      }

      const uid = session.user.id;

      const { data: assignData } = await supabase
        .from("project_category_assignments")
        .select("project_id, category")
        .eq("provider_id", uid)
        .eq("match_status", "completed");

      if (!assignData || assignData.length === 0) {
        setRows([]);
        setCompletionsMap({});
        setCompletedAtMap({});
        setIsLoading(false);
        return;
      }

      const projectIds = [...new Set(assignData.map((r) => r.project_id))];

      const { data: projectsData } = await supabase
        .from("projects")
        .select("id, title, user_id, contact_name, contact_phone, work_tree, work_details, process_schedule")
        .in("id", projectIds);

      const projectMap = new Map((projectsData ?? []).map((p) => [p.id, p as ProjectWithMeta]));

      const consumerIds = [...new Set((projectsData ?? []).map((p) => p.user_id).filter(Boolean))];
      const { data: profData } = await supabase
        .from("profiles")
        .select("user_id, name, phone")
        .in("user_id", consumerIds);
      const profMap = new Map((profData ?? []).map((p) => [p.user_id, { name: p.name ?? "—", phone: p.phone ?? "—" }]));

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

      const { data: compData } = await supabase
        .from("provider_work_completions")
        .select("project_id, category, completed_subs, completed_at")
        .eq("provider_id", uid);
      const compMap: Record<string, string[]> = {};
      const atMap: Record<string, string> = {};
      (compData ?? []).forEach((r) => {
        const key = `${r.project_id}-${r.category}`;
        compMap[key] = (r.completed_subs ?? []) as string[];
        if (r.completed_at) atMap[key] = r.completed_at;
      });
      setCompletionsMap(compMap);
      setCompletedAtMap(atMap);

      const result: CompletedRow[] = [];
      for (const row of assignData) {
        const project = projectMap.get(row.project_id);
        if (!project) continue;

        const key = `${row.project_id}-${row.category}`;
        const completedSubs = compMap[key] ?? [];
        const subs = getSubs(project, row.category);
        const isFullyCompleted = subs.length === 0 || completedSubs.length >= subs.length;
        if (!isFullyCompleted) continue;

        const consumerName = project.contact_name?.trim() || profMap.get(project.user_id)?.name || "—";
        const consumerPhone = project.contact_phone?.trim() || profMap.get(project.user_id)?.phone || "—";

        result.push({
          projectId: project.id,
          projectTitle: project.title || "프로젝트",
          category: row.category,
          subs,
          scheduleStr: formatScheduleDate(project.process_schedule, row.category),
          completedAt: atMap[key] ?? null,
          consumerName,
          consumerPhone,
        });
      }

      result.sort((a, b) => {
        const aDate = getEarliestScheduleDate(projectMap.get(a.projectId)?.process_schedule ?? null, a.category) ?? "9999-12-31";
        const bDate = getEarliestScheduleDate(projectMap.get(b.projectId)?.process_schedule ?? null, b.category) ?? "9999-12-31";
        const cmp = aDate.localeCompare(bDate);
        if (cmp !== 0) return cmp;
        const titleCmp = a.projectTitle.localeCompare(b.projectTitle);
        if (titleCmp !== 0) return titleCmp;
        return a.category.localeCompare(b.category);
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
        r.consumerName.toLowerCase().includes(q) ||
        r.consumerPhone.replace(/\D/g, "").includes(q.replace(/\D/g, ""))
    );
  }, [rows, search]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-800">완료 프로젝트</h1>
        <p className="mt-0.5 text-sm text-gray-500">하위공정이 모두 완료된 대공정을 검색·조회합니다.</p>
      </div>

      <ProviderSearchBar
        value={search}
        onChange={setSearch}
        placeholder="프로젝트명, 대공정, 고객성함, 전화번호 검색"
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
              {rows.length === 0 ? "완료된 프로젝트가 없습니다." : "검색 결과가 없습니다."}
            </p>
            <p className="mt-1 text-xs text-gray-300">
              {rows.length === 0 ? (
                <>
                  <Link href="/provider/projects" className="text-indigo-600 hover:underline">프로젝트 관리</Link>에서 하위공정을 완료하면 여기에 표시됩니다.
                </>
              ) : (
                "다른 검색어를 입력해 보세요."
              )}
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* 모바일: 간략 카드 */}
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm md:hidden">
            <ul className="divide-y divide-gray-100">
              {filteredRows.map((row, idx) => (
                <li key={`${row.projectId}-${row.category}-${idx}`} className="px-4 py-3">
                  <p className="font-medium text-gray-800">{row.projectTitle}</p>
                  <p className="mt-0.5 text-sm font-semibold text-indigo-600">
                    {row.category}
                    <span className="ml-1.5 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">완료</span>
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">{row.consumerName} · {formatCompletedAt(row.completedAt)}</p>
                  <div className="mt-2">
                    <PhoneLink phone={row.consumerPhone} />
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* 데스크톱: 테이블 */}
          <div className="hidden overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">프로젝트</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">대공정</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">공정일자</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">완료일자</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">고객성함</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">전화번호</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredRows.map((row, idx) => (
                    <tr key={`${row.projectId}-${row.category}-${idx}`} className="transition hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-800">{row.projectTitle}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        <span className="inline-flex items-center gap-1.5">
                          {row.category}
                          <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">완료</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{row.scheduleStr}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatCompletedAt(row.completedAt)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{row.consumerName}</td>
                      <td className="px-4 py-3">
                        <PhoneLink phone={row.consumerPhone} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
