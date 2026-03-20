"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { pyeongToM2 } from "@/lib/area";
import AddressSearchLayer from "@/components/AddressSearchLayer";

type ProcessRow = { id: string; name: string };
type CategoryWithProcesses = { id: number; name: string; processes: ProcessRow[] };

type WorkItem = {
  key: string;
  label: string;
  categoryName: string;
  isCustom?: boolean;
};

// 대공정별 요구사항 + 이미지
type CatDetail = {
  requirements: string;
  files: File[];
  previewUrls: string[];
  existingUrls?: string[];
  removedExistingUrls?: string[];
};

type ScheduleRange = { start: string; end: string };

export type ProjectForEdit = {
  id: string;
  title: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  site_address1: string | null;
  site_address2: string | null;
  start_date: string | null;
  move_in_date: string | null;
  supply_area_m2: number | null;
  exclusive_area_m2: number | null;
  is_expanded: boolean | null;
  category: string[] | null;
  work_tree: { cat: string; subs: string[] }[] | null;
  work_details: Record<string, { requirements: string; image_urls: string[]; subs?: string[] }> | null;
  process_schedule?: Record<string, ScheduleRange | ScheduleRange[]> | null;
};

type Props = {
  userId: string;
  userProfile: { name: string; phone: string; email: string };
  onClose: () => void;
  onCreated: () => void;
  initialData?: ProjectForEdit | null;
};

