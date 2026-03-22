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
  contact_email: string | null;
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

/** 인쇄용 HTML 이스케이프 */
function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const PROJECT_STATUS_PRINT: Record<string, string> = {
  active: "진행중",
  pending: "대기중",
  publish_requested: "최종발행요청",
  estimate_waiting: "견적대기",
  completed: "완료",
  cancelled: "취소",
};

function buildWorkTreePrintHtml(p: ProjectItem): string {
  const groups = p.work_tree;
  if (groups && groups.length > 0) {
    return groups
      .map((grp) => {
        const name = escapeHtml(grp.cat);
        const subs = (grp.subs ?? []).filter(Boolean);
        if (subs.length === 0) return `<div class="wt-line"><strong>${name}</strong></div>`;
        return `<div class="wt-line"><strong>${name}</strong><span class="wt-subs"> — ${subs.map(escapeHtml).join(" · ")}</span></div>`;
      })
      .join("");
  }
  if (p.work_details && Object.keys(p.work_details).length > 0) {
    return Object.keys(p.work_details)
      .map((cat) => {
        const wd = p.work_details![cat];
        const subs = (wd?.subs ?? []).filter(Boolean);
        const name = escapeHtml(cat);
        if (subs.length === 0) return `<div class="wt-line"><strong>${name}</strong></div>`;
        return `<div class="wt-line"><strong>${name}</strong><span class="wt-subs"> — ${subs.map(escapeHtml).join(" · ")}</span></div>`;
      })
      .join("");
  }
  if (p.category && p.category.length > 0) {
    return [...new Set(p.category)]
      .filter(Boolean)
      .map((c) => `<div class="wt-line">${escapeHtml(c)}</div>`)
      .join("");
  }
  return "—";
}

