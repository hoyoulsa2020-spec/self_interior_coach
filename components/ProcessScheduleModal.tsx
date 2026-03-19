"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import AlertModal from "@/components/AlertModal";
import { formatArea } from "@/lib/area";

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

// 공휴일 (고정일) MM-DD
const HOLIDAYS_MMDD = new Set([
  "01-01", "03-01", "05-05", "06-06", "08-15", "10-03", "10-09", "12-25",
]);

function getCellBgClass(dateStr: string, isSelected: boolean): string {
  if (isSelected) return "bg-red-500";
  const d = parseDateStr(dateStr);
  const day = d.getDay();
  const mmdd = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (day === 0 || HOLIDAYS_MMDD.has(mmdd)) return "bg-pink-100";
  if (day === 6) return "bg-sky-100";
  return "bg-white";
}

type WorkTreeItem = { cat: string; subs: string[] };

type ProjectItem = {
  id: string;
  title: string;
  status: string;
  start_date: string | null;
  move_in_date: string | null;
  site_address1: string | null;
  site_address2: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  supply_area_m2: number | null;
  exclusive_area_m2: number | null;
  is_expanded: boolean | null;
  work_tree: WorkTreeItem[] | null;
  work_details: Record<string, { requirements?: string; image_urls?: string[]; subs?: string[] }> | null;
  category: string[] | null;
  process_schedule: Record<string, ScheduleRange | ScheduleRange[]> | null;
  created_at?: string;
};

type ScheduleRange = { start: string; end: string };
type ProcessSchedule = Record<string, ScheduleRange[]>;

function getProcessListFromProject(p: ProjectItem | null): string[] {
  if (!p) return [];
  if (p.work_tree && p.work_tree.length > 0) {
    return p.work_tree.map((g) => g.cat).filter(Boolean);
  }
  if (p.work_details && Object.keys(p.work_details).length > 0) {
    return Object.keys(p.work_details).filter(Boolean);
  }
  if (p.category && p.category.length > 0) {
    return [...new Set(p.category)].filter(Boolean);
  }
  return [];
}

// 대기중(pending)만 수정 가능. 최종발행요청 이상은 수정 불가
const EDITABLE_STATUSES = new Set(["pending"]);

type Props = {
  userId: string;
  initialProjectId?: string | null;
  viewOnly?: boolean;
  onClose: () => void;
  onSaved: () => void;
};

