"use client";

import { useEffect, useState, useRef, useMemo } from "react";
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

type ScheduleDay = { dateStr: string; label: string; labelShort: string };

type CompletedRow = {
  projectId: string;
  projectTitle: string;
  category: string;
  subs: string[];
  scheduleDays: ScheduleDay[];
  scheduleStr: string;
  consumerName: string;
  consumerPhone: string;
  consumerId: string;
};

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

const fmtDate = (s: string) => {
  const part = (typeof s === "string" ? s : "").split("T")[0];
  const [y, m, d] = part.split("-").map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return "?";
  const date = new Date(y, m - 1, d);
  return `${y}년 ${m}월 ${d}일 (${DAY_LABELS[date.getDay()]})`;
};

const fmtDateShort = (s: string) => {
  const part = (typeof s === "string" ? s : "").split("T")[0];
  const [y, m, d] = part.split("-").map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return "?";
  const date = new Date(y, m - 1, d);
  return `${m}월 ${d}일 (${DAY_LABELS[date.getDay()]})`;
};

function getScheduleDays(processSchedule: Record<string, unknown> | null, catName: string): ScheduleDay[] {
  const raw = processSchedule?.[catName];
  if (!raw) return [];
  const ranges = Array.isArray(raw) ? raw : [raw];
  const seen = new Set<string>();
  const days: ScheduleDay[] = [];
  for (const r of ranges) {
    const range = r as { start: string; end: string };
    const startPart = (range.start || "").split("T")[0];
    const endPart = (range.end || "").split("T")[0];
    const [sy, sm, sd] = startPart.split("-").map(Number);
    const [ey, em, ed] = endPart.split("-").map(Number);
    if (isNaN(sy) || isNaN(sm) || isNaN(sd)) continue;
    const start = new Date(sy, sm - 1, sd);
    const end = new Date(ey, em - 1, ed);
    if (start > end) continue;
    for (let d = new Date(start.getTime()); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (seen.has(dateStr)) continue;
      seen.add(dateStr);
      days.push({ dateStr, label: fmtDate(dateStr), labelShort: fmtDateShort(dateStr) });
    }
  }
  return days;
}

function formatScheduleDate(processSchedule: Record<string, unknown> | null, catName: string): string {
  const days = getScheduleDays(processSchedule, catName);
  if (days.length === 0) return "—";
  return days.map((d) => d.label).join(", ");
}