function buildWorkDetailsRequirementsHtml(p: ProjectItem): string {
  if (!p.work_details) return "";
  const parts: string[] = [];
  for (const [cat, wd] of Object.entries(p.work_details)) {
    const req = (wd?.requirements ?? "").trim();
    if (req) parts.push(`<div class="req-line"><span class="req-cat">${escapeHtml(cat)}</span> ${escapeHtml(req)}</div>`);
  }
  return parts.length ? parts.join("") : "";
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
          .select("id, title, status, start_date, move_in_date, site_address1, site_address2, contact_name, contact_phone, contact_email, supply_area_m2, exclusive_area_m2, is_expanded, work_tree, work_details, category, process_schedule, created_at")
          .eq("user_id", userId)
          .eq("status", "pending")
          .order("created_at", { ascending: false }),
        initialProjectId
          ? supabase
              .from("projects")
              .select("id, title, status, start_date, move_in_date, site_address1, site_address2, contact_name, contact_phone, contact_email, supply_area_m2, exclusive_area_m2, is_expanded, work_tree, work_details, category, process_schedule, created_at")
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
  const hasHorizontalScheduleScroll = processList.length > 0 && dates.length > 0;

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
    const p = selectedProject;
    const title = escapeHtml(p.title || "제목 없음");
    const monthLabel = escapeHtml(getMonthLabel(dates));
    const dayLabels = ["일", "월", "화", "수", "목", "금", "토"];
    const holidaySet = new Set(["01-01", "03-01", "05-05", "06-06", "08-15", "10-03", "10-09", "12-25"]);
    const colCount = dates.length;
    /** A4 가로 폭 활용: 여백 최소화에 맞춰 글자 크기 */
    const dateCellPx = Math.max(5, Math.min(12, Math.floor(268 / Math.max(colCount, 1))));
    const labelCellPx = Math.min(12, dateCellPx + 1);
    const getCellStyle = (dateStr: string, sel: boolean) => {
      if (sel) return "background:#ef4444 !important;";
      const d = parseDateStr(dateStr);
      const day = d.getDay();
      const mmdd = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (day === 0 || holidaySet.has(mmdd)) return "background:#fce7f3 !important;";
      if (day === 6) return "background:#e0f2fe !important;";
      return "background:#fff !important;";
    };

    const fmtLong = (d: string | null) =>
      !d ? "—" : new Date(d).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
    const createdStr = p.created_at ? new Date(p.created_at).toLocaleString("ko-KR") : "—";
    const statusLabel = escapeHtml(PROJECT_STATUS_PRINT[p.status] ?? p.status);
    const metaAddr = escapeHtml([p.site_address1, p.site_address2].filter(Boolean).join(" ").trim() || "—");
    const metaContact = escapeHtml([p.contact_name, p.contact_phone, p.contact_email].filter(Boolean).join(" · ") || "—");
    const areaParts: string[] = [];
    if (p.supply_area_m2 != null) areaParts.push(`공급 ${formatArea(p.supply_area_m2)}`);
    if (p.exclusive_area_m2 != null) areaParts.push(`전용 ${formatArea(p.exclusive_area_m2)}`);
    const areaStr = escapeHtml(areaParts.length ? areaParts.join(" / ") : "—");
    const expStr = p.is_expanded == null ? "—" : p.is_expanded ? "확장" : "비확장";
    const workTreeHtml = buildWorkTreePrintHtml(p);
    const reqHtml = buildWorkDetailsRequirementsHtml(p);
    const reqSection = reqHtml
      ? `<div class="print-section"><div class="print-sec-title">공사 요구사항 (항목별 입력)</div><div class="req-block">${reqHtml}</div></div>`
      : "";

    const nProc = Math.max(processList.length, 1);
    /** 상단 메타·범례를 뺀 나머지 높이를 공정 행 수로 나눔 → 세로로 꽉 차게 */
    const rowMinH = `calc((100vh - 380px) / ${nProc})`;

    let rows = "";
    for (let i = 0; i < processList.length; i++) {
      const pn = processList[i];
      const label = escapeHtml(`${i + 1}. ${pn || "(빈칸)"}`);
      const ranges = schedule[pn] ?? [];
      let cells = "";
      for (const d of dates) {
        const sel = ranges.some((r) => {
          const dt = parseDateStr(d).getTime();
          return dt >= parseDateStr(r.start).getTime() && dt <= parseDateStr(r.end).getTime();
        });
        cells += `<td style="border:1px solid #9ca3af;${getCellStyle(d, sel)}padding:2px 1px;min-width:0;vertical-align:middle"></td>`;
      }
      rows += `<tr style="min-height:${rowMinH}"><td style="padding:4px 5px;border:1px solid #9ca3af;font-size:${labelCellPx}px;font-weight:600;vertical-align:middle;word-break:break-word;line-height:1.2;background:#f9fafb">${label}</td>${cells}</tr>`;
    }
    const dateHeaders = dates
      .map((d) => `<th style="border:1px solid #9ca3af;background:#f3f4f6;font-size:${dateCellPx}px;padding:2px 1px;line-height:1.1">${parseDateStr(d).getDate()}</th>`)
      .join("");
    const dayHeaders = dates
      .map(
        (d) =>
          `<th style="border:1px solid #9ca3af;background:#f3f4f6;font-size:${Math.max(5, dateCellPx - 1)}px;color:#4b5563;padding:1px">${dayLabels[parseDateStr(d).getDay()]}</th>`
      )
      .join("");
    const colgroup = `<colgroup><col style="width:12%" />${dates.map(() => `<col style="width:${88 / colCount}%" />`).join("")}</colgroup>`;

    const printCss = `
      @page { size: A4 landscape; margin: 4mm; }
      html, body {
        margin: 0;
        padding: 0;
        height: 100%;
        background: #fff !important;
        font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      }
      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        box-sizing: border-box !important;
      }
      #print-wrap {
        width: 100%;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        padding: 0;
      }
      #print-head {
        flex: 0 0 auto;
        margin-bottom: 4px;
        page-break-after: avoid;
      }
      #print-head-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 10px;
      }
      #print-head-text { flex: 1; min-width: 0; }
      #print-seal { flex-shrink: 0; }
      #print-head h1 { margin: 0; font-size: 15px; font-weight: 800; color: #0f172a; letter-spacing: -0.02em; }
      #print-head .sub { margin: 2px 0 0; font-size: 9px; color: #64748b; }
      #print-meta {
        flex: 0 0 auto;
        page-break-after: avoid;
        margin-bottom: 4px;
        font-size: 8px;
        line-height: 1.35;
        color: #111;
      }
      .meta-grid { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 3px; }
      .meta-grid th {
        width: 11%;
        text-align: left;
        padding: 2px 4px;
        background: #e5e7eb;
        border: 1px solid #6b7280;
        font-weight: 700;
        vertical-align: top;
        color: #0f172a;
      }
      .meta-grid td {
        padding: 2px 5px;
        border: 1px solid #6b7280;
        word-break: break-word;
        vertical-align: top;
        background: #fff;
      }
      .print-section {
        margin-top: 3px;
        border: 1px solid #6b7280;
        padding: 4px 6px;
        background: #fafafa;
      }
      .print-sec-title { font-weight: 800; font-size: 8px; margin-bottom: 3px; color: #0f172a; }
      .wt-block .wt-line { font-size: 8px; margin-bottom: 2px; }
      .wt-subs { font-weight: 400; color: #374151; }
      .req-block { font-size: 7px; color: #1e293b; }
      .req-line { margin-bottom: 3px; word-break: break-word; }
      .req-cat { font-weight: 700; margin-right: 4px; color: #0f172a; }
      .print-legend { margin: 3px 0 2px; font-size: 7px; color: #475569; }
      #print-table-wrap {
        flex: 1 1 auto;
        min-height: 0;
        display: flex;
        flex-direction: column;
      }
      #print-table {
        width: 100%;
        flex: 1 1 auto;
        border-collapse: collapse;
        table-layout: fixed;
        font-size: ${dateCellPx}px;
      }
      #print-table thead { display: table-header-group; }
      #print-table tbody tr { page-break-inside: avoid; }
      #print-table th, #print-table td { border: 1px solid #6b7280; }
      @media print {
        body { overflow: visible !important; }
        #print-table-wrap { overflow: visible !important; }
      }
    `;

    /** 견적서(SelinSeal)와 동일 컨셉의 인쇄용 인증 도장 (인라인 스타일) */
    const printSealHtml = `
<div id="print-seal" aria-hidden="true" style="position:relative;width:76px;height:76px">
  <div style="position:absolute;inset:0;border-radius:9999px;border:3px solid rgba(99,102,241,0.9);background:linear-gradient(to bottom right,#fff,#eef2ff);transform:rotate(-8deg);box-shadow:0 6px 20px rgba(99,102,241,0.25)"></div>
  <div style="position:absolute;inset:5px;border-radius:9999px;border:1px dashed rgba(165,180,252,0.9);transform:rotate(-8deg)"></div>
  <div style="position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;width:54px;height:54px;margin:11px auto;border-radius:9999px;background:linear-gradient(to bottom,#4f46e5,#6d28d9);color:#fff;font-weight:700;text-align:center;line-height:1.05;transform:rotate(-8deg);box-shadow:inset 0 2px 8px rgba(0,0,0,0.12);border:2px solid rgba(255,255,255,0.35);font-family:system-ui,sans-serif">
    <span style="font-size:9px;letter-spacing:-0.02em">셀인코치</span>
    <span style="font-size:11px;letter-spacing:0.2em;margin-top:1px">인증</span>
    <span style="font-size:6.5px;font-weight:500;opacity:0.92;margin-top:2px">공정·견적</span>
  </div>
</div>`;

    const htmlBody = `
      <div id="print-wrap">
        <div id="print-head">
          <div id="print-head-row">
            <div id="print-head-text">
              <h1>공정표 (일정)</h1>
              <p class="sub">셀인코치 · 프로젝트 전체 정보 포함 · A4 가로</p>
            </div>
            ${printSealHtml}
          </div>
        </div>
        <div id="print-meta">
          <table class="meta-grid">
            <tbody>
              <tr>
                <th>프로젝트명</th>
                <td colspan="3">${title}</td>
              </tr>
              <tr>
                <th>상태</th>
                <td>${statusLabel}</td>
                <th>등록일시</th>
                <td>${escapeHtml(createdStr)}</td>
              </tr>
              <tr>
                <th>공사착공</th>
                <td>${escapeHtml(fmtLong(p.start_date))}</td>
                <th>입주예정</th>
                <td>${escapeHtml(fmtLong(p.move_in_date))}</td>
              </tr>
              <tr>
                <th>현장주소</th>
                <td colspan="3">${metaAddr}</td>
              </tr>
              <tr>
                <th>연락처</th>
                <td colspan="3">${metaContact}</td>
              </tr>
              <tr>
                <th>면적</th>
                <td>${areaStr}</td>
                <th>확장여부</th>
                <td>${escapeHtml(expStr)}</td>
              </tr>
            </tbody>
          </table>
          <div class="print-section">
            <div class="print-sec-title">등록된 공사 항목 (대·하위 공정)</div>
            <div class="wt-block">${workTreeHtml}</div>
          </div>
          ${reqSection}
          <p class="print-legend">■ 빨간 칸: 해당 공정 작업일 · 토: 연한 파랑 · 일·공휴일: 연한 분홍 · ${monthLabel} 달력</p>
        </div>
        <div id="print-table-wrap">
          <table id="print-table">
            ${colgroup}
            <thead>
              <tr>
                <th rowspan="3" style="padding:4px 6px;border:1px solid #6b7280;background:#e5e7eb;vertical-align:middle;font-size:${labelCellPx}px">공정</th>
                <th colspan="${dates.length}" style="border:1px solid #6b7280;background:#e5e7eb;font-size:${labelCellPx}px;padding:3px">${monthLabel}</th>
              </tr>
              <tr>${dateHeaders}</tr>
              <tr>${dayHeaders}</tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;

    const fullDoc = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>공정표 - ${title}</title><style>${printCss}</style></head><body>${htmlBody}</body></html>`;

    const iframe = document.createElement("iframe");
    iframe.setAttribute("title", "공정표 인쇄");
    iframe.setAttribute("aria-hidden", "true");
    Object.assign(iframe.style, {
      position: "fixed",
      right: "0",
      bottom: "0",
      width: "0",
      height: "0",
      border: "none",
      opacity: "0",
      pointerEvents: "none",
    });
    document.body.appendChild(iframe);

    const win = iframe.contentWindow;
    const doc = iframe.contentDocument;
    if (!win || !doc) {
      iframe.remove();
      setAlertMessage("인쇄 준비에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    doc.open();
    doc.write(fullDoc);
    doc.close();

    const cleanup = () => {
      try {
        iframe.remove();
      } catch {
        /* ignore */
      }
    };

    const runPrint = () => {
      try {
        win.focus();
        win.print();
      } catch {
        setAlertMessage("인쇄를 시작할 수 없습니다.");
        cleanup();
        return;
      }
      win.addEventListener("afterprint", cleanup, { once: true });
      setTimeout(cleanup, 3000);
    };

    if (doc.readyState === "complete") {
      setTimeout(runPrint, 100);
    } else {
      iframe.addEventListener("load", () => setTimeout(runPrint, 100), { once: true });
    }
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
        className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-2xl bg-white shadow-xl"
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
                      {selectedProject.contact_email && (
                        <div>
                          <span className="text-gray-500">이메일: </span>
                          <span className="text-gray-800">{selectedProject.contact_email}</span>
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
                <>
                  {hasHorizontalScheduleScroll && (
                    <p className="mb-2 text-xs font-medium text-gray-400">
                      좌우로 스크롤하면 전체 일정을 볼 수 있고, 대공정명은 왼쪽에 고정됩니다.
                    </p>
                  )}
                <div className="overflow-x-auto rounded-xl border border-gray-200 select-none">
                  <table className="w-full min-w-[880px] border-collapse text-xs sm:min-w-[980px]">
                    <thead>
                      <tr>
                        <th className="sticky left-0 z-20 min-w-[120px] border-b border-r border-gray-200 bg-gray-50 px-3 py-2 text-left font-semibold text-gray-700 sm:min-w-[180px]" rowSpan={3}>
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
                            <th key={d} className={`min-w-[30px] border-b border-gray-200 ${headerBg} p-0.5 text-center font-medium text-gray-500 sm:min-w-[32px]`}>
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
                            <th key={d} className={`min-w-[30px] border-b border-gray-200 ${headerBg} p-0.5 text-center text-[10px] text-gray-400 sm:min-w-[32px]`}>
                              {DAY_LABELS[day]}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {processList.map((processName, idx) => (
                        <tr key={processName || idx} className="border-b border-gray-100 last:border-b-0">
                          <td className="sticky left-0 z-10 min-w-[120px] border-r border-gray-200 bg-gray-50/95 px-3 py-2 align-middle text-gray-700 shadow-[2px_0_0_rgba(229,231,235,0.9)] sm:min-w-[180px]">
                            <div className="line-clamp-2 min-h-[2.5rem] text-[11px] font-semibold leading-snug break-words sm:text-xs">
                              {idx + 1}. {processName || "(빈칸)"}
                            </div>
                          </td>
                          {dates.map((dateStr) => {
                            const selected = isCellSelected(processName, dateStr);
                            return (
                              <td
                                key={dateStr}
                                className={`h-7 min-w-[30px] border-r border-gray-100 p-0 last:border-r-0 sm:min-w-[32px] ${viewOnly ? "cursor-default" : "cursor-cell"}`}
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
                </>
              )}

              {selectedProject && dates.length === 0 && (
                <p className="text-sm text-amber-600">선택한 프로젝트에 공사착공일자와 입주예정일을 먼저 입력해 주세요.</p>
              )}
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 px-4 py-4 sm:px-6">
          {selectedProject && processList.length > 0 && dates.length > 0 && (
            <button
              type="button"
              onClick={handlePrint}
              className="hidden rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-300/40 transition hover:opacity-95 sm:inline-flex sm:w-auto"
            >
              인쇄 / PDF 저장
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