// YYYY-MM-DD 문자열을 로컬 날짜로 파싱 (UTC 파싱 시 타임존 오차 방지)
function parseDateStr(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Date를 YYYY-MM-DD 로컬 기준으로 포맷 (toISOString은 UTC라 타임존 오차 발생)
function formatDateToLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysToDateStr(dateStr: string, days: number): string {
  const d = parseDateStr(dateStr);
  d.setDate(d.getDate() + days);
  return formatDateToLocal(d);
}

function getDatesInRange(startDate: Date, endDate: Date): string[] {
  const out: string[] = [];
  const cur = new Date(startDate);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);
  while (cur <= end) {
    out.push(formatDateToLocal(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function getMonthLabel(dates: string[]): string {
  if (dates.length === 0) return "";
  const first = parseDateStr(dates[0]);
  const last = parseDateStr(dates[dates.length - 1]);
  const m1 = first.getMonth() + 1;
  const m2 = last.getMonth() + 1;
  if (m1 === m2) return `${m1}월`;
  return `${m1}~${m2}월`;
}

function rangesToDateSet(ranges: ScheduleRange[]): Set<string> {
  const set = new Set<string>();
  for (const r of ranges) {
    const start = parseDateStr(r.start);
    const end = parseDateStr(r.end);
    const cur = new Date(start);
    cur.setHours(0, 0, 0, 0);
    const endCopy = new Date(end);
    endCopy.setHours(23, 59, 59, 999);
    while (cur <= endCopy) {
      set.add(formatDateToLocal(cur));
      cur.setDate(cur.getDate() + 1);
    }
  }
  return set;
}

function dateSetToRanges(set: Set<string>, dates: string[]): ScheduleRange[] {
  const sorted = dates.filter((d) => set.has(d));
  if (sorted.length === 0) return [];
  const ranges: ScheduleRange[] = [];
  let start = sorted[0];
  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i];
    const next = sorted[i + 1];
    const nextExpected = addDaysToDateStr(cur, 1);
    if (!next || next !== nextExpected) {
      ranges.push({ start, end: cur });
      if (next) start = next;
    }
  }
  return ranges;
}

export default function ProcessScheduleModal({ userId, initialProjectId, viewOnly: viewOnlyProp, onClose, onSaved }: Props) {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [selectedProject, setSelectedProject] = useState<ProjectItem | null>(null);
  const [schedule, setSchedule] = useState<ProcessSchedule>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const dragRef = useRef<{ processName: string; startDateIdx: number } | null>(null);

  useEffect(() => {
    const load = async () => {
      const [pendingRes, withScheduleRes] = await Promise.all([
        supabase
          .from("projects")
          .select("id, title, status, start_date, move_in_date, site_address1, site_address2, contact_name, contact_phone, supply_area_m2, exclusive_area_m2, is_expanded, work_tree, work_details, category, process_schedule, created_at")
          .eq("user_id", userId)
          .eq("status", "pending")
          .order("created_at", { ascending: false }),
        initialProjectId
          ? supabase
              .from("projects")
              .select("id, title, status, start_date, move_in_date, site_address1, site_address2, contact_name, contact_phone, supply_area_m2, exclusive_area_m2, is_expanded, work_tree, work_details, category, process_schedule, created_at")
              .eq("id", initialProjectId)
              .eq("user_id", userId)
              .maybeSingle()
          : { data: null },
      ]);
      const pending = pendingRes.data ?? [];
      const byId = new Map<string, ProjectItem>();
      pending.forEach((p) => byId.set(p.id, p));
      if (withScheduleRes.data) {
        byId.set(withScheduleRes.data.id, withScheduleRes.data);
      }
      const merged = Array.from(byId.values()).sort(
        (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
      );
      setProjects(merged);
      if (initialProjectId && withScheduleRes.data) {
        setSelectedProject(withScheduleRes.data);
      }
      setIsLoading(false);
    };
    load();
  }, [userId, initialProjectId]);

  useEffect(() => {
    if (!selectedProject) {
      setSchedule({});
      return;
    }
    const raw = selectedProject.process_schedule ?? {};
    const list = getProcessListFromProject(selectedProject);
    if (list.length === 0) {
      setSchedule({});
      return;
    }
    const migrated: ProcessSchedule = {};
    for (const [k, v] of Object.entries(raw)) {
      const ranges = Array.isArray(v) ? v : v ? [v] : [];
      const processName = (() => {
        const num = parseInt(k, 10);
        if (!Number.isNaN(num) && list[num]) return list[num];
        if (list.includes(k)) return k;
        return null;
      })();
      if (processName && ranges.length > 0) migrated[processName] = ranges;
    }
    setSchedule(migrated);
  }, [selectedProject]);

  const dates = (() => {
    if (!selectedProject?.start_date || !selectedProject?.move_in_date) return [];
    const start = parseDateStr(selectedProject.start_date);
    const end = parseDateStr(selectedProject.move_in_date);
    end.setDate(end.getDate() + 3);
    return getDatesInRange(start, end);
  })();

  const processList = getProcessListFromProject(selectedProject);
  const viewOnly = viewOnlyProp ?? (selectedProject ? !EDITABLE_STATUSES.has(selectedProject.status) : false);

  const isCellSelected = useCallback(
    (processName: string, dateStr: string): boolean => {
      const ranges = schedule[processName];
      if (!ranges?.length) return false;
      const d = parseDateStr(dateStr).getTime();
      return ranges.some((r) => {
        const s = parseDateStr(r.start).getTime();
        const e = parseDateStr(r.end).getTime();
        return d >= s && d <= e;
      });
    },
    [schedule]
  );

  const handleCellInteraction = useCallback(
    (processName: string, dateStr: string, isDrag: boolean) => {
      const dateIdx = dates.indexOf(dateStr);
      if (dateIdx < 0) return;

      setSchedule((prev) => {
        const ranges = prev[processName] ?? [];

        if (isDrag && dragRef.current && dragRef.current.processName === processName) {
          const startIdx = Math.min(dragRef.current.startDateIdx, dateIdx);
          const endIdx = Math.max(dragRef.current.startDateIdx, dateIdx);
          const newRange: ScheduleRange = { start: dates[startIdx], end: dates[endIdx] };
          return { ...prev, [processName]: [...ranges, newRange] };
        }

        const dateSet = rangesToDateSet(ranges);
        if (dateSet.has(dateStr)) {
          dateSet.delete(dateStr);
          const newRanges = dateSetToRanges(dateSet, dates);
          if (newRanges.length === 0) {
            const { [processName]: _, ...rest } = prev;
            return rest;
          }
          return { ...prev, [processName]: newRanges };
        }

        dateSet.add(dateStr);
        const newRanges = dateSetToRanges(dateSet, dates);
        return { ...prev, [processName]: newRanges };
      });
    },
    [dates]
  );

  const handleMouseDown = (processName: string, dateStr: string) => {
    if (viewOnly) return;
    const dateIdx = dates.indexOf(dateStr);
    if (dateIdx < 0) return;
    dragRef.current = { processName, startDateIdx: dateIdx };
    handleCellInteraction(processName, dateStr, false);
  };

  const handleMouseEnter = (processName: string, dateStr: string) => {
    if (viewOnly) return;
    if (dragRef.current && dragRef.current.processName === processName) {
      handleCellInteraction(processName, dateStr, true);
    }
  };

  const handlePrint = () => {
    if (!selectedProject || processList.length === 0 || dates.length === 0) return;
    const title = selectedProject.title || "제목 없음";
    const monthLabel = getMonthLabel(dates);
    const dayLabels = ["일", "월", "화", "수", "목", "금", "토"];
    const holidaySet = new Set(["01-01", "03-01", "05-05", "06-06", "08-15", "10-03", "10-09", "12-25"]);
      const getCellClass = (dateStr: string, sel: boolean) => {
      if (sel) return "background:#ef4444";
      const d = parseDateStr(dateStr);
      const day = d.getDay();
      const mmdd = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (day === 0 || holidaySet.has(mmdd)) return "background:#fce7f3";
      if (day === 6) return "background:#e0f2fe";
      return "background:#fff";
    };
    let rows = "";
    for (let i = 0; i < processList.length; i++) {
      const pn = processList[i];
      const ranges = schedule[pn] ?? [];
      let cells = "";
      for (const d of dates) {
        const sel = ranges.some((r) => {
          const dt = parseDateStr(d).getTime();
          return dt >= parseDateStr(r.start).getTime() && dt <= parseDateStr(r.end).getTime();
        });
        cells += `<td style="border:1px solid #e5e7eb;${getCellClass(d, sel)}"></td>`;
      }
      rows += `<tr><td style="padding:2px 6px;border:1px solid #e5e7eb;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px">${i + 1}. ${pn || "(빈칸)"}</td>${cells}</tr>`;
    }
    const dateHeaders = dates.map((d) => `<th style="border:1px solid #e5e7eb;font-size:9px">${parseDateStr(d).getDate()}</th>`).join("");
    const dayHeaders = dates.map((d) => `<th style="border:1px solid #e5e7eb;font-size:8px;color:#6b7280">${dayLabels[parseDateStr(d).getDay()]}</th>`).join("");
    const colCount = dates.length;
    const rowCount = processList.length + 3;
    const scaleX = Math.min(1, 270 / (colCount * 8));
    const scaleY = Math.min(1, 175 / (rowCount * 2.5));
    const scale = Math.min(scaleX, scaleY, 1);
    const printCss = `
      @page { size: A4 landscape; margin: 4mm; }
      @media print {
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box !important; }
        html, body { margin: 0 !important; padding: 0 !important; width: 100% !important; height: 100% !important; overflow: hidden !important; }
        body { transform: scale(${scale}); transform-origin: top left; width: ${100 / scale}% !important; height: ${100 / scale}% !important; }
        #print-wrap { position: absolute !important; top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important; display: flex !important; flex-direction: column !important; padding: 3mm !important; }
        #print-wrap > div:first-child { flex-shrink: 0 !important; }
        #print-table-wrap { flex: 1 !important; min-height: 0 !important; overflow: hidden !important; }
        #print-table { width: 100% !important; height: 100% !important; table-layout: fixed !important; border-collapse: collapse !important; }
        #print-table td, #print-table th { padding: 1px 2px !important; font-size: 8px !important; border: 1px solid #999 !important; }
        #print-table thead th { background: #f9fafb !important; }
      }
    `;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>공정표 - ${title}</title><style>${printCss}</style></head><body style="margin:0;padding:0;font-family:system-ui,sans-serif">
      <div id="print-wrap" style="width:100%;height:100vh;display:flex;flex-direction:column;padding:8px">
        <div style="flex-shrink:0;margin-bottom:4px">
          <h2 style="margin:0;font-size:13px;font-weight:700">${title}</h2>
          <p style="margin:2px 0 0;font-size:10px;color:#6b7280">공사착공: ${selectedProject.start_date ? new Date(selectedProject.start_date).toLocaleDateString("ko-KR") : "—"} / 입주예정: ${selectedProject.move_in_date ? new Date(selectedProject.move_in_date).toLocaleDateString("ko-KR") : "—"}</p>
        </div>
        <div id="print-table-wrap" style="flex:1;min-height:0;overflow:auto">
          <table id="print-table" style="border-collapse:collapse;font-size:10px;width:100%;height:100%">
            <thead><tr><th rowspan="3" style="padding:2px 6px;border:1px solid #e5e7eb;background:#f9fafb;width:100px">공정</th><th colspan="${dates.length}" style="border:1px solid #e5e7eb;background:#f9fafb">${monthLabel}</th></tr>
            <tr>${dateHeaders}</tr><tr>${dayHeaders}</tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
      <script>
        (function() {
          function doPrint() {
            try {
              window.print();
            } catch (e) {}
            if (window.onafterprint !== undefined) {
              window.onafterprint = function() { window.close(); };
            } else {
              setTimeout(function() { window.close(); }, 1000);
            }
          }
          if (document.readyState === "complete") {
            setTimeout(doPrint, 150);
          } else {
            window.addEventListener("load", function() { setTimeout(doPrint, 150); });
          }
        })();
      <\/script>
    </body></html>`;
    const w = window.open("", "_blank", "noopener,noreferrer");
    if (!w) {
      setAlertMessage("팝업이 차단되었을 수 있습니다. 브라우저에서 팝업을 허용해 주세요.");
      return;
    }
    w.document.write(html);
    w.document.close();
    w.focus();
  };

  const handleMouseUp = () => {
    dragRef.current = null;
  };

  useEffect(() => {
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, []);

  const handleSave = async () => {
    if (!selectedProject) return;
    setIsSaving(true);
    await supabase
      .from("projects")
      .update({ process_schedule: schedule })
      .eq("id", selectedProject.id)
      .eq("user_id", userId);
    setIsSaving(false);
    onSaved();
    onClose();
  };

  const handleDeleteClick = () => setShowDeleteConfirm(true);

  const handleDeleteConfirm = async () => {
    if (!selectedProject) return;
    setShowDeleteConfirm(false);
    setIsSaving(true);
    await supabase
      .from("projects")
      .update({ process_schedule: null })
      .eq("id", selectedProject.id)
      .eq("user_id", userId);
    setIsSaving(false);
    onSaved();
    onClose();
  };

  const hasScheduleContent = Object.keys(schedule).length > 0;

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showDeleteConfirm) setShowDeleteConfirm(false);
        else onClose();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, showDeleteConfirm]);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 px-4 py-6" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-bold text-gray-900">{viewOnly ? "공정표 보기" : "공정표 작성"}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {isLoading ? (
            <p className="text-sm text-gray-500">로딩 중...</p>
          ) : projects.length === 0 ? (
            <p className="text-sm text-gray-500">대기중인 프로젝트가 없습니다.</p>
          ) : (
            <>
              <div className="mb-4">
                <label className="mb-1.5 block text-xs font-medium text-gray-500">프로젝트 선택</label>
                <select
                  value={selectedProject?.id ?? ""}
                  onChange={(e) => {
                    const p = projects.find((x) => x.id === e.target.value);
                    setSelectedProject(p ?? null);
                  }}
                  className="w-full max-w-md rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">프로젝트를 선택하세요</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title || "제목 없음"}
                    </option>
                  ))}
                </select>
                {selectedProject && (
                  <div className="mt-3 space-y-2 rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3 text-sm">
                    {(selectedProject.start_date || selectedProject.move_in_date) && (
                      <div className="flex flex-wrap gap-4 text-gray-600">
                        {selectedProject.start_date && (
                          <span>공사착공일자: <strong>{new Date(selectedProject.start_date).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" })}</strong></span>
                        )}
                        {selectedProject.move_in_date && (
                          <span>입주예정일: <strong>{new Date(selectedProject.move_in_date).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" })}</strong></span>
                        )}
                      </div>
                    )}
                    <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
                      {selectedProject.site_address1 && (
                        <div>
                          <span className="text-gray-500">현장주소: </span>
                          <span className="text-gray-800">{selectedProject.site_address1}</span>
                        </div>
                      )}
                      {selectedProject.site_address2 && (
                        <div>
                          <span className="text-gray-500">상세주소: </span>
                          <span className="text-gray-800">{selectedProject.site_address2}</span>
                        </div>
                      )}
                      {(selectedProject.supply_area_m2 || selectedProject.exclusive_area_m2) && (
                        <div>
                          <span className="text-gray-500">평형: </span>
                          <span className="text-gray-800">
                            {selectedProject.supply_area_m2 ? `공급 ${formatArea(selectedProject.supply_area_m2)}` : ""}
                            {selectedProject.supply_area_m2 && selectedProject.exclusive_area_m2 ? " / " : ""}
                            {selectedProject.exclusive_area_m2 ? `전용 ${formatArea(selectedProject.exclusive_area_m2)}` : ""}
                          </span>
                        </div>
                      )}
                      {selectedProject.is_expanded != null && (
                        <div>
                          <span className="text-gray-500">확장여부: </span>
                          <span className="text-gray-800">{selectedProject.is_expanded ? "확장" : "비확장"}</span>
                        </div>
                      )}
                      {selectedProject.contact_name && (
                        <div>
                          <span className="text-gray-500">고객성함: </span>
                          <span className="text-gray-800">{selectedProject.contact_name}</span>
                        </div>
                      )}
                      {selectedProject.contact_phone && (
                        <div>
                          <span className="text-gray-500">연락처: </span>
                          <span className="text-gray-800">{selectedProject.contact_phone}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {selectedProject && processList.length === 0 && dates.length > 0 && (
                <p className="mb-4 text-sm text-amber-600">선택한 프로젝트에 등록된 대공정이 없습니다. 프로젝트 수정에서 공사 항목을 먼저 등록해 주세요.</p>
              )}
              {selectedProject && processList.length > 0 && dates.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-gray-200 select-none">
                  <table className="w-full min-w-[600px] border-collapse text-xs">
                    <thead>
                      <tr>
                        <th className="w-40 border-b border-r border-gray-200 bg-gray-50 p-2 text-left font-medium text-gray-600" rowSpan={3}>
                          공정
                        </th>
                        <th className="border-b border-gray-200 bg-gray-50 p-1 text-center font-medium text-gray-600" colSpan={dates.length}>
                          {getMonthLabel(dates)}
                        </th>
                      </tr>
                      <tr>
                        {dates.map((d) => {
                          const pd = parseDateStr(d);
                          const day = pd.getDay();
                          const mmdd = `${String(pd.getMonth() + 1).padStart(2, "0")}-${String(pd.getDate()).padStart(2, "0")}`;
                          const isSat = day === 6;
                          const isSunOrHoliday = day === 0 || HOLIDAYS_MMDD.has(mmdd);
                          const headerBg = isSunOrHoliday ? "bg-pink-100" : isSat ? "bg-sky-100" : "bg-gray-50";
                          return (
                            <th key={d} className={`w-7 border-b border-gray-200 ${headerBg} p-0.5 text-center font-medium text-gray-500`}>
                              {pd.getDate()}
                            </th>
                          );
                        })}
                      </tr>
                      <tr>
                        {dates.map((d) => {
                          const pd = parseDateStr(d);
                          const day = pd.getDay();
                          const mmdd = `${String(pd.getMonth() + 1).padStart(2, "0")}-${String(pd.getDate()).padStart(2, "0")}`;
                          const isSat = day === 6;
                          const isSunOrHoliday = day === 0 || HOLIDAYS_MMDD.has(mmdd);
                          const headerBg = isSunOrHoliday ? "bg-pink-100" : isSat ? "bg-sky-100" : "bg-gray-50";
                          return (
                            <th key={d} className={`w-7 border-b border-gray-200 ${headerBg} p-0.5 text-center text-[10px] text-gray-400`}>
                              {DAY_LABELS[day]}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {processList.map((processName, idx) => (
                        <tr key={processName || idx} className="border-b border-gray-100 last:border-b-0">
                          <td className="border-r border-gray-200 bg-gray-50/50 p-2 text-gray-700">
                            {idx + 1}. {processName || "(빈칸)"}
                          </td>
                          {dates.map((dateStr) => {
                            const selected = isCellSelected(processName, dateStr);
                            return (
                              <td
                                key={dateStr}
                                className={`h-6 w-7 border-r border-gray-100 p-0 last:border-r-0 ${viewOnly ? "cursor-default" : "cursor-cell"}`}
                                onMouseDown={() => handleMouseDown(processName, dateStr)}
                                onMouseEnter={() => handleMouseEnter(processName, dateStr)}
                              >
                                <div
                                  className={`h-full w-full transition ${getCellBgClass(dateStr, selected)} ${!viewOnly && !selected ? "hover:bg-red-100" : ""}`}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {selectedProject && dates.length === 0 && (
                <p className="text-sm text-amber-600">선택한 프로젝트에 공사착공일자와 입주예정일을 먼저 입력해 주세요.</p>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-4">
          {selectedProject && processList.length > 0 && dates.length > 0 && (
            <button
              type="button"
              onClick={handlePrint}
              className="hidden md:inline-block rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              프린트
            </button>
          )}
          {!viewOnly && hasScheduleContent && (
            <button
              type="button"
              onClick={handleDeleteClick}
              disabled={isSaving}
              className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              삭제하기
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            {viewOnly ? "닫기" : "취소"}
          </button>
          {!viewOnly && (
            <button
              type="button"
              onClick={handleSave}
              disabled={!selectedProject || dates.length === 0 || processList.length === 0 || isSaving}
              className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSaving ? "저장 중..." : "저장"}
            </button>
          )}
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-black/40" onClick={() => setShowDeleteConfirm(false)}>
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-600">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </div>
            <h3 className="mt-4 text-base font-bold text-gray-900">공정표 삭제</h3>
            <p className="mt-2 text-sm text-gray-600">공정표를 삭제하시겠습니까? 삭제 후 다시 작성할 수 있습니다.</p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
      {alertMessage && (
        <AlertModal
          title="알림"
          message={alertMessage}
          variant="warning"
          onClose={() => setAlertMessage(null)}
        />
      )}
    </div>
  );
}
