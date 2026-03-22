"use client";

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabaseClient";
import { pyeongToM2 } from "@/lib/area";
import AddressSearchLayer from "@/components/AddressSearchLayer";

type CategoryWithProcesses = { id: number; name: string; processes: { id: number; name: string }[] };

type ExtractedProject = {
  ready?: boolean;
  title?: string;
  site_address1?: string;
  site_address2?: string;
  supply_area_m2?: number;
  exclusive_area_m2?: number;
  start_date?: string;
  move_in_date?: string;
  work_tree?: { cat: string; subs: string[] }[];
  is_expanded?: boolean | null;
};

type ChatPhase = null | "addMoreWork" | "confirmCreate" | "askingProjectName" | "editField" | "editingField";
type EditFieldType = "site_address" | "start_date" | "move_in_date" | "exclusive_area" | "supply_area" | "is_expanded" | "work_tree";

type DraftPayload = {
  version: 1;
  extracted: ExtractedProject;
  messages: { role: "user" | "assistant"; content: string }[];
  chatPhase: ChatPhase;
  selectedWorkCategories: string[];
  savedAt: number;
};

const draftStorageKey = (uid: string) => `sellincoach_project_create_draft_v1:${uid}`;

function parseDraft(raw: string | null): DraftPayload | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as DraftPayload;
    if (d.version !== 1 || !d.extracted) return null;
    return d;
  } catch {
    return null;
  }
}

/** 입주일이 공사시작일보다 이르면 (YYYY-MM-DD 문자열 비교) */
const MOVE_IN_BEFORE_START_MSG =
  "공사일자보다 입주일자가 더 앞에 있네요? 그렇게 지정을 할순 없어요. 😓 캘린더에서 입주일을 다시 선택해 주세요.";

function toLocalDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatLocalDateKorean(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return `${year}년 ${month}월 ${day}일`;
}

function buildStartDateBeforeTodayMessage(today: string): string {
  return `오늘은 ${formatLocalDateKorean(today)}이에요. 과거로 돌아가서 공사를 진행할 수는 없어요. 공사시작일을 다시 선택해주세요.`;
}

function EditFieldInline(props: {
  field: EditFieldType;
  extracted: ExtractedProject;
  setExtracted: React.Dispatch<React.SetStateAction<ExtractedProject>>;
  categories: CategoryWithProcesses[];
  selectedWorkCategories: Set<string>;
  toggleWorkCategory: (name: string) => void;
  loading: boolean;
  onSend: (text?: string, onComplete?: () => void) => void;
  onBack: () => void;
  onDone: () => void;
  showAddressSearch: () => void;
  calendarMonth: Date;
  setCalendarMonth: React.Dispatch<React.SetStateAction<Date>>;
  getCalendarDays: (y: number, m: number) => (number | null)[];
  handleDateSelect: (day: number) => void;
  parseArea: (val: string) => number | null;
  editAddressForSite?: string;
  setEditAddressForSite?: (v: string) => void;
  editAddress2ForSite?: string;
  setEditAddress2ForSite?: (v: string) => void;
  onMoveInBeforeStart?: () => void;
  onStartDateBeforeToday?: () => void;
}) {
  const { field, extracted, setExtracted, categories, toggleWorkCategory, loading, onSend, onBack, onDone, showAddressSearch, calendarMonth, setCalendarMonth, getCalendarDays, handleDateSelect, parseArea, editAddressForSite, setEditAddressForSite, editAddress2ForSite, setEditAddress2ForSite, onMoveInBeforeStart, onStartDateBeforeToday } = props;
  const [editSupplyArea, setEditSupplyArea] = useState(String(extracted.supply_area_m2 ?? ""));
  const [editExclusiveArea, setEditExclusiveArea] = useState(String(extracted.exclusive_area_m2 ?? ""));
  const editAddress = editAddressForSite ?? "";
  const setEditAddress = setEditAddressForSite ?? (() => {});
  const editAddress2 = editAddress2ForSite ?? "";
  const setEditAddress2 = setEditAddress2ForSite ?? (() => {});

  if (field === "site_address") {
    return (
      <div>
        <p className="mb-2 text-sm text-gray-600">현장주소를 수정해주세요</p>
        <div className="mb-2 flex gap-2">
          <input type="text" readOnly value={editAddress} placeholder="주소 검색" onClick={showAddressSearch} className="flex-1 cursor-pointer rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm" />
          <button type="button" onClick={showAddressSearch} className="shrink-0 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-medium text-white">주소검색</button>
        </div>
        <input type="text" value={editAddress2} onChange={(e) => setEditAddress2(e.target.value)} placeholder="상세주소" className="mb-2 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
        <div className="flex gap-2">
          <button type="button" onClick={onBack} className="rounded-xl border border-gray-200 px-3 py-2 text-sm">뒤로</button>
          <button type="button" onClick={() => { setExtracted((p) => ({ ...p, site_address1: editAddress.trim(), site_address2: editAddress2.trim() || undefined })); onDone(); }} disabled={!editAddress.trim()} className="flex-1 rounded-xl bg-indigo-600 py-2 text-sm font-medium text-white disabled:opacity-50">적용</button>
        </div>
      </div>
    );
  }
  if (field === "start_date" || field === "move_in_date") {
    return (
      <div>
        <p className="mb-2 text-sm text-gray-600">{field === "start_date" ? "공사시작일" : "입주일자"}을 선택해주세요</p>
        <div className="mb-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => setCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-200">‹</button>
            <span className="text-sm font-semibold">{calendarMonth.getFullYear()}년 {calendarMonth.getMonth() + 1}월</span>
            <button type="button" onClick={() => setCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-200">›</button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] text-gray-500">
            {["일","월","화","수","목","금","토"].map((d) => <div key={d} className="py-1">{d}</div>)}
            {getCalendarDays(calendarMonth.getFullYear(), calendarMonth.getMonth()).map((day, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  if (!day) return;
                  const dateStr = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  if (field === "start_date" && dateStr < toLocalDateString()) {
                    onStartDateBeforeToday?.();
                    return;
                  }
                  if (field === "move_in_date" && extracted.start_date?.trim() && dateStr < extracted.start_date) {
                    onMoveInBeforeStart?.();
                    return;
                  }
                  if (field === "start_date") {
                    setExtracted((p) => ({ ...p, start_date: dateStr }));
                  } else {
                    setExtracted((p) => ({ ...p, move_in_date: dateStr }));
                  }
                  onDone();
                }}
                disabled={!day}
                className={`min-h-[28px] rounded py-0.5 text-xs ${day ? "text-gray-800 hover:bg-indigo-100" : ""}`}
              >
                {day ?? ""}
              </button>
            ))}
          </div>
        </div>
        <button type="button" onClick={onBack} className="rounded-xl border border-gray-200 px-3 py-2 text-sm">뒤로</button>
      </div>
    );
  }
  if (field === "supply_area" || field === "exclusive_area") {
    const val = field === "supply_area" ? editSupplyArea : editExclusiveArea;
    const setVal = field === "supply_area" ? setEditSupplyArea : setEditExclusiveArea;
    const key = field === "supply_area" ? "supply_area_m2" : "exclusive_area_m2";
    return (
      <div>
        <p className="mb-2 text-sm text-gray-600">{field === "supply_area" ? "공급면적" : "전용면적"}을 입력해주세요 (평 또는 ㎡)</p>
        <input type="text" value={val} onChange={(e) => setVal(e.target.value)} placeholder="예: 25평 또는 84" className="mb-2 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
        <div className="flex gap-2">
          <button type="button" onClick={onBack} className="rounded-xl border border-gray-200 px-3 py-2 text-sm">뒤로</button>
          <button type="button" onClick={() => { const m2 = parseArea(val); setExtracted((p) => ({ ...p, [key]: m2 ?? undefined })); onDone(); }} className="flex-1 rounded-xl bg-indigo-600 py-2 text-sm font-medium text-white">적용</button>
        </div>
      </div>
    );
  }
  if (field === "is_expanded") {
    return (
      <div>
        <p className="mb-2 text-sm text-gray-600">확장 여부를 선택해주세요</p>
        <div className="mb-2 flex gap-2">
          <button type="button" onClick={() => { setExtracted((p) => ({ ...p, is_expanded: true })); onDone(); }} className="flex-1 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-600">확장</button>
          <button type="button" onClick={() => { setExtracted((p) => ({ ...p, is_expanded: false })); onDone(); }} className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700">비확장</button>
          <button type="button" onClick={() => { setExtracted((p) => ({ ...p, is_expanded: null })); onDone(); }} className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-500">몰라요</button>
        </div>
        <button type="button" onClick={onBack} className="rounded-xl border border-gray-200 px-3 py-2 text-sm">뒤로</button>
      </div>
    );
  }
  if (field === "work_tree") {
    return (
      <div>
        <p className="mb-2 text-sm text-gray-600">대공정을 선택 후 전송해주세요</p>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <button key={typeof c.id === "number" ? c.id : c.name} type="button" onClick={() => toggleWorkCategory(c.name)} disabled={loading} className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${props.selectedWorkCategories.has(c.name) ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-gray-200 bg-white text-gray-700"}`}>{c.name}</button>
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onBack} className="rounded-xl border border-gray-200 px-3 py-2 text-sm">뒤로</button>
          <button type="button" onClick={() => { if (props.selectedWorkCategories.size > 0) { const text = Array.from(props.selectedWorkCategories).join(", "); onSend(text, onDone); } }} disabled={loading || props.selectedWorkCategories.size === 0} className="flex-1 rounded-xl bg-indigo-600 py-2 text-sm font-medium text-white disabled:opacity-50">전송</button>
        </div>
      </div>
    );
  }
  return <button type="button" onClick={onBack} className="rounded-xl border border-gray-200 px-3 py-2 text-sm">뒤로</button>;
}