function getDayContainingToday(days: ScheduleDay[]): number {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const idx = days.findIndex((d) => d.dateStr === todayStr);
  return idx >= 0 ? idx : 0;
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

export default function ProviderProjectsPage() {
  const [rows, setRows] = useState<CompletedRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modalRow, setModalRow] = useState<CompletedRow | null>(null);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [checkedSubs, setCheckedSubs] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [completionsMap, setCompletionsMap] = useState<Record<string, string[]>>({});
  const [searchQuery, setSearchQuery] = useState("");
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

      const result: CompletedRow[] = [];
      for (const row of assignData) {
        const project = projectMap.get(row.project_id);
        if (!project) continue;

        const consumerName = project.contact_name?.trim() || profMap.get(project.user_id)?.name || "—";
        const consumerPhone = project.contact_phone?.trim() || profMap.get(project.user_id)?.phone || "—";
        const scheduleDays = getScheduleDays(project.process_schedule, row.category);
        const scheduleStr = formatScheduleDate(project.process_schedule, row.category);
        const subs = getSubs(project, row.category);

        result.push({
          projectId: project.id,
          projectTitle: project.title || "프로젝트",
          category: row.category,
          subs,
          scheduleDays,
          scheduleStr,
          consumerName,
          consumerPhone,
          consumerId: project.user_id || "",
        });
      }

      result.sort((a, b) => {
        const aDate = a.scheduleDays[0]?.dateStr ?? "9999-12-31";
        const bDate = b.scheduleDays[0]?.dateStr ?? "9999-12-31";
        const cmp = aDate.localeCompare(bDate);
        if (cmp !== 0) return cmp;
        const titleCmp = a.projectTitle.localeCompare(b.projectTitle);
        if (titleCmp !== 0) return titleCmp;
        return a.category.localeCompare(b.category);
      });

      const { data: compData } = await supabase
        .from("provider_work_completions")
        .select("project_id, category, completed_subs")
        .eq("provider_id", uid);
      const compMap: Record<string, string[]> = {};
      (compData ?? []).forEach((r) => {
        const key = `${r.project_id}-${r.category}`;
        compMap[key] = (r.completed_subs ?? []) as string[];
      });
      setCompletionsMap(compMap);

      const filtered = result.filter((r) => {
        const completed = compMap[`${r.projectId}-${r.category}`] ?? [];
        const isFullyCompleted = r.subs.length > 0 && completed.length >= r.subs.length;
        return !isFullyCompleted;
      });
      setRows(filtered);
      setIsLoading(false);
    };

    load();
  }, []);

  const openModal = (row: CompletedRow) => {
    setModalRow(row);
    setSaveError(null);
    const todayIdx = row.scheduleDays.length > 0 ? getDayContainingToday(row.scheduleDays) : 0;
    setSelectedDayIndex(todayIdx);
    const key = `${row.projectId}-${row.category}`;
    const existing = completionsMap[key] ?? [];
    setCheckedSubs(new Set(existing));
  };

  const toggleSub = (sub: string) => {
    setCheckedSubs((prev) => {
      const next = new Set(prev);
      if (next.has(sub)) next.delete(sub);
      else next.add(sub);
      return next;
    });
  };

  const handleComplete = async () => {
    if (!modalRow) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData?.session;
    if (!session) return;

    setSaveError(null);
    setIsSaving(true);
    const key = `${modalRow.projectId}-${modalRow.category}`;
    const existing = completionsMap[key] ?? [];
    const merged = [...new Set([...existing, ...Array.from(checkedSubs)])];
    const { error } = await supabase.from("provider_work_completions").upsert(
      {
        provider_id: session.user.id,
        project_id: modalRow.projectId,
        category: modalRow.category,
        completed_subs: merged,
        consumer_id: modalRow.consumerId || null,
        completed_at: new Date().toISOString(),
      },
      { onConflict: "provider_id,project_id,category" }
    );

    if (error) {
      setSaveError(error.message);
    } else {
      setCompletionsMap((prev) => ({ ...prev, [key]: merged }));
      setModalRow(null);
      const isFullyCompleted = modalRow.subs.length === 0 || merged.length >= modalRow.subs.length;
      if (isFullyCompleted) {
        setRows((prev) => prev.filter((r) => !(r.projectId === modalRow.projectId && r.category === modalRow.category)));
      }
    }
    setIsSaving(false);
  };

  useEffect(() => {
    if (!modalRow) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModalRow(null);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [modalRow]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.projectTitle.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        r.consumerName.toLowerCase().includes(q) ||
        r.consumerPhone.replace(/\D/g, "").includes(q.replace(/\D/g, ""))
    );
  }, [rows, searchQuery]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-800">프로젝트 관리</h1>
        <p className="mt-0.5 text-sm text-gray-500">하위공정이 아직 완료되지 않은 대공정을 관리하세요.</p>
      </div>

      <ProviderSearchBar
        value={searchQuery}
        onChange={setSearchQuery}
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
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
            <p className="text-sm font-medium text-gray-400">
              {rows.length === 0 ? "관리할 대공정이 없습니다." : "검색 결과가 없습니다."}
            </p>
            <p className="mt-1 text-xs text-gray-300">
              {rows.length === 0 ? "모든 대공정이 완료되었거나, 계약완료된 프로젝트가 없습니다." : "다른 검색어를 입력해 보세요."}
            </p>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">프로젝트</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">대공정</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">공정일자</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">고객성함</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">전화번호</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRows.map((row, idx) => (
                  <tr
                    key={`${row.projectId}-${row.category}-${idx}`}
                    onClick={() => openModal(row)}
                    className="cursor-pointer transition hover:bg-indigo-50"
                  >
                    <td className="px-4 py-3 text-sm font-medium text-gray-800">{row.projectTitle}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{row.category}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{row.scheduleStr}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{row.consumerName}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <PhoneLink phone={row.consumerPhone} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setModalRow(null)}>
          <div
            className="flex w-full max-w-md flex-col rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-gray-100 px-5 py-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold text-gray-800">{modalRow.projectTitle}</h3>
                  <p className="mt-0.5 text-sm font-medium text-indigo-600">{modalRow.category}</p>
                </div>
                <button type="button" onClick={() => setModalRow(null)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {modalRow.scheduleDays.length > 0 && (
                <div className="mb-4">
                  <p className="mb-2 text-xs font-semibold text-gray-600">공정일자 (오늘 포함된 날짜가 자동 선택됩니다)</p>
                  <div className="flex flex-wrap gap-2">
                    {modalRow.scheduleDays.map((day, idx) => {
                      const isToday = idx === getDayContainingToday(modalRow.scheduleDays);
                      return (
                        <label
                          key={day.dateStr}
                          className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition
                            ${selectedDayIndex === idx ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-gray-200 hover:bg-gray-50"}
                            ${isToday ? "ring-1 ring-indigo-200" : ""}`}
                        >
                          <input
                            type="radio"
                            name="scheduleDay"
                            checked={selectedDayIndex === idx}
                            onChange={() => setSelectedDayIndex(idx)}
                            className="sr-only"
                          />
                          <span>{day.labelShort}</span>
                          {isToday && <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600">오늘</span>}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-600">하위공정 완료 체크 (완료된 항목을 선택하세요)</p>
                {modalRow.subs.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const allChecked = modalRow.subs.every((s) => checkedSubs.has(s));
                      setCheckedSubs(allChecked ? new Set() : new Set(modalRow.subs));
                    }}
                    className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
                  >
                    {modalRow.subs.every((s) => checkedSubs.has(s)) ? "전체 해제" : "전체 선택"}
                  </button>
                )}
              </div>
              {modalRow.subs.length === 0 ? (
                <p className="py-4 text-center text-sm text-gray-500">하위공정이 없습니다.</p>
              ) : (
                <ul className="space-y-2">
                  {modalRow.subs.map((sub) => (
                    <li key={sub}>
                      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 px-4 py-3 transition hover:bg-gray-50 has-[:checked]:border-indigo-300 has-[:checked]:bg-indigo-50">
                        <input
                          type="checkbox"
                          checked={checkedSubs.has(sub)}
                          onChange={() => toggleSub(sub)}
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm font-medium text-gray-800">{sub}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="border-t border-gray-100 px-5 py-4">
              {saveError && (
                <p className="mb-2 text-center text-xs font-medium text-red-600">{saveError}</p>
              )}
              {modalRow.subs.length > 0 && (completionsMap[`${modalRow.projectId}-${modalRow.category}`] ?? []).length >= modalRow.subs.length && (
                <p className="mb-2 text-center text-xs font-medium text-green-600">✓ 모든 하위공정 완료</p>
              )}
              <button
                type="button"
                onClick={handleComplete}
                disabled={isSaving}
                className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
              >
                {isSaving ? "저장 중..." : "완료"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