export default function ProjectCreateModal({ userId, userProfile, onClose, onCreated, initialData }: Props) {
  const isEdit = !!initialData;
  const [categoriesData, setCategoriesData] = useState<CategoryWithProcesses[]>([]);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [subInputs, setSubInputs] = useState<Record<string, string>>({});
  const [catInput, setCatInput] = useState("");

  const [catDetails, setCatDetails] = useState<Record<string, CatDetail>>({});

  const [formTitle, setFormTitle] = useState("");
  const [formName, setFormName] = useState(userProfile.name);
  const [formPhone, setFormPhone] = useState(userProfile.phone);
  const [formEmail, setFormEmail] = useState(userProfile.email);
  const [formAddress1, setFormAddress1] = useState("");
  const [formAddress2, setFormAddress2] = useState("");
  const [formSupplyArea, setFormSupplyArea] = useState("");
  const [formSupplyUnit, setFormSupplyUnit] = useState<"㎡" | "평">("㎡");
  const [formExclusiveArea, setFormExclusiveArea] = useState("");
  const [formExclusiveUnit, setFormExclusiveUnit] = useState<"㎡" | "평">("㎡");
  const [formIsExpanded, setFormIsExpanded] = useState<boolean | null>(null);
  const [formStartDate, setFormStartDate] = useState("");
  const [formMoveInDate, setFormMoveInDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [validationModal, setValidationModal] = useState<string | null>(null);

  const [draggingCat, setDraggingCat] = useState<string | null>(null);
  const [showAddressSearch, setShowAddressSearch] = useState(false);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const loadedRef = useRef(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    const load = async () => {
      const [catRes, procRes] = await Promise.all([
        supabase.from("category").select("id, name").order("sort_order", { ascending: true }).order("id", { ascending: true }),
        supabase.from("process").select("id, category_id, name, sort_order").order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
      ]);
      const cats: CategoryWithProcesses[] = (catRes.data ?? [])
        .filter((c) => c.name?.trim())
        .map((c) => ({
          id: c.id, name: c.name.trim(),
          processes: (procRes.data ?? [])
            .filter((p) => p.category_id === c.id && p.name?.trim())
            .map((p) => ({ id: p.id, name: p.name.trim() })),
        }));
      setCategoriesData(cats);

      if (initialData) {
        // 편집 모드: initialData 로 폼 채우기
        setFormTitle(initialData.title ?? "");
        setFormName(initialData.contact_name ?? userProfile.name);
        setFormPhone(initialData.contact_phone ?? userProfile.phone);
        setFormEmail(initialData.contact_email ?? userProfile.email);
        setFormAddress1(initialData.site_address1 ?? "");
        setFormAddress2(initialData.site_address2 ?? "");
        setFormSupplyArea(initialData.supply_area_m2 != null ? String(initialData.supply_area_m2) : "");
        setFormExclusiveArea(initialData.exclusive_area_m2 != null ? String(initialData.exclusive_area_m2) : "");
        setFormSupplyUnit("㎡");
        setFormExclusiveUnit("㎡");
        setFormIsExpanded(initialData.is_expanded);
        setFormStartDate(initialData.start_date ? initialData.start_date.slice(0, 10) : "");
        setFormMoveInDate(initialData.move_in_date ? initialData.move_in_date.slice(0, 10) : "");

        const wd = initialData.work_details ?? {};
        let tree = initialData.work_tree && initialData.work_tree.length > 0
          ? initialData.work_tree
          : Object.keys(wd).length > 0
            ? Object.keys(wd).map((cat) => ({ cat, subs: (wd[cat] as { subs?: string[] })?.subs ?? [] }))
            : initialData.category?.length
              ? [...new Set(initialData.category)].map((cat) => ({ cat, subs: [] as string[] }))
              : [];
        const items: WorkItem[] = [];
        tree.forEach((g, gi) => {
          items.push({ key: `cat-${g.cat}-${gi}`, label: g.cat, categoryName: g.cat });
          g.subs.forEach((s, si) => {
            items.push({ key: `sub-${g.cat}-${si}`, label: s, categoryName: g.cat });
          });
        });
        setWorkItems(items.length > 0 ? items : []);

        const details: Record<string, CatDetail> = {};
        tree.forEach((g) => {
          const d = wd[g.cat];
          details[g.cat] = {
            requirements: d?.requirements ?? "",
            files: [],
            previewUrls: [],
            existingUrls: d?.image_urls ?? [],
          };
        });
        setCatDetails(details);
      } else {
        const defaultItems: WorkItem[] = [];
        cats.forEach((cat) => {
          defaultItems.push({ key: `cat-${cat.id}`, label: cat.name, categoryName: cat.name });
          cat.processes.forEach((proc) => {
            defaultItems.push({ key: `proc-${proc.id}`, label: proc.name, categoryName: cat.name });
          });
        });
        setWorkItems(defaultItems);
        const details: Record<string, CatDetail> = {};
        cats.forEach((cat) => { details[cat.name] = { requirements: "", files: [], previewUrls: [] }; });
        setCatDetails(details);
      }
    };
    load();
  }, [initialData?.id]);

  const removeItem = (key: string) => setWorkItems((prev) => prev.filter((w) => w.key !== key));

  const removeCategoryGroup = (catName: string) =>
    setWorkItems((prev) => prev.filter((w) => w.categoryName !== catName));

  const addSubItem = (catName: string) => {
    const text = (subInputs[catName] ?? "").trim();
    if (!text) return;
    setWorkItems((prev) => [...prev, { key: `custom-sub-${catName}-${Date.now()}`, label: text, categoryName: catName, isCustom: true }]);
    setSubInputs((prev) => ({ ...prev, [catName]: "" }));
  };

  const addCatItem = () => {
    const text = catInput.trim();
    if (!text) return;
    const key = `custom-cat-${Date.now()}`;
    setWorkItems((prev) => [...prev, { key, label: text, categoryName: text, isCustom: true }]);
    setCatDetails((prev) => ({ ...prev, [text]: { requirements: "", files: [], previewUrls: [] } }));
    setCatInput("");
  };

  const updateRequirements = (catName: string, value: string) => {
    setCatDetails((prev) => ({ ...prev, [catName]: { ...(prev[catName] ?? { requirements: "", files: [], previewUrls: [] }), requirements: value } }));
  };

  const addFiles = (catName: string, newFiles: File[]) => {
    setCatDetails((prev) => {
      const cur = prev[catName] ?? { requirements: "", files: [], previewUrls: [] };
      const added = newFiles.map((f) => URL.createObjectURL(f));
      return { ...prev, [catName]: { ...cur, files: [...cur.files, ...newFiles], previewUrls: [...cur.previewUrls, ...added] } };
    });
  };

  const removeFile = (catName: string, idx: number) => {
    setCatDetails((prev) => {
      const cur = prev[catName];
      if (!cur) return prev;
      URL.revokeObjectURL(cur.previewUrls[idx]);
      return {
        ...prev,
        [catName]: {
          ...cur,
          files: cur.files.filter((_, i) => i !== idx),
          previewUrls: cur.previewUrls.filter((_, i) => i !== idx),
        },
      };
    });
  };

  const removeExistingUrl = (catName: string, url: string) => {
    setCatDetails((prev) => {
      const cur = prev[catName];
      if (!cur) return prev;
      const removed = [...(cur.removedExistingUrls ?? []), url];
      return { ...prev, [catName]: { ...cur, removedExistingUrls: removed } };
    });
  };

  const openPostcode = () => setShowAddressSearch(true);

  /** 입력값 → DB 저장용 ㎡ 숫자 (항상 ㎡로 변환) */
  const toM2 = (val: string, unit: "㎡" | "평"): number | null => {
    const num = parseFloat(val);
    if (!val.trim() || isNaN(num)) return null;
    return unit === "평" ? parseFloat(pyeongToM2(num).toFixed(2)) : num;
  };

  const formatPhone = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
    return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  };

  const handleSubmit = async () => {
    if (!workItems.length) { setFormError("공사품목을 1개 이상 남겨주세요."); return; }
    if (!formAddress1.trim()) { setFormError("현장주소를 입력해주세요."); return; }
    if (!formStartDate) { setFormError("공사 시작일자를 선택해주세요."); return; }

    // 신규 생성 시: 대공정마다 하위공정 1개 이상 필수
    if (!isEdit) {
      const mainCats = workItems.filter((w) => w.key.startsWith("cat-") || w.key.startsWith("custom-cat-"));
      const catsWithoutSubs = mainCats.filter((mc) => {
        const subCount = workItems.filter(
          (w) => w.categoryName === mc.categoryName && !w.key.startsWith("cat-") && !w.key.startsWith("custom-cat-")
        ).length;
        return subCount === 0;
      });
      if (catsWithoutSubs.length > 0) {
        setValidationModal("하위공정을 입력하세요.\n\n하위공정이 없으면 X 버튼을 눌러 대공정을 삭제해주세요.");
        return;
      }
    }

    setFormError(null);
    setIsSubmitting(true);

    // 대공정별 이미지 업로드
    const workDetailsResult: Record<string, { requirements: string; image_urls: string[]; subs?: string[] }> = {};
    const topCatNames = [...new Set(workItems.map((w) => w.categoryName))];

    for (let ci = 0; ci < topCatNames.length; ci++) {
      const catName = topCatNames[ci];
      const detail = catDetails[catName];
      const imageUrls: string[] = [];
      // 기존 URL 유지 (제거한 것 제외)
      const existing = (detail?.existingUrls ?? []).filter((u) => !(detail?.removedExistingUrls ?? []).includes(u));
      imageUrls.push(...existing);
      if (detail?.files.length) {
        for (let fi = 0; fi < detail.files.length; fi++) {
          const file = detail.files[fi];
          const ext = (file.name.split(".").pop() ?? "jpg").replace(/[^a-zA-Z0-9]/g, "");
          const path = `${userId}/cat${ci}_${Date.now()}_${fi}.${ext}`;
          const { error: upErr } = await supabase.storage.from("project-images").upload(path, file);
          if (upErr) {
            console.error("이미지 업로드 오류:", upErr.message);
            setFormError(`이미지 업로드 오류: ${upErr.message}`);
            setIsSubmitting(false);
            return;
          }
          const { data: urlData } = supabase.storage.from("project-images").getPublicUrl(path);
          imageUrls.push(urlData.publicUrl);
        }
      }
      const subs = workItems
        .filter((w) =>
          w.categoryName === catName &&
          !w.key.startsWith("cat-") &&
          !w.key.startsWith("custom-cat-")
        )
        .map((w) => w.label);
      workDetailsResult[catName] = { requirements: detail?.requirements ?? "", image_urls: imageUrls, subs };
    }

    let title = formTitle.trim();
    if (!title) {
      const { count } = await supabase.from("projects").select("*", { count: "exact", head: true }).eq("user_id", userId);
      title = `셀인 프로젝트 #${(count ?? 0) + 1}`;
    }

    const workTree = topCatNames.map((catName) => ({
      cat: catName,
      subs: (workDetailsResult[catName] as { subs: string[] }).subs,
    }));

    const payload = {
      title,
      contact_name: formName.trim() || null,
      contact_phone: formPhone.trim() || null,
      contact_email: formEmail.trim() || null,
      site_address1: formAddress1.trim(),
      site_address2: formAddress2.trim() || null,
      supply_area_m2: toM2(formSupplyArea, formSupplyUnit),
      exclusive_area_m2: toM2(formExclusiveArea, formExclusiveUnit),
      is_expanded: formIsExpanded,
      start_date: formStartDate || null,
      move_in_date: formMoveInDate || null,
      category: workItems.map((w) => w.label),
      work_details: workDetailsResult,
      work_tree: workTree,
    };

    const { error } = isEdit && initialData
      ? await supabase.from("projects").update(payload).eq("id", initialData.id).eq("user_id", userId)
      : await supabase.from("projects").insert({ user_id: userId, status: "pending", ...payload });

    if (error) {
      console.error("프로젝트 저장 오류:", error.message, error.details, error.hint);
      setFormError(`저장 실패: ${error.message}`);
      setIsSubmitting(false);
      return;
    }
    setIsSubmitting(false);
    onCreated();
    onClose();
  };

  // 대공정 그룹 계산 — catItem 또는 procItems 중 하나라도 있는 경우만 렌더
  const adminGrouped = categoriesData
    .map((cat) => ({
      cat,
      catItem: workItems.find((w) => w.key === `cat-${cat.id}`),
      procItems: workItems.filter((w) => w.categoryName === cat.name && w.key !== `cat-${cat.id}`),
    }))
    .filter(({ catItem, procItems }) => catItem != null || procItems.length > 0);

  const customCatGroups = workItems
    .filter((w) => w.key.startsWith("custom-cat-"))
    .map((catItem) => ({
      catItem,
      procItems: workItems.filter((w) => w.categoryName === catItem.categoryName && w.key !== catItem.key),
    }));

  const editTree = isEdit && initialData
    ? (initialData.work_tree && initialData.work_tree.length > 0
        ? initialData.work_tree
        : Object.keys(initialData.work_details ?? {}).length > 0
          ? Object.keys(initialData.work_details!).map((cat) => ({
              cat,
              subs: (initialData.work_details![cat] as { subs?: string[] })?.subs ?? [],
            }))
          : initialData.category?.length
            ? [...new Set(initialData.category)].map((cat) => ({ cat, subs: [] as string[] }))
            : [])
    : [];
  const editGrouped = editTree.length > 0
    ? editTree.map((g) => {
        const catItem = workItems.find((w) => w.categoryName === g.cat && w.key.startsWith("cat-"));
        const procItems = workItems.filter((w) =>
          w.categoryName === g.cat &&
          (w.key.startsWith("sub-") || w.key.startsWith("custom-sub-"))
        );
        return {
          catItem: catItem ?? { key: `cat-${g.cat}`, label: g.cat, categoryName: g.cat },
          procItems,
          catLabel: g.cat,
        };
      })
    : [];

  const renderCatDetail = (catName: string) => {
    const detail = catDetails[catName] ?? { requirements: "", files: [], previewUrls: [] };
    const isDragging = draggingCat === catName;
    const keptExisting = (detail.existingUrls ?? []).filter((u) => !(detail.removedExistingUrls ?? []).includes(u));
    const hasThumbnails = keptExisting.length > 0 || detail.previewUrls.length > 0;

    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      setDraggingCat(null);
      const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
      if (files.length) addFiles(catName, files);
    };

    return (
      <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
        {/* 업체 요구사항 */}
        <div>
          <label className="mb-1 block text-[11px] font-medium text-gray-500">업체 요구사항</label>
          <textarea
            value={detail.requirements}
            onChange={(e) => updateRequirements(catName, e.target.value)}
            placeholder={`${catName} 관련 요구사항을 입력해주세요.`}
            rows={2}
            className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs outline-none placeholder:text-gray-300 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100"
          />
        </div>

        {/* 참고 사진 — 드래그 앤 드롭 영역 */}
        <div>
          <label className="mb-1.5 block text-[11px] font-medium text-gray-500">참고 사진 첨부</label>

          {/* 드롭 존 */}
          <div
            onClick={() => fileInputRefs.current[catName]?.click()}
            onDragOver={(e) => { e.preventDefault(); setDraggingCat(catName); }}
            onDragEnter={(e) => { e.preventDefault(); setDraggingCat(catName); }}
            onDragLeave={(e) => {
              // 자식 요소로 이동할 때 leave 방지
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDraggingCat(null);
            }}
            onDrop={handleDrop}
            className={`relative cursor-pointer rounded-xl border-2 border-dashed p-3 transition
              ${isDragging
                ? "border-indigo-400 bg-indigo-50 scale-[1.01]"
                : "border-gray-200 bg-gray-50 hover:border-indigo-300 hover:bg-indigo-50"
              }`}
          >
            {!hasThumbnails ? (
              /* 업로드 전 — 안내 문구 */
              <div className="flex flex-col items-center justify-center py-4 text-gray-300">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="16 16 12 12 8 16" />
                  <line x1="12" y1="12" x2="12" y2="21" />
                  <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
                </svg>
                {isDragging ? (
                  <p className="mt-2 text-xs font-medium text-indigo-500">여기에 놓으세요!</p>
                ) : (
                  <>
                    <p className="mt-2 text-xs font-medium text-gray-400">사진을 드래그하거나 클릭하여 추가</p>
                    <p className="mt-0.5 text-[10px] text-gray-300">PNG, JPG, WEBP · 여러 장 가능</p>
                  </>
                )}
              </div>
            ) : (
              /* 업로드 후 — 썸네일 그리드 */
              <div className="flex flex-wrap gap-2">
                {keptExisting.map((url, i) => (
                  <div key={`ex-${i}`} className="relative h-20 w-20 shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`기존${i + 1}`} className="h-full w-full rounded-lg object-cover border border-gray-100" />
                    <button type="button" onClick={(e) => { e.stopPropagation(); removeExistingUrl(catName, url); }}
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow">
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))}
                {detail.previewUrls.map((url, i) => (
                  <div key={i} className="relative h-20 w-20 shrink-0">
                    <img src={url} alt={`첨부${i + 1}`} className="h-full w-full rounded-lg object-cover border border-gray-100" />
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeFile(catName, i); }}
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow"
                    >
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))}
                {/* 추가 버튼 (사진이 있을 때) */}
                <div className={`flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-lg border-2 border-dashed text-gray-300 transition
                  ${isDragging ? "border-indigo-400 bg-indigo-100 text-indigo-400" : "border-gray-200 hover:border-indigo-300 hover:text-indigo-400"}`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span className="mt-1 text-[10px]">추가</span>
                </div>
              </div>
            )}

            {/* 드래그 오버레이 */}
            {isDragging && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-indigo-50/80">
                <p className="text-sm font-semibold text-indigo-500">여기에 놓으세요!</p>
              </div>
            )}
          </div>

          <input
            ref={(el) => { fileInputRefs.current[catName] = el; }}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/"));
              if (files.length) addFiles(catName, files);
              e.target.value = "";
            }}
          />
        </div>
      </div>
    );
  };

  const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
  const formatScheduleRange = (label: string): string => {
    const raw = initialData?.process_schedule?.[label];
    if (!raw) return "";
    const ranges = Array.isArray(raw) ? raw : [raw];
    if (ranges.length === 0) return "";
    const r = ranges[ranges.length - 1];
    // 문자열의 월·일을 그대로 사용하고, 요일만 Date로 계산 (타임존 오차 방지)
    const fmt = (s: string) => {
      const part = (typeof s === "string" ? s : "").split("T")[0];
      const [y, m, d] = part.split("-").map(Number);
      if (isNaN(y) || isNaN(m) || isNaN(d)) return "?";
      const date = new Date(y, m - 1, d);
      return `${m}/${d} (${DAY_LABELS[date.getDay()]})`;
    };
    return `${fmt(r.start)} ~ ${fmt(r.end)}`;
  };

  const renderCatBox = (
    catKey: string,
    catLabel: string,
    catItem: WorkItem | undefined,
    procItems: WorkItem[],
    isCustom = false,
  ) => {
    if (!catItem && procItems.length === 0) return null;
    if (!catLabel?.trim()) return null;
    const borderCls = isCustom ? "border-indigo-100 bg-indigo-50" : "border-gray-100 bg-gray-50";
    const titleCls = isCustom ? "text-indigo-700" : "text-indigo-700";
    const xCls = isCustom ? "text-indigo-300 hover:text-red-500" : "text-gray-300 hover:text-red-500";
    const tagCls = (custom?: boolean) => custom
      ? "border-indigo-200 bg-indigo-50 text-indigo-700"
      : isCustom ? "border-indigo-200 bg-white text-indigo-700" : "border-gray-200 bg-white text-gray-600";
    const inputBorderCls = isCustom ? "border-indigo-200 placeholder:text-indigo-200" : "border-gray-300 placeholder:text-gray-300";
    const scheduleStr = formatScheduleRange(catLabel);

    return (
      <div key={catKey} className={`rounded-xl border p-3 ${borderCls}`}>
        {/* 대공정 헤더 */}
        {catItem && (
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold ${titleCls}`}>
              {catItem.label}
              {scheduleStr && <span className="ml-1.5 font-normal text-gray-500">· {scheduleStr}</span>}
            </span>
            <button type="button" onClick={() => removeCategoryGroup(catLabel)} className={`rounded p-0.5 transition ${xCls}`}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}

        {/* 하위공정 없을 때: 눈에 띄는 추가 영역 */}
        {procItems.length === 0 ? (
          <div className="mt-2">
            <div className="flex gap-2">
              <input type="text"
                value={subInputs[catLabel] ?? ""}
                onChange={(e) => setSubInputs((prev) => ({ ...prev, [catLabel]: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSubItem(catLabel))}
                placeholder="하위공정 입력 (예: 새집증후군, 줄눈시공...)"
                className={`flex-1 rounded-xl border border-dashed bg-white px-3 py-2 text-xs outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 ${inputBorderCls}`}
              />
              <button type="button" onClick={() => addSubItem(catLabel)}
                className="shrink-0 flex items-center gap-1 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-xs font-medium text-indigo-500 hover:bg-indigo-50">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                하위공정 추가
              </button>
            </div>
          </div>
        ) : (
          /* 하위공정 있을 때: 태그 + 인라인 추가 버튼 */
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {procItems.map((item) => (
              <span key={item.key} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${tagCls(item.isCustom)}`}>
                {item.label}
                <button type="button" onClick={() => removeItem(item.key)} className="ml-0.5 text-gray-300 transition hover:text-red-500">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </span>
            ))}
            {/* 인라인 추가 */}
            <div className="flex items-center gap-1">
              <input type="text"
                value={subInputs[catLabel] ?? ""}
                onChange={(e) => setSubInputs((prev) => ({ ...prev, [catLabel]: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSubItem(catLabel))}
                placeholder="추가..."
                className={`w-20 rounded-full border border-dashed bg-white px-2.5 py-1 text-xs outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 ${inputBorderCls}`}
              />
              <button type="button" onClick={() => addSubItem(catLabel)}
                className="flex h-6 w-6 items-center justify-center rounded-full border border-indigo-200 bg-white text-indigo-500 hover:bg-indigo-100">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* 요구사항 + 이미지 */}
        {renderCatDetail(catLabel)}
      </div>
    );
  };

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-transparent px-4 py-4 sm:py-8 top-[var(--header-offset)]">
      <div className="relative flex min-h-0 w-full max-w-xl flex-1 flex-col rounded-2xl bg-white shadow-xl overflow-hidden" style={{ maxHeight: "min(92vh, calc(100svh - 4rem))" }}>
        {validationModal && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-black/50 px-4" onClick={() => setValidationModal(null)}>
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <p className="mt-4 whitespace-pre-line text-sm text-gray-700">{validationModal}</p>
              <button type="button" onClick={() => setValidationModal(null)}
                className="mt-6 w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">
                확인
              </button>
            </div>
          </div>
        )}
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h3 className="text-sm font-bold text-gray-800">{isEdit ? "프로젝트 수정" : "셀인프로젝트 생성"}</h3>
            <p className="mt-0.5 text-xs text-gray-400">{isEdit ? "내용을 수정한 뒤 저장하세요." : "공사 정보를 입력하고 프로젝트를 시작하세요."}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-5 space-y-5 touch-pan-y" style={{ WebkitOverflowScrolling: "touch" }}>

          {/* 프로젝트명 */}
          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">프로젝트명</h4>
            <input
              type="text"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="예) 우리집 전체 리모델링 (미입력 시 자동 생성)"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          {/* 신청자 정보 */}
          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">신청자 정보</h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                { label: "이름", value: formName, set: setFormName, ph: "이름", type: "text" },
                { label: "연락처", value: formPhone, set: (v: string) => setFormPhone(formatPhone(v)), ph: "010-0000-0000", type: "text" },
                { label: "이메일", value: formEmail, set: setFormEmail, ph: "email@example.com", type: "email" },
              ].map(({ label, value, set, ph, type }) => (
                <div key={label}>
                  <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
                  <input type={type} value={value} onChange={(e) => set(e.target.value)} placeholder={ph}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100" />
                </div>
              ))}
            </div>
          </div>

          <hr className="border-gray-100" />

          {/* 현장주소 */}
          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">현장 주소</h4>
            <div className="space-y-2">
              <div className="flex gap-2">
                <input type="text" readOnly value={formAddress1} placeholder="주소 검색 버튼을 클릭하세요" onClick={openPostcode}
                  className="flex-1 cursor-pointer rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 outline-none" />
                <button type="button" onClick={openPostcode}
                  className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-700">주소검색</button>
              </div>
              <input type="text" value={formAddress2} onChange={(e) => setFormAddress2(e.target.value)} placeholder="상세주소 (동/호수, 건물명 등)"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100" />
            </div>
          </div>

          <hr className="border-gray-100" />

          {/* 면적 및 확장여부 */}
          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
              면적 및 확장여부 <span className="ml-1 text-[10px] font-normal normal-case text-gray-300">(선택)</span>
            </h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {/* 공급면적 */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">공급면적</label>
                <div className="flex gap-1.5">
                  <div className="relative flex-1">
                    <input
                      type="number" min="0"
                      value={formSupplyArea}
                      onChange={(e) => setFormSupplyArea(e.target.value.replace(/[^0-9.]/g, ""))}
                      placeholder={formSupplyUnit === "평" ? "예) 25" : "예) 84"}
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 pr-8 text-sm outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">{formSupplyUnit}</span>
                  </div>
                  <button type="button"
                    onClick={() => setFormSupplyUnit((u) => u === "㎡" ? "평" : "㎡")}
                    className="shrink-0 rounded-xl border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-500 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600">
                    {formSupplyUnit === "㎡" ? "평으로" : "㎡로"}
                  </button>
                </div>
                {formSupplyArea && !isNaN(parseFloat(formSupplyArea)) && (
                  <p className="mt-1 text-[10px] text-gray-400">
                    ≈ {formSupplyUnit === "평"
                      ? `${pyeongToM2(parseFloat(formSupplyArea)).toFixed(1)}㎡ 저장`
                      : `${(parseFloat(formSupplyArea) / 3.3058).toFixed(1)}평`}
                  </p>
                )}
              </div>
              {/* 전용면적 */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">전용면적</label>
                <div className="flex gap-1.5">
                  <div className="relative flex-1">
                    <input
                      type="number" min="0"
                      value={formExclusiveArea}
                      onChange={(e) => setFormExclusiveArea(e.target.value.replace(/[^0-9.]/g, ""))}
                      placeholder={formExclusiveUnit === "평" ? "예) 18" : "예) 59"}
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 pr-8 text-sm outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">{formExclusiveUnit}</span>
                  </div>
                  <button type="button"
                    onClick={() => setFormExclusiveUnit((u) => u === "㎡" ? "평" : "㎡")}
                    className="shrink-0 rounded-xl border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-500 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600">
                    {formExclusiveUnit === "㎡" ? "평으로" : "㎡로"}
                  </button>
                </div>
                {formExclusiveArea && !isNaN(parseFloat(formExclusiveArea)) && (
                  <p className="mt-1 text-[10px] text-gray-400">
                    ≈ {formExclusiveUnit === "평"
                      ? `${pyeongToM2(parseFloat(formExclusiveArea)).toFixed(1)}㎡ 저장`
                      : `${(parseFloat(formExclusiveArea) / 3.3058).toFixed(1)}평`}
                  </p>
                )}
              </div>
              {/* 확장여부 */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">확장여부</label>
                <div className="flex gap-2">
                  {[
                    { label: "확장", value: true },
                    { label: "비확장", value: false },
                  ].map(({ label, value }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setFormIsExpanded(formIsExpanded === value ? null : value)}
                      className={`flex-1 rounded-xl border py-2 text-xs font-medium transition ${
                        formIsExpanded === value
                          ? value
                            ? "border-indigo-500 bg-indigo-600 text-white"
                            : "border-gray-500 bg-gray-600 text-white"
                          : "border-gray-200 bg-gray-50 text-gray-500 hover:border-indigo-300 hover:bg-indigo-50"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {formIsExpanded !== null && (
                  <p className="mt-1 text-[10px] text-gray-400">
                    {formIsExpanded ? "✓ 확장 시공 기준으로 견적 산출" : "✓ 비확장 기준으로 견적 산출"}
                  </p>
                )}
              </div>
            </div>
          </div>

          <hr className="border-gray-100" />

          {/* 공사 일정 */}
          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">공사 일정</h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">공사 시작일 <span className="text-red-500">*</span></label>
                <input type="date" value={formStartDate} onChange={(e) => setFormStartDate(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">입주 예정일</label>
                <input type="date" value={formMoveInDate} onChange={(e) => setFormMoveInDate(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100" />
              </div>
            </div>
          </div>

          <hr className="border-gray-100" />

          {/* 공사품목등록 */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400">공사품목등록</h4>
              <span className="text-[11px] text-gray-400">✕ 버튼으로 불필요한 항목 제거 가능</span>
            </div>
            <p className="mb-3 text-[11px] text-gray-400">각 공정별 요구사항과 참고 사진을 첨부할 수 있습니다.</p>

            {categoriesData.length === 0 && !isEdit ? (
              <div className="flex h-12 items-center justify-center text-xs text-gray-400">
                <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
                불러오는 중...
              </div>
            ) : (
              <div className="space-y-2">
                {isEdit && editGrouped.length > 0
                  ? (
                    <>
                      {editGrouped.map(({ catItem, procItems, catLabel }) =>
                        renderCatBox(catItem.key, catLabel, catItem, procItems, true)
                      )}
                      {customCatGroups.map(({ catItem, procItems }) =>
                        renderCatBox(catItem.key, catItem.categoryName, catItem, procItems, true)
                      )}
                    </>
                  )
                  : (
                    <>
                      {adminGrouped.map(({ cat, catItem, procItems }) =>
                        renderCatBox(`cat-${cat.id}`, cat.name, catItem, procItems, false)
                      )}
                      {customCatGroups.map(({ catItem, procItems }) =>
                        renderCatBox(catItem.key, catItem.categoryName, catItem, procItems, true)
                      )}
                    </>
                  )}

                {/* 대공정 직접 추가 */}
                <div className="flex gap-2 pt-1">
                  <input type="text" value={catInput} onChange={(e) => setCatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCatItem())}
                    placeholder="대공정 직접 추가 (예: 조경공사)"
                    className="flex-1 rounded-xl border border-dashed border-gray-300 bg-white px-3 py-2 text-sm outline-none placeholder:text-gray-300 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
                  <button type="button" onClick={addCatItem}
                    className="shrink-0 flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-600 hover:bg-indigo-100">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    대공정 추가
                  </button>
                </div>
              </div>
            )}
          </div>

          {formError && (
            <p className="rounded-xl bg-red-50 px-4 py-2.5 text-xs text-red-600">{formError}</p>
          )}
        </div>

        {/* 푸터 */}
        <div className="border-t border-gray-100 px-6 pt-3">
          {formError && (
            <div className="mb-3 flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-xs text-red-600">
              <svg className="mt-0.5 shrink-0" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{formError}</span>
            </div>
          )}
          <div className="flex gap-2 pb-4">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm text-gray-600 hover:bg-gray-50">취소</button>
            <button type="button" onClick={handleSubmit} disabled={isSubmitting}
              className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
              {isSubmitting ? (isEdit ? "저장 중..." : "생성 중...") : (isEdit ? "저장" : "프로젝트 생성")}
            </button>
          </div>
        </div>
      </div>
    </div>
    <AddressSearchLayer
      open={showAddressSearch}
      onSelect={setFormAddress1}
      onClose={() => setShowAddressSearch(false)}
    />
    </>
  );
}