type Props = {
  userId: string;
  userProfile: { name: string; phone: string; email: string };
  onClose: () => void;
  onCreated: (projectId?: string) => void;
};

type FormMode = "chat" | "form";

export default function ProjectCreateAIModal({ userId, userProfile, onClose, onCreated }: Props) {
  const [mode, setMode] = useState<FormMode>("chat");
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<CategoryWithProcesses[]>([]);
  const [extracted, setExtracted] = useState<ExtractedProject>({ ready: false, work_tree: [] });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddressSearch, setShowAddressSearch] = useState(false);
  const [selectedWorkCategories, setSelectedWorkCategories] = useState<Set<string>>(new Set());
  const [showCreatedConfirm, setShowCreatedConfirm] = useState(false);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [chatPhase, setChatPhase] = useState<ChatPhase>(null);
  const [editFieldType, setEditFieldType] = useState<EditFieldType | null>(null);
  const [projectNameInput, setProjectNameInput] = useState("");
  const [editAddressForSite, setEditAddressForSite] = useState("");
  const [editAddress2ForSite, setEditAddress2ForSite] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const confirmSummaryScrollRef = useRef<HTMLDivElement>(null);
  const [showConfirmScrollHint, setShowConfirmScrollHint] = useState(false);
  /** '더 추가' 루프(아니요 누르기 전)에서는 API가 ready/title로 넘기지 못하게 함 */
  const suppressReadyUntilConfirmRef = useRef(false);
  const [hasSavedDraft, setHasSavedDraft] = useState(false);

  const updateConfirmScrollHint = useCallback(() => {
    const el = confirmSummaryScrollRef.current;
    if (!el) {
      setShowConfirmScrollHint(false);
      return;
    }
    const { scrollTop, scrollHeight, clientHeight } = el;
    const hasOverflow = scrollHeight > clientHeight + 4;
    const atBottom = scrollTop + clientHeight >= scrollHeight - 12;
    setShowConfirmScrollHint(hasOverflow && !atBottom);
  }, []);

  useEffect(() => {
    if (chatPhase !== "confirmCreate") {
      setShowConfirmScrollHint(false);
      return;
    }
    const run = () => {
      window.requestAnimationFrame(() => updateConfirmScrollHint());
    };
    run();
    const t = window.setTimeout(run, 150);
    const el = confirmSummaryScrollRef.current;
    const ro = el ? new ResizeObserver(run) : null;
    if (el && ro) ro.observe(el);
    return () => {
      window.clearTimeout(t);
      ro?.disconnect();
    };
  }, [chatPhase, extracted, updateConfirmScrollHint]);

  // 한번에 입력 폼 상태
  const [formAddress1, setFormAddress1] = useState("");
  const [formAddress2, setFormAddress2] = useState("");
  const [formStartDate, setFormStartDate] = useState("");
  const [formMoveInDate, setFormMoveInDate] = useState("");
  const [formSupplyArea, setFormSupplyArea] = useState("");
  const [formExclusiveArea, setFormExclusiveArea] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formWorkTree, setFormWorkTree] = useState<{ cat: string; subs: string[] }[]>([]);
  const [formWorkText, setFormWorkText] = useState("");
  const [formExpanded, setFormExpanded] = useState<boolean | null | undefined>(undefined);
  const [formCalendarTarget, setFormCalendarTarget] = useState<"start" | "movein" | null>(null);
  const [formCalendarMonth, setFormCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  const lastAssistant = messages.filter((m) => m.role === "assistant").pop();
  const lastUserContent = messages.filter((m) => m.role === "user").pop()?.content ?? "";
  const hasAddress = !!(extracted.site_address1 as string | undefined)?.trim();
  /** 상세주소만 물어볼 때는 '주소'가 들어가도 우편검색 버튼을 숨김 */
  const isAskingDetailAddressOnly =
    lastAssistant?.content &&
    /상세\s*주소|상세주소|동\s*\/\s*호|호수|동·호|동\/호/.test(lastAssistant.content);
  const isAskingMainAddress =
    lastAssistant?.content &&
    /주소|현장\s*주소|주소를|주소가/.test(lastAssistant.content) &&
    !isAskingDetailAddressOnly;
  const userWantsToModifyAddress = /주소/.test(lastUserContent);
  /** 최초 현장주소 받기 전에만 노출. 받은 뒤에는 '주소'로 수정 의사가 있을 때만 */
  const showAddressSearchButton =
    isAskingMainAddress && (!hasAddress || userWantsToModifyAddress);
  const hasStartDate = !!(extracted.start_date as string | undefined)?.trim();
  const hasMoveInDate = !!(extracted.move_in_date as string | undefined)?.trim();
  const isAskingStartDate = lastAssistant?.content && /공사\s*시작|시작일|착공|공사시작일/.test(lastAssistant.content);
  const isAskingMoveInDate = lastAssistant?.content && /입주일|공사\s*종료|종료일|입주\s*일자/.test(lastAssistant.content);
  const showCalendar = (isAskingStartDate && !hasStartDate) || (isAskingMoveInDate && !hasMoveInDate);
  const isAskingWorkTree = lastAssistant?.content && /공사\s*항목|대공정|어떤\s*공사|공사를\s*원하|원하시는\s*공사|선택\s*후\s*전송|공정을\s*보시고|아래에서\s*선택/.test(lastAssistant.content);
  const isAskingExpanded = lastAssistant?.content && /확장|비확장|확장\s*여부|확장\s*시공|현장이\s*이미\s*확장/.test(lastAssistant.content);
  const hasCollectedExpanded = extracted.is_expanded === true || extracted.is_expanded === false || extracted.is_expanded === null;
  const categoryNames = new Set(categories.map((c) => c.name));
  const customCats: CategoryWithProcesses[] = (extracted.work_tree ?? [])
    .filter((w) => !categoryNames.has(w.cat))
    .map((w, i) => ({
      id: -(i + 1),
      name: w.cat,
      processes: [] as { id: number; name: string }[],
    }));
  const displayedCategories = [...categories, ...customCats];
  /** '더 추가하실 건가요' 단계에서는 대공정 칩 숨기고 추가할게요/없어만 (추가할게요 누른 뒤 addMoreWork일 때만 대공정 표시) */
  const isAskingMoreWork =
    lastAssistant?.content &&
    /더\s*추가하실|더\s*추가\s*건가요|추가하실\s*건가요|추가하실건가요|나열했습니다[\s\S]*더|버튼으로[\s\S]*추가할게요|잘\s*받았어요[\s\S]*더/.test(
      lastAssistant.content
    );
  const showWorkTreeButtons =
    (isAskingWorkTree || chatPhase === "addMoreWork") &&
    displayedCategories.length > 0 &&
    chatPhase !== "confirmCreate" &&
    chatPhase !== "askingProjectName" &&
    chatPhase !== "editField" &&
    chatPhase !== "editingField" &&
    (!isAskingMoreWork || chatPhase === "addMoreWork") &&
    !loading;
  const showExpandedButtons =
    isAskingExpanded && !hasCollectedExpanded && !showWorkTreeButtons && !chatPhase && !loading;
  /** work_tree가 API에서 비어도 '더 추가' 질문이면 버튼은 반드시 노출 (없으면 사용자가 막힘). 전송 중엔 숨김 */
  const showMoreWorkButtons =
    isAskingMoreWork &&
    !loading &&
    chatPhase !== "addMoreWork" &&
    chatPhase !== "confirmCreate";

  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  useEffect(() => {
    /** iPhone 가로·대형 폰 등 640px 초과 시에도 전체화면 (max-sm만 쓰면 Safari가 모달로 보임) */
    const isMobile =
      typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches;
    if (isMobile) {
      document.body.classList.add("chat-open");
      return () => document.body.classList.remove("chat-open");
    }
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(draftStorageKey(userId)) : null;
      setHasSavedDraft(!!parseDraft(raw));
    } catch {
      setHasSavedDraft(false);
    }
  }, [userId]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollToEnd = () => {
      el.scrollTop = el.scrollHeight;
    };
    scrollToEnd();
    requestAnimationFrame(() => {
      scrollToEnd();
      window.setTimeout(scrollToEnd, 0);
    });
  }, [messages]);

  useEffect(() => {
    const last = messages.filter((m) => m.role === "assistant").pop();
    if (
      last?.content &&
      /더\s*추가하실|더\s*추가\s*건가요|추가하실\s*건가요|추가하실건가요|나열했습니다[\s\S]*더|잘\s*받았어요[\s\S]*더/.test(last.content)
    ) {
      suppressReadyUntilConfirmRef.current = true;
    }
  }, [messages]);

  useEffect(() => {
    const load = async () => {
      const [catRes, procRes] = await Promise.all([
        supabase.from("category").select("id, name").order("sort_order", { ascending: true }),
        supabase.from("process").select("id, category_id, name").order("sort_order", { ascending: true }),
      ]);
      const cats: CategoryWithProcesses[] = (catRes.data ?? [])
        .filter((c) => c.name?.trim())
        .map((c) => ({
          id: c.id,
          name: c.name.trim(),
          processes: (procRes.data ?? [])
            .filter((p) => p.category_id === c.id && p.name?.trim())
            .map((p) => ({ id: p.id, name: p.name.trim() })),
        }));
      setCategories(cats);
      setMessages([
        {
          role: "assistant",
          content: "안녕하세요! 👋 셀인코치의 AI 직원 셀코에요. 😊\n저는 주거 전문 코치에요. 🏠 현장 주소를 알려주세요.",
        },
      ]);
    };
    load();
  }, []);

  const getCalendarDays = (year: number, month: number): (number | null)[] => {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const startPad = first.getDay();
    const daysInMonth = last.getDate();
    const pad: null[] = Array(startPad).fill(null);
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    const total = pad.length + days.length;
    const remainder = total % 7;
    const endPad = remainder ? 7 - remainder : 0;
    return [...pad, ...days, ...Array(endPad).fill(null)];
  };

  const todayDateStr = toLocalDateString();
  const startDateBeforeTodayMessage = buildStartDateBeforeTodayMessage(todayDateStr);

  const handleDateSelect = (day: number) => {
    const y = calendarMonth.getFullYear();
    const m = calendarMonth.getMonth();
    const dateStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    // 채팅: 날짜만 입력창에 넣으면 extracted가 안 바뀌어 캘린더가 계속 보임 → 선택 즉시 반영 + 전송 (입력창에는 남기지 않음)
    if (isAskingStartDate && !hasStartDate) {
      if (dateStr < todayDateStr) {
        setMessages((p) => [...p, { role: "assistant", content: startDateBeforeTodayMessage }]);
        return;
      }
      setExtracted((prev) => ({ ...prev, start_date: dateStr }));
      void handleSend(dateStr);
    } else if (isAskingMoveInDate && !hasMoveInDate) {
      if (extracted.start_date?.trim() && dateStr < extracted.start_date) {
        setMessages((p) => [...p, { role: "assistant", content: MOVE_IN_BEFORE_START_MSG }]);
        return;
      }
      setExtracted((prev) => ({ ...prev, move_in_date: dateStr }));
      void handleSend(dateStr);
    } else {
      setInput(dateStr);
    }
  };

  const handleFormSubmit = async () => {
    if (!formAddress1.trim() || !formStartDate) return;
    if (formStartDate < todayDateStr) {
      setError(startDateBeforeTodayMessage);
      return;
    }
    if (formMoveInDate.trim() && formMoveInDate < formStartDate) {
      setError(MOVE_IN_BEFORE_START_MSG);
      return;
    }
    const hasWork = formWorkTree.length > 0 || formWorkText.trim().length > 0;
    if (!hasWork) return;
    setCreating(true);
    setError(null);
    try {
      let workTree = formWorkTree;
      if (formWorkText.trim()) {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) {
          setError("로그인이 필요합니다.");
          setCreating(false);
          return;
        }
        const res = await fetch("/api/ai/project-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            messages: [
              { role: "assistant", content: "공사하고 싶은 내용을 알려주세요." },
              { role: "user", content: formWorkText.trim() },
            ],
            categories: categories.map((c) => ({ name: c.name, processes: c.processes.map((p) => ({ name: p.name })) })),
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.extracted?.work_tree?.length) {
          setError("공사 항목을 인식하지 못했습니다. 더 구체적으로 적어주세요. (예: 욕실 리모델링, 바닥 시공)");
          setCreating(false);
          return;
        }
        workTree = data.extracted.work_tree as { cat: string; subs: string[] }[];
      }
      const supplyM2 = parseArea(formSupplyArea) ?? null;
      const exclusiveM2 = parseArea(formExclusiveArea) ?? null;
      let title = formTitle.trim();
      if (!title) {
        const { count } = await supabase.from("projects").select("*", { count: "exact", head: true }).eq("user_id", userId);
        title = `셀인 프로젝트 #${(count ?? 0) + 1}`;
      }
      const workDetailsResult: Record<string, { requirements: string; image_urls: string[]; subs: string[] }> = {};
      workTree.forEach((w) => {
        workDetailsResult[w.cat] = { requirements: "", image_urls: [], subs: w.subs ?? [] };
      });
      const category = workTree.flatMap((w) => [w.cat, ...(w.subs ?? [])]);
      const payload = {
        title,
        contact_name: userProfile.name || null,
        contact_phone: userProfile.phone || null,
        contact_email: userProfile.email || null,
        site_address1: formAddress1.trim(),
        site_address2: formAddress2.trim() || null,
        supply_area_m2: supplyM2,
        exclusive_area_m2: exclusiveM2,
        is_expanded: formExpanded === true ? true : formExpanded === false ? false : null,
        start_date: formStartDate || null,
        move_in_date: formMoveInDate || null,
        category,
        work_details: workDetailsResult,
        work_tree: workTree,
      };
      const { data: inserted, error: insertErr } = await supabase.from("projects").insert({ user_id: userId, status: "pending", ...payload }).select("id").single();
      if (insertErr) {
        setError(`저장 실패: ${insertErr.message}`);
        setCreating(false);
        return;
      }
      setCreatedProjectId(inserted?.id ?? null);
      setShowCreatedConfirm(true);
    } catch (e) {
      console.error(e);
      setError("프로젝트 생성 중 오류가 발생했습니다.");
    } finally {
      setCreating(false);
    }
  };

  const handleGoToProject = () => {
    onCreated(createdProjectId ?? undefined);
    onClose();
  };

  const parseArea = (val: string): number | null => {
    const s = String(val || "").trim().replace(/,/g, "");
    if (!s) return null;
    const num = parseFloat(s);
    if (Number.isNaN(num)) return null;
    if (s.includes("평") || s.includes("pyeong")) return pyeongToM2(num);
    return num;
  };

  /** EXTRACTED에 문자열로 온 면적을 숫자로 통일 */
  const coerceAreaM2Field = (v: unknown): number | undefined => {
    if (v === undefined || v === null) return undefined;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const t = v.trim().replace(/,/g, "");
      if (!t) return undefined;
      const n = parseFloat(t);
      return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
  };

  /** "25평 18평" / "84 59" 등 한 번에 공급·전용 입력 */
  const tryParseTwoAreasFromText = (raw: string): { supply: number; exclusive: number } | null => {
    const s = String(raw || "").trim().replace(/,/g, " ");
    const pyeongPair = /^(\d+(?:\.\d+)?)\s*평\s+(\d+(?:\.\d+)?)\s*평?/u.exec(s);
    if (pyeongPair) {
      const a = parseFloat(pyeongPair[1]);
      const b = parseFloat(pyeongPair[2]);
      if (!Number.isNaN(a) && !Number.isNaN(b)) {
        return { supply: pyeongToM2(a), exclusive: pyeongToM2(b) };
      }
    }
    const parts = s.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const a = parseArea(parts[0]!);
      const b = parseArea(parts[1]!);
      if (a != null && b != null) return { supply: a, exclusive: b };
    }
    return null;
  };

  const toggleWorkCategory = (name: string) => {
    setSelectedWorkCategories((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  /** 대공정 칩 전송 시: 이미 선택했던 공정 + 이번에 고른 공정을 합침(추가할게요 단계에서 이전 공정이 지워지지 않게) */
  const applyOptimisticWorkTreeFromSelection = (names: string[]) => {
    if (names.length === 0) return;
    const newNodes = names.map((name) => {
      const c = categories.find((x) => x.name === name);
      return { cat: name, subs: (c?.processes ?? []).map((p) => p.name) };
    });
    setExtracted((p) => {
      const merged = new Map((p.work_tree ?? []).map((w) => [w.cat, w]));
      for (const w of newNodes) merged.set(w.cat, w);
      return { ...p, work_tree: [...merged.values()] };
    });
  };

  const sendWorkSelectionAndSend = (text?: string, onDone?: () => void) => {
    const names = Array.from(selectedWorkCategories);
    applyOptimisticWorkTreeFromSelection(names);
    setSelectedWorkCategories(new Set());
    void handleSend(text, onDone);
  };

  const sendSelectedWorkCategories = () => {
    if (selectedWorkCategories.size === 0) return;
    const text = Array.from(selectedWorkCategories).join(", ");
    sendWorkSelectionAndSend(text);
  };

  const handleSend = async (overrideText?: string, onComplete?: () => void) => {
    const text = String(overrideText ?? input ?? "").trim();
    if (!text || loading) return;

    if (isAskingStartDate && !hasStartDate) {
      const t = text.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(t) && t < todayDateStr) {
        setMessages((p) => [...p, { role: "user", content: text }, { role: "assistant", content: startDateBeforeTodayMessage }]);
        setInput("");
        return;
      }
    }

    if (isAskingMoveInDate && !hasMoveInDate && extracted.start_date?.trim()) {
      const t = text.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(t) && t < extracted.start_date) {
        setMessages((p) => [...p, { role: "user", content: text }, { role: "assistant", content: MOVE_IN_BEFORE_START_MSG }]);
        setInput("");
        return;
      }
    }

    /** 상세주소 / 공급·전용면적: AI EXTRACTED에 빠져도 요약·저장에 반영 */
    const lastAsst = [...messages].filter((m) => m.role === "assistant").pop();
    const asstContent = lastAsst?.content ?? "";
    const detailOnly =
      lastAsst?.content &&
      /상세\s*주소|상세주소|동\s*\/\s*호|호수|동·호|동\/호/.test(lastAsst.content);
    const hasAddr = !!(extracted.site_address1 as string | undefined)?.trim();
    const askingExclusive = /전용\s*면적|전용면적/.test(asstContent);
    const askingSupply = /공급\s*면적|공급면적/.test(asstContent) && !askingExclusive;
    const pairAreas = tryParseTwoAreasFromText(text);

    setExtracted((p) => {
      let next: ExtractedProject = { ...p };
      if (detailOnly && hasAddr && text) {
        next = { ...next, site_address2: text };
      }
      if (pairAreas) {
        next = { ...next, supply_area_m2: pairAreas.supply, exclusive_area_m2: pairAreas.exclusive };
      } else if (askingExclusive) {
        if (/^(몰라요|모르겠|없어요|없음|해당\s*없음|skip|-)$/i.test(text.trim())) {
          next = { ...next, exclusive_area_m2: undefined };
        } else {
          const m = parseArea(text);
          if (m != null) next = { ...next, exclusive_area_m2: m };
        }
      } else if (askingSupply) {
        const m = parseArea(text);
        if (m != null) next = { ...next, supply_area_m2: m };
      }
      return next;
    });

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);
    setError(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setError("로그인이 필요합니다.");
        setLoading(false);
        return;
      }

      const nextMessages = [...messages, { role: "user" as const, content: text }];
      const res = await fetch("/api/ai/project-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: nextMessages,
          categories: categories.map((c) => ({ name: c.name, processes: c.processes.map((p) => ({ name: p.name })) })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "응답을 받지 못했습니다.");
        setLoading(false);
        return;
      }

      setMessages((prev) => [...prev, { role: "assistant", content: data.message }]);
      const moreWorkMsg =
        data.message &&
        /더\s*추가하실|더\s*추가\s*건가요|추가하실\s*건가요|추가하실건가요|나열했습니다[\s\S]*더|버튼으로[\s\S]*추가할게요|잘\s*받았어요[\s\S]*더/.test(
          data.message
        );
      if (moreWorkMsg) {
        suppressReadyUntilConfirmRef.current = true;
      }
      setChatPhase((prev) => {
        if (prev === "addMoreWork") return null;
        if (moreWorkMsg) return null;
        return prev;
      });
      if (data.extracted) {
        setExtracted((prev) => {
          const inc = data.extracted as Record<string, unknown>;
          const next = { ...prev, ...data.extracted } as ExtractedProject;

          /** API가 EXTRACTED에 주소·면적 등을 빼거나 null로 보내면 기존 채팅 입력값이 지워짐 → 이전 값 유지 */
          const missing = (v: unknown) =>
            v === undefined || v === null || (typeof v === "string" && !String(v).trim());
          if (missing(inc.site_address1) && prev.site_address1) next.site_address1 = prev.site_address1;
          if (missing(inc.site_address2) && prev.site_address2) next.site_address2 = prev.site_address2;
          if (missing(inc.start_date) && prev.start_date) next.start_date = prev.start_date;
          if (missing(inc.move_in_date) && prev.move_in_date) next.move_in_date = prev.move_in_date;
          if (missing(inc.supply_area_m2) && prev.supply_area_m2 != null) {
            next.supply_area_m2 = prev.supply_area_m2;
          }
          if (missing(inc.exclusive_area_m2) && prev.exclusive_area_m2 != null) {
            next.exclusive_area_m2 = prev.exclusive_area_m2;
          }
          if (!("is_expanded" in inc) && (prev.is_expanded === true || prev.is_expanded === false || prev.is_expanded === null)) {
            next.is_expanded = prev.is_expanded;
          }

          const supN = coerceAreaM2Field(next.supply_area_m2);
          const exN = coerceAreaM2Field(next.exclusive_area_m2);
          if (supN !== undefined) next.supply_area_m2 = supN;
          if (exN !== undefined) next.exclusive_area_m2 = exN;

          const incomingTree = data.extracted.work_tree as ExtractedProject["work_tree"] | undefined;
          const prevTree = prev.work_tree;
          const prevHasTree = Array.isArray(prevTree) && prevTree.length > 0;
          const incomingEmpty =
            incomingTree === undefined ||
            incomingTree === null ||
            (Array.isArray(incomingTree) && incomingTree.length === 0);
          if (Array.isArray(incomingTree) && incomingTree.length > 0) {
            const merged = new Map((prevTree ?? []).map((w) => [w.cat, w]));
            for (const w of incomingTree) merged.set(w.cat, w);
            next.work_tree = [...merged.values()];
          } else if (prevHasTree && incomingEmpty) {
            next.work_tree = prevTree;
          }
          if (suppressReadyUntilConfirmRef.current) {
            next.ready = false;
            next.title = undefined;
          }
          return next;
        });
      }
      onComplete?.();
    } catch (e) {
      console.error(e);
      setError("오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (overrideTitle?: string) => {
    if (!extracted.work_tree?.length) return;
    const isReady = extracted.ready || chatPhase === "confirmCreate" || chatPhase === "askingProjectName";
    if (!isReady) return;

    setCreating(true);
    setError(null);

    try {
      const topCatNames = extracted.work_tree.map((w) => w.cat);
      const workDetailsResult: Record<string, { requirements: string; image_urls: string[]; subs: string[] }> = {};
      topCatNames.forEach((catName) => {
        const wt = extracted.work_tree!.find((w) => w.cat === catName);
        workDetailsResult[catName] = {
          requirements: "",
          image_urls: [],
          subs: wt?.subs ?? [],
        };
      });

      const workTree = extracted.work_tree.map((w) => ({ cat: w.cat, subs: w.subs ?? [] }));
      const category = extracted.work_tree.flatMap((w) => [w.cat, ...(w.subs ?? [])]);

      let title = overrideTitle?.trim() || extracted.title?.trim();
      if (!title) {
        const { count } = await supabase.from("projects").select("*", { count: "exact", head: true }).eq("user_id", userId);
        title = `셀인 프로젝트 #${(count ?? 0) + 1}`;
      }

      const supplyM2 = typeof extracted.supply_area_m2 === "number" ? extracted.supply_area_m2 : parseArea(String(extracted.supply_area_m2 ?? ""));
      const exclusiveM2 = typeof extracted.exclusive_area_m2 === "number" ? extracted.exclusive_area_m2 : parseArea(String(extracted.exclusive_area_m2 ?? ""));

      const payload = {
        title,
        contact_name: userProfile.name || null,
        contact_phone: userProfile.phone || null,
        contact_email: userProfile.email || null,
        site_address1: extracted.site_address1?.trim() || "",
        site_address2: extracted.site_address2?.trim() || null,
        supply_area_m2: supplyM2 ?? null,
        exclusive_area_m2: exclusiveM2 ?? null,
        is_expanded: extracted.is_expanded === true ? true : extracted.is_expanded === false ? false : null,
        start_date: extracted.start_date || null,
        move_in_date: extracted.move_in_date || null,
        category,
        work_details: workDetailsResult,
        work_tree: workTree,
      };

      const { data: inserted, error: insertErr } = await supabase
        .from("projects")
        .insert({ user_id: userId, status: "pending", ...payload })
        .select("id")
        .single();

      if (insertErr) {
        setError(`저장 실패: ${insertErr.message}`);
        setCreating(false);
        return;
      }

      setCreatedProjectId(inserted?.id ?? null);
      try {
        localStorage.removeItem(draftStorageKey(userId));
        setHasSavedDraft(false);
      } catch {
        /* ignore */
      }
      setShowCreatedConfirm(true);
    } catch (e) {
      console.error(e);
      setError("프로젝트 생성 중 오류가 발생했습니다.");
    } finally {
      setCreating(false);
    }
  };

  const handleLoadDraft = useCallback(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem(draftStorageKey(userId)) : null;
    const d = parseDraft(raw);
    if (!d) return;
    setExtracted(d.extracted ?? { ready: false, work_tree: [] });
    setMessages(d.messages ?? []);
    setChatPhase(d.chatPhase ?? "confirmCreate");
    setSelectedWorkCategories(d.selectedWorkCategories?.length ? new Set(d.selectedWorkCategories) : new Set());
    setEditFieldType(null);
    setProjectNameInput("");
    setEditAddressForSite(d.extracted.site_address1 ?? "");
    setEditAddress2ForSite(d.extracted.site_address2 ?? "");
    suppressReadyUntilConfirmRef.current = false;
  }, [userId]);

  const handleDeleteDraft = useCallback(() => {
    try {
      localStorage.removeItem(draftStorageKey(userId));
      setHasSavedDraft(false);
    } catch (e) {
      console.error(e);
    }
    setMessages((p) => [...p, { role: "assistant", content: "알겠습니다. 저장해 두었던 정보를 모두 삭제했어요." }]);
  }, [userId]);

  /* 풀페이지 vs 모달: globals.css .project-create-ai-shell / .project-create-ai-panel (@media max-width:1023px) */
  const shell = (
    <div data-ai-modal-layout="css" className="project-create-ai-shell chat-fullscreen-mobile">
      {showCreatedConfirm && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <p className="mb-4 text-sm leading-relaxed text-gray-700">
              프로젝트가 만들어졌어요. 이곳에서 대공정의 기본 하위공정들이 세팅되어 있어요. 확인하시고 불필요한 부분은 삭제하시거나 추가로 필요하신 부분은 추가 입력 가능하세요.
            </p>
            <p className="mb-5 text-sm font-medium text-gray-800">해당 프로젝트로 이동해볼까요?</p>
            <button
              type="button"
              onClick={handleGoToProject}
              className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
            >
              이동
            </button>
          </div>
        </div>
      )}
      <div className="project-create-ai-panel">
        <div className="flex shrink-0 flex-col gap-3 border-b border-gray-100 px-4 py-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-800">쉬운 AI 모드</h3>
            <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"
            aria-label="닫기"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          </div>
          <div className="flex gap-1 rounded-lg bg-gray-100 p-0.5">
            <button
              type="button"
              onClick={() => setMode("chat")}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition ${mode === "chat" ? "bg-white text-gray-800 shadow-sm" : "text-gray-600 hover:text-gray-800"}`}
            >
              채팅으로
            </button>
            <button
              type="button"
              onClick={() => setMode("form")}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition ${mode === "form" ? "bg-white text-gray-800 shadow-sm" : "text-gray-600 hover:text-gray-800"}`}
            >
              한번에 입력
            </button>
          </div>
        </div>

        {mode === "form" ? (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <p className="text-xs text-gray-500">AI가 물어보는 내용을 한번에 입력하세요.</p>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">현장주소 *</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={formAddress1}
                    placeholder="주소 검색"
                    onClick={() => setShowAddressSearch(true)}
                    className="flex-1 cursor-pointer rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none"
                  />
                  <button type="button" onClick={() => setShowAddressSearch(true)}
                    className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-700">주소검색</button>
                </div>
                <input
                  type="text"
                  value={formAddress2}
                  onChange={(e) => setFormAddress2(e.target.value)}
                  placeholder="상세주소 (동/호수 등)"
                  className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">공사시작일 *</label>
                <button
                  type="button"
                  onClick={() => { setFormCalendarTarget("start"); setFormCalendarMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); }}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-left text-sm text-gray-700 outline-none focus:border-indigo-400"
                >
                  {formStartDate || "날짜 선택"}
                </button>
                {formCalendarTarget === "start" && (
                  <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <button type="button" onClick={() => setFormCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-200">‹</button>
                      <span className="text-sm font-semibold">{formCalendarMonth.getFullYear()}년 {formCalendarMonth.getMonth() + 1}월</span>
                      <button type="button" onClick={() => setFormCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-200">›</button>
                    </div>
                    <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] text-gray-500">
                      {["일","월","화","수","목","금","토"].map((d) => <div key={d} className="py-1">{d}</div>)}
                      {getCalendarDays(formCalendarMonth.getFullYear(), formCalendarMonth.getMonth()).map((day, i) => (
                        <button key={i} type="button" onClick={() => {
                          if (!day) return;
                          const newStr = `${formCalendarMonth.getFullYear()}-${String(formCalendarMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                          if (newStr < todayDateStr) {
                            setError(startDateBeforeTodayMessage);
                            return;
                          }
                          setFormStartDate(newStr);
                          setFormCalendarTarget(null);
                          setError(null);
                        }} disabled={!day}
                          className={`min-h-[28px] rounded py-0.5 text-xs ${day ? "text-gray-800 hover:bg-indigo-100" : ""}`}>{day ?? ""}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">입주일 (선택)</label>
                <button
                  type="button"
                  onClick={() => { setFormCalendarTarget("movein"); setFormCalendarMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); }}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-left text-sm text-gray-700 outline-none focus:border-indigo-400"
                >
                  {formMoveInDate || "날짜 선택"}
                </button>
                {formCalendarTarget === "movein" && (
                  <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <button type="button" onClick={() => setFormCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-200">‹</button>
                      <span className="text-sm font-semibold">{formCalendarMonth.getFullYear()}년 {formCalendarMonth.getMonth() + 1}월</span>
                      <button type="button" onClick={() => setFormCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-200">›</button>
                    </div>
                    <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] text-gray-500">
                      {["일","월","화","수","목","금","토"].map((d) => <div key={d} className="py-1">{d}</div>)}
                      {getCalendarDays(formCalendarMonth.getFullYear(), formCalendarMonth.getMonth()).map((day, i) => (
                        <button key={i} type="button" onClick={() => {
                          if (!day) return;
                          const newStr = `${formCalendarMonth.getFullYear()}-${String(formCalendarMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                          if (formStartDate && newStr < formStartDate) {
                            setError(MOVE_IN_BEFORE_START_MSG);
                            return;
                          }
                          setFormMoveInDate(newStr);
                          setFormCalendarTarget(null);
                          setError(null);
                        }} disabled={!day}
                          className={`min-h-[28px] rounded py-0.5 text-xs ${day ? "text-gray-800 hover:bg-indigo-100" : ""}`}>{day ?? ""}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">공사 항목 *</label>
                <textarea
                  value={formWorkText}
                  onChange={(e) => setFormWorkText(e.target.value)}
                  placeholder="원하는 공사를 자유롭게 적어주세요 (예: 욕실 리모델링, 바닥 시공, 도배)"
                  rows={3}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
                />
                <p className="mt-1 text-[10px] text-gray-500">대공정·하위공정을 모르셔도 괜찮아요. 하고 싶은 공사를 적어주시면 AI가 맞춰드려요.</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">기존 현장 확장 상태 *</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setFormExpanded(true)} className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition ${formExpanded === true ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300"}`}>확장</button>
                  <button type="button" onClick={() => setFormExpanded(false)} className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition ${formExpanded === false ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300"}`}>비확장</button>
                  <button type="button" onClick={() => setFormExpanded(null)} className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition ${formExpanded === null ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300"}`}>몰라요</button>
                </div>
                <p className="mt-1 text-[10px] text-gray-500">현장(건물)이 이미 증축·리모델링으로 넓혀진 경우 확장을 선택해주세요.</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">공급면적 (선택)</label>
                <input
                  type="text"
                  value={formSupplyArea}
                  onChange={(e) => setFormSupplyArea(e.target.value)}
                  placeholder="평(예: 25평) 또는 숫자만(예: 84)"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
                />
                <div>
                  <label className="mt-2 mb-1 block text-[10px] text-gray-500">전용면적 (선택)</label>
                  <input
                    type="text"
                    value={formExclusiveArea}
                    onChange={(e) => setFormExclusiveArea(e.target.value)}
                    placeholder="평(예: 18평) 또는 숫자만(예: 59)"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
                  />
                </div>
                <p className="mt-1 text-[10px] text-gray-500">공급면적과 전용면적을 알려주시면 더 정확한 견적이 가능해요.</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">프로젝트 제목 (선택)</label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="성공적인 인테리어를 위하여 이 프로젝트의 멋진 이름을 지어주시겠어요?"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
                />
              </div>
            </div>
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
            )}
            <button
              type="button"
              onClick={handleFormSubmit}
              disabled={creating || !formAddress1.trim() || !formStartDate || (!formWorkTree.length && !formWorkText.trim()) || formExpanded === undefined}
              className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {creating ? "생성 중..." : "프로젝트 생성하기"}
            </button>
          </div>
        ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                  m.role === "user"
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-100 text-gray-800"
                }`}
              >
                <p className="whitespace-pre-wrap">{m.content}</p>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-gray-100 px-4 py-2.5">
                <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-gray-500" style={{ animationDelay: "0ms" }} />
                <span className="ml-1 inline-block h-2 w-2 animate-bounce rounded-full bg-gray-500" style={{ animationDelay: "150ms" }} />
                <span className="ml-1 inline-block h-2 w-2 animate-bounce rounded-full bg-gray-500" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="shrink-0 px-4 py-2">
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          </div>
        )}

        {chatPhase === "confirmCreate" && (
          <div className="flex min-h-0 max-h-[min(52vh,480px)] shrink-0 flex-col border-t border-gray-100 bg-white">
            <div className="relative min-h-0 flex-1 overflow-hidden">
              <div
                ref={confirmSummaryScrollRef}
                onScroll={updateConfirmScrollHint}
                className="h-full min-h-0 overflow-y-auto overscroll-contain px-4 pt-3"
              >
            <div className="mb-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="mb-3 text-sm font-semibold text-gray-800">지금까지 선택하신 내용</p>
              <dl className="space-y-2 text-xs">
                <div>
                  <dt className="text-gray-500">현장주소</dt>
                  <dd className="font-medium text-gray-800">
                    {extracted.site_address1?.trim()
                      ? `${extracted.site_address1}${extracted.site_address2?.trim() ? ` ${extracted.site_address2}` : ""}`
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">공사시작일</dt>
                  <dd className="font-medium text-gray-800">{extracted.start_date?.trim() || "—"}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">입주일자</dt>
                  <dd className="font-medium text-gray-800">{extracted.move_in_date?.trim() || "—"}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">공급면적</dt>
                  <dd className="font-medium text-gray-800">
                    {extracted.supply_area_m2 != null
                      ? `${extracted.supply_area_m2} ㎡`
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">전용면적</dt>
                  <dd className="font-medium text-gray-800">
                    {extracted.exclusive_area_m2 != null
                      ? `${extracted.exclusive_area_m2} ㎡`
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">확장·비확장 여부</dt>
                  <dd className="font-medium text-gray-800">
                    {extracted.is_expanded === true
                      ? "확장"
                      : extracted.is_expanded === false
                        ? "비확장"
                        : extracted.is_expanded === null
                          ? "몰라요"
                          : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">대공정품목</dt>
                  <dd className="font-medium text-gray-800">
                    {extracted.work_tree?.length
                      ? (extracted.work_tree as { cat: string }[]).map((w) => w.cat).join(", ")
                      : "—"}
                  </dd>
                </div>
                {extracted.title?.trim() ? (
                  <div>
                    <dt className="text-gray-500">프로젝트명</dt>
                    <dd className="font-medium text-gray-800">{extracted.title}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
            <p className="mb-2 text-sm font-medium text-gray-800">이대로 프로젝트를 진행할까요?</p>
            <p className="mb-1 text-xs leading-relaxed text-gray-500">
              프로젝트 정보 수정은 언제든지 <span className="font-medium text-gray-600">내 프로젝트 관리</span>에서 대기 전까지 수정하실 수 있으니 안심하세요. 😊
            </p>
              </div>
              {showConfirmScrollHint ? (
                <div
                  className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center justify-end bg-gradient-to-t from-white via-white/95 to-transparent pb-1 pt-10"
                  aria-hidden
                >
                  <div className="flex flex-col items-center gap-0.5 animate-pulse">
                    <span className="inline-flex animate-bounce text-indigo-500" aria-hidden>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 5v10M7 14l5 5 5-5" />
                      </svg>
                    </span>
                    <span className="text-[10px] font-medium text-gray-500">아래로 내려보세요</span>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="shrink-0 border-t border-gray-100 bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setProjectNameInput("");
                  setChatPhase("askingProjectName");
                  setMessages((p) => [
                    ...p,
                    {
                      role: "assistant",
                      content:
                        "잠깐! 이 멋진 인테리어 프로젝트의 이름이 뭐죠? 😊 혹시 신세계 프로젝트? 😲 멋진 프로젝트명을 입력해 주세요.",
                    },
                  ]);
                }}
                disabled={loading}
                className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
              >
                프로젝트 생성
              </button>
              <button
                type="button"
                onClick={() => {
                  suppressReadyUntilConfirmRef.current = false;
                  const draft: DraftPayload = {
                    version: 1,
                    extracted: JSON.parse(JSON.stringify(extracted)) as ExtractedProject,
                    messages: messages.map((m) => ({ ...m })),
                    chatPhase: "confirmCreate",
                    selectedWorkCategories: [],
                    savedAt: Date.now(),
                  };
                  try {
                    localStorage.setItem(draftStorageKey(userId), JSON.stringify(draft));
                    setHasSavedDraft(true);
                  } catch (e) {
                    console.error(e);
                  }
                  setMessages((p) => [
                    ...p,
                    {
                      role: "assistant",
                      content:
                        "앗! 취소하셨네요. 다음에 다시 저의 도움이 필요하시면 언제든지 불러주세요. ❤️",
                    },
                    {
                      role: "assistant",
                      content:
                        "실수로 취소하신 거라면, 채팅창을 닫았다가 다시 여시면 이전에 입력하신 내용을 불러올 수 있어요. 하단의 [이전정보 불러오기]를 누르시면 바로 이어서 진행하실 수 있어요.",
                    },
                  ]);
                  setChatPhase(null);
                }}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 text-sm font-medium text-gray-600 transition hover:bg-gray-100"
              >
                취소할게요
              </button>
            </div>
            </div>
          </div>
        )}

        {chatPhase === "askingProjectName" && (
          <div className="shrink-0 border-t border-gray-100 px-4 py-3">
            <div className="mb-3 flex gap-2">
              <input
                type="text"
                value={projectNameInput}
                onChange={(e) => setProjectNameInput(e.target.value)}
                placeholder="프로젝트명 입력"
                className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-indigo-400"
              />
            </div>
            <button
              type="button"
              onClick={() => handleCreate(projectNameInput.trim() || undefined)}
              disabled={creating}
              className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {creating ? "생성 중..." : "프로젝트 생성"}
            </button>
          </div>
        )}

        {chatPhase === "editField" && !editFieldType && (
          <div className="shrink-0 border-t border-gray-100 px-4 py-3">
            <p className="mb-3 text-sm text-gray-600">수정할 항목을 선택해주세요</p>
            <div className="flex flex-wrap gap-2">
              {(["site_address", "start_date", "move_in_date", "supply_area", "exclusive_area", "is_expanded", "work_tree"] as const).map((field) => (
                <button key={field} type="button" onClick={() => { setEditFieldType(field); setChatPhase("editingField"); if (field === "site_address") { setEditAddressForSite(extracted.site_address1 ?? ""); setEditAddress2ForSite(extracted.site_address2 ?? ""); } }} className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-100">
                  {field === "site_address" && "현장주소"}
                  {field === "start_date" && "공사시작일"}
                  {field === "move_in_date" && "입주일자"}
                  {field === "supply_area" && "공급면적"}
                  {field === "exclusive_area" && "전용면적"}
                  {field === "is_expanded" && "현재 확장 비확장여부"}
                  {field === "work_tree" && "대공정품목"}
                </button>
              ))}
            </div>
          </div>
        )}

        {chatPhase === "editingField" && editFieldType && (
          <div className="shrink-0 border-t border-gray-100 px-4 py-3">
            <EditFieldInline
              field={editFieldType}
              extracted={extracted}
              setExtracted={setExtracted}
              categories={displayedCategories}
              selectedWorkCategories={selectedWorkCategories}
              toggleWorkCategory={toggleWorkCategory}
              loading={loading}
              onSend={sendWorkSelectionAndSend}
              onBack={() => { setEditFieldType(null); setChatPhase("editField"); }}
              onDone={() => {
                suppressReadyUntilConfirmRef.current = false;
                setEditFieldType(null);
                setChatPhase("confirmCreate");
                setSelectedWorkCategories(new Set());
              }}
              showAddressSearch={() => setShowAddressSearch(true)}
              calendarMonth={calendarMonth}
              setCalendarMonth={setCalendarMonth}
              getCalendarDays={getCalendarDays}
              handleDateSelect={handleDateSelect}
              parseArea={parseArea}
              editAddressForSite={editAddressForSite}
              setEditAddressForSite={setEditAddressForSite}
              editAddress2ForSite={editAddress2ForSite}
              setEditAddress2ForSite={setEditAddress2ForSite}
              onMoveInBeforeStart={() => {
                setMessages((p) => [...p, { role: "assistant", content: MOVE_IN_BEFORE_START_MSG }]);
              }}
              onStartDateBeforeToday={() => {
                setMessages((p) => [...p, { role: "assistant", content: startDateBeforeTodayMessage }]);
              }}
            />
          </div>
        )}

        {mode === "chat" && hasSavedDraft ? (
          <div className="shrink-0 border-t border-indigo-100 bg-indigo-50/90 px-4 py-3">
            <p className="mb-2 text-center text-[11px] font-medium leading-snug text-indigo-950">
              이전에 작성한 정보가 저장되어 있어요. 다시 이어서 진행하거나 삭제할 수 있어요.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleLoadDraft}
                className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700"
              >
                이전정보 불러오기
              </button>
              <button
                type="button"
                onClick={handleDeleteDraft}
                className="flex-1 rounded-xl border border-indigo-200 bg-white py-2.5 text-xs font-medium text-indigo-800 transition hover:bg-indigo-100/80"
              >
                이전정보 완전삭제
              </button>
            </div>
          </div>
        ) : null}

        {!chatPhase || chatPhase === "addMoreWork" ? (
        <div className="shrink-0 border-t border-gray-100 p-4">
          {showExpandedButtons && (
            <div className="mb-2 flex gap-2">
              <button
                type="button"
                onClick={() => { setExtracted((p) => ({ ...p, is_expanded: true })); handleSend("확장"); }}
                disabled={loading}
                className="flex-1 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-600 transition hover:bg-indigo-100 disabled:opacity-50"
              >
                확장
              </button>
              <button
                type="button"
                onClick={() => { setExtracted((p) => ({ ...p, is_expanded: false })); handleSend("비확장"); }}
                disabled={loading}
                className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-50"
              >
                비확장
              </button>
              <button
                type="button"
                onClick={() => { setExtracted((p) => ({ ...p, is_expanded: null })); handleSend("몰라요"); }}
                disabled={loading}
                className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-500 transition hover:bg-gray-100 disabled:opacity-50"
              >
                몰라요
              </button>
            </div>
          )}
          {showMoreWorkButtons && (
            <div className="mb-2 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setMessages((p) => [
                    ...p,
                    {
                      role: "assistant",
                      content:
                        "한 번 더 여쭤볼게요! 😊 또 추가하실 공정이 있으신가요? 아래에서 선택하신 뒤 전송해 주세요.",
                    },
                  ]);
                  setChatPhase("addMoreWork");
                }}
                disabled={loading}
                className="flex-1 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-600 transition hover:bg-indigo-100 disabled:opacity-50"
              >
                추가할게요
              </button>
              <button
                type="button"
                onClick={() => {
                  suppressReadyUntilConfirmRef.current = false;
                  setChatPhase("confirmCreate");
                  setExtracted((p) => ({ ...p, ready: true }));
                  setMessages((p) => [
                    ...p,
                    {
                      role: "assistant",
                      content:
                        "지금까지 선택하신 내용을 아래에 정리해 드렸어요. 😊\n프로젝트 정보는 언제든지 내 프로젝트 관리에서 대기 전까지 수정하실 수 있으니 안심하세요. 😊",
                    },
                  ]);
                }}
                disabled={loading}
                className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-50"
              >
                아니요
              </button>
            </div>
          )}
          {showWorkTreeButtons && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {displayedCategories.map((c) => (
                <button
                  key={typeof c.id === "number" ? c.id : c.name}
                  type="button"
                  onClick={() => toggleWorkCategory(c.name)}
                  disabled={loading}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                    selectedWorkCategories.has(c.name)
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                      : "border-gray-200 bg-white text-gray-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
                  }`}
                >
                  {c.name}
                </button>
              ))}
              <p className="w-full text-[10px] text-gray-500">여러 개 선택 후 전송을 누르세요. 지금 여기에 보이지 않아도 프로젝트 생성 후 추가하실 수 있어요.</p>
            </div>
          )}
          {showAddressSearchButton && (
            <div className="mb-2">
              <button
                type="button"
                onClick={() => setShowAddressSearch(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-600 transition hover:bg-indigo-100"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                주소 검색
              </button>
            </div>
          )}
          {showCalendar && (
            <div className="mb-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                  className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-200"
                  aria-label="이전 달"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
                </button>
                <span className="text-sm font-semibold text-gray-700">
                  {calendarMonth.getFullYear()}년 {calendarMonth.getMonth() + 1}월
                </span>
                <button
                  type="button"
                  onClick={() => setCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
                  className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-200"
                  aria-label="다음 달"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg>
                </button>
              </div>
              <div className="grid grid-cols-7 gap-0.5 text-center">
                {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
                  <div key={d} className="py-1 text-[10px] font-medium text-gray-500">{d}</div>
                ))}
                {getCalendarDays(calendarMonth.getFullYear(), calendarMonth.getMonth()).map((day, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => day && handleDateSelect(day)}
                    disabled={!day}
                    className={`min-h-[32px] rounded-lg py-1 text-xs transition ${
                      day
                        ? "text-gray-800 hover:bg-indigo-100 hover:text-indigo-700"
                        : "cursor-default bg-transparent"
                    }`}
                  >
                    {day ?? ""}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
              placeholder={
                showAddressSearchButton
                  ? "주소 검색 후 상세주소를 입력하거나 직접 입력하세요"
                  : showCalendar
                    ? "캘린더에서 날짜를 선택하거나 직접 입력하세요"
                    : showMoreWorkButtons
                      ? "버튼을 선택하세요"
                      : showWorkTreeButtons
                        ? "대공정 선택 후 전송을 누르세요"
                        : showExpandedButtons
                          ? "확장 / 비확장 / 몰라요 중 선택하세요"
                          : "메시지를 입력하세요..."
              }
              className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none placeholder:text-gray-400 focus:border-indigo-400"
              disabled={loading}
            />
            <button
              type="button"
              onClick={() => (showWorkTreeButtons && selectedWorkCategories.size > 0 ? sendSelectedWorkCategories() : handleSend())}
              disabled={loading || (!input.trim() && !(showWorkTreeButtons && selectedWorkCategories.size > 0))}
              className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              전송
            </button>
          </div>
        </div>
        ) : null}
        </div>
        )}

        <AddressSearchLayer
          open={showAddressSearch}
          onSelect={(addr) => {
            if (chatPhase === "editingField" && editFieldType === "site_address") {
              setEditAddressForSite(addr);
            } else if (mode === "form") {
              setFormAddress1(addr);
            } else {
              setExtracted((p) => ({ ...p, site_address1: addr.trim() }));
              handleSend(addr);
            }
            setShowAddressSearch(false);
          }}
          onClose={() => setShowAddressSearch(false)}
        />
      </div>
    </div>
  );

  /* body가 아니라 대시보드 레이아웃 #project-create-ai-portal — 헤더/사이드바와 같은 부모에서 z-index 비교 (Android 포함) */
  if (typeof document === "undefined") return null;
  const portalRoot = document.getElementById("project-create-ai-portal");
  return createPortal(shell, portalRoot ?? document.body);
}
