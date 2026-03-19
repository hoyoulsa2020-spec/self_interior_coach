"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import ProviderSearchBar from "@/components/ProviderSearchBar";

type WorkTreeItem = { cat: string; subs: string[] };
type WorkDetail = { requirements: string; image_urls: string[]; subs?: string[] };

type ProjectWithMeta = {
  id: string;
  title: string;
  work_tree: WorkTreeItem[] | null;
  work_details: Record<string, WorkDetail> | null;
  process_schedule: Record<string, unknown> | null;
};

type CompletedCategory = {
  category: string;
  subs: string[];
  requirements: string | null;
  providerId: string;
  providerBusinessName: string;
  providerPhone: string | null;
  providerEmail: string | null;
  providerAddress: string;
  ownerName: string;
  scheduleStr: string;
  estimateAmount: number | null;
};

type ProjectGroup = {
  project: ProjectWithMeta;
  categories: CompletedCategory[];
};

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function PhoneLink({ phone }: { phone: string | null }) {
  if (!phone) return <span className="text-gray-700">—</span>;
  const digits = phone.replace(/\D/g, "");
  return (
    <span className="inline-flex items-center gap-2">
      <a
        href={`tel:${digits}`}
        className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-2.5 py-1 text-sm font-medium text-gray-700 transition hover:bg-gray-200"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6.29 6.29l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
        {phone}
      </a>
    </span>
  );
}

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

const ACCEPT_FILES = "image/*,.pdf,.xlsx,.xls,.csv,.doc,.docx";

function InquiryModal({
  providerBusinessName,
  providerId,
  projectId,
  projectTitle,
  category,
  categorySubs,
  scheduleStr,
  consumerId,
  onClose,
  onSuccess,
}: {
  providerBusinessName: string;
  providerId: string;
  projectId: string;
  projectTitle: string;
  category: string;
  categorySubs: string[];
  scheduleStr: string;
  consumerId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formFiles, setFormFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const removeFile = (idx: number) =>
    setFormFiles((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = async () => {
    if (!formTitle.trim() || !formContent.trim()) {
      setFormError("제목과 내용을 모두 입력해주세요.");
      return;
    }
    setFormError(null);
    setIsSubmitting(true);

    const { data: profile } = await supabase.from("profiles").select("name, phone, email").eq("user_id", consumerId).maybeSingle();
    const consumerName = profile?.name ?? null;
    const consumerPhone = profile?.phone ?? null;
    const consumerEmail = profile?.email ?? null;

    const fileUrls: string[] = [];
    for (const file of formFiles) {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${consumerId}/consumer-provider/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("inquiry-images")
        .upload(path, file);
      if (uploadError) {
        setFormError(`파일 업로드 오류: ${uploadError.message}`);
        setIsSubmitting(false);
        return;
      }
      const { data: urlData } = supabase.storage.from("inquiry-images").getPublicUrl(path);
      fileUrls.push(urlData.publicUrl);
    }

    const { error } = await supabase.from("consumer_provider_inquiries").insert({
      consumer_id: consumerId,
      provider_id: providerId,
      project_id: projectId || null,
      project_title: projectTitle || null,
      category: category || null,
      category_subs: categorySubs || [],
      category_schedule_date: scheduleStr || null,
      title: formTitle.trim(),
      content: formContent.trim(),
      file_urls: fileUrls,
      consumer_name: consumerName,
      consumer_phone: consumerPhone,
      consumer_email: consumerEmail,
    });

    if (error) {
      setFormError(error.message);
      setIsSubmitting(false);
      return;
    }

    onSuccess();
    onClose();
    setIsSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl"
        style={{ maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h3 className="text-sm font-semibold text-gray-800">{providerBusinessName} 문의하기</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <p className="px-5 pt-2 text-xs text-gray-500">{category} 공정 담당 업체</p>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">제목 <span className="text-red-500">*</span></label>
            <input
              type="text"
              placeholder="문의 제목을 입력하세요"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm outline-none placeholder:text-gray-400 focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">내용 <span className="text-red-500">*</span></label>
            <textarea
              placeholder="문의 내용을 자세히 입력해주세요"
              value={formContent}
              onChange={(e) => setFormContent(e.target.value)}
              rows={6}
              className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm outline-none placeholder:text-gray-400 focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">파일 첨부 (선택)</label>
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const files = Array.from(e.dataTransfer.files);
                if (files.length) setFormFiles((prev) => [...prev, ...files]);
              }}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed py-8 text-gray-400 transition
                ${isDragging ? "border-indigo-400 bg-indigo-50 text-indigo-500 scale-[1.01]" : "border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-500"}`}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              {isDragging ? (
                <p className="mt-2 text-xs font-medium text-indigo-500">여기에 놓으세요!</p>
              ) : (
                <>
                  <p className="mt-2 text-xs font-medium">파일을 드래그하거나 클릭하여 추가</p>
                  <p className="mt-0.5 text-[11px] text-gray-300">이미지, PDF, 엑셀, 문서 등</p>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_FILES}
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                setFormFiles((prev) => [...prev, ...files]);
                e.target.value = "";
              }}
            />

            {formFiles.length > 0 && (
              <div className="mt-3 space-y-2">
                {formFiles.map((file, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-sm text-gray-700">{file.name}</span>
                    <button type="button" onClick={() => removeFile(i)} className="shrink-0 rounded p-1 text-red-500 hover:bg-red-50">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {formError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{formError}</p>
          )}
        </div>

        <div className="flex gap-2 border-t border-gray-100 px-5 py-4">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm text-gray-600 hover:bg-gray-50">
            취소
          </button>
          <button type="button" onClick={handleSubmit} disabled={isSubmitting}
            className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {isSubmitting ? "제출 중..." : "문의 제출"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProvidersEstimatePage() {
  const [groups, setGroups] = useState<ProjectGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [consumerId, setConsumerId] = useState<string | null>(null);
  const [inquiryModal, setInquiryModal] = useState<{
    providerId: string;
    providerBusinessName: string;
    projectId: string;
    projectTitle: string;
    category: string;
    categorySubs: string[];
    scheduleStr: string;
  } | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      if (!session) {
        setIsLoading(false);
        return;
      }
      const uid = session.user.id;
      setConsumerId(uid);

      const { data: projectsData } = await supabase
        .from("projects")
        .select("id, title, work_tree, work_details, process_schedule")
        .eq("user_id", uid)
        .order("created_at", { ascending: false });
      const projectIds = (projectsData ?? []).map((p) => p.id);
      const projectMap = new Map((projectsData ?? []).map((p) => [p.id, p as ProjectWithMeta]));

      if (projectIds.length === 0) {
        setGroups([]);
        setIsLoading(false);
        return;
      }

      const { data: assignData } = await supabase
        .from("project_category_assignments")
        .select("project_id, category, provider_id")
        .in("project_id", projectIds)
        .eq("match_status", "completed");

      if (!assignData || assignData.length === 0) {
        setGroups([]);
        setIsLoading(false);
        return;
      }

      const providerIds = [...new Set(assignData.map((r) => r.provider_id))];

      const { data: estData } = await supabase
        .from("project_estimates")
        .select("project_id, provider_id, amounts")
        .in("project_id", projectIds)
        .in("provider_id", providerIds);
      const estMap = new Map<string, Record<string, number>>();
      (estData ?? []).forEach((row) => {
        const key = `${row.project_id}-${row.provider_id}`;
        estMap.set(key, (row.amounts as Record<string, number>) ?? {});
      });

      const { data: profData } = await supabase
        .from("profiles")
        .select("user_id, business_name, owner_name, phone, email, address1, address2")
        .in("user_id", providerIds);
      const profMap = new Map(
        (profData ?? []).map((r) => [
          r.user_id,
          {
            business_name: r.business_name ?? "업체",
            owner_name: r.owner_name ?? "",
            phone: r.phone ?? null,
            email: r.email ?? null,
            address: [r.address1, r.address2].filter(Boolean).join(" ") || "—",
          },
        ])
      );

      const byProject = new Map<string, CompletedCategory[]>();
      for (const row of assignData) {
        const project = projectMap.get(row.project_id);
        if (!project) continue;
        const prof = profMap.get(row.provider_id);
        const subs = (() => {
          let groups: WorkTreeItem[] = project.work_tree ?? [];
          if (groups.length === 0 && project.work_details) {
            const cats = Object.keys(project.work_details);
            if (cats.length > 0) {
              groups = cats.map((cat) => ({
                cat,
                subs: (project.work_details![cat] as WorkDetail).subs ?? [],
              }));
            }
          }
          const found = groups.find((g) => g.cat === row.category);
          return found?.subs ?? [];
        })();
        const scheduleStr = formatScheduleDate(project.process_schedule, row.category);
        const detail = project.work_details?.[row.category] as WorkDetail | undefined;
        const requirements = detail?.requirements?.trim() || null;
        const estKey = `${row.project_id}-${row.provider_id}`;
        const amounts = estMap.get(estKey);
        const estimateAmount = amounts?.[row.category] ?? null;
        const cat: CompletedCategory = {
          category: row.category,
          subs,
          requirements,
          providerId: row.provider_id,
          providerBusinessName: prof?.business_name ?? "업체",
          providerPhone: prof?.phone ?? null,
          providerEmail: prof?.email ?? null,
          providerAddress: prof?.address ?? "—",
          ownerName: prof?.owner_name ?? "",
          scheduleStr,
          estimateAmount: estimateAmount != null && estimateAmount >= 0 ? estimateAmount : null,
        };
        if (!byProject.has(row.project_id)) byProject.set(row.project_id, []);
        byProject.get(row.project_id)!.push(cat);
      }

      const result: ProjectGroup[] = [];
      for (const project of projectsData ?? []) {
        const categories = byProject.get(project.id);
        if (categories && categories.length > 0) {
          result.push({ project: project as ProjectWithMeta, categories });
        }
      }
      setGroups(result);
      setIsLoading(false);
    };
    load();
  }, []);

  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => {
      const title = (g.project.title ?? "").toLowerCase();
      const cats = g.categories.map((c) => c.category.toLowerCase()).join(" ");
      const providers = g.categories.map((c) => c.providerBusinessName.toLowerCase()).join(" ");
      const addr = ""; // projects might have address in full data
      return title.includes(q) || cats.includes(q) || providers.includes(q);
    });
  }, [groups, searchQuery]);

  const projectTotals = useMemo(() => {
    const map = new Map<string, number>();
    groups.forEach((g) => {
      const total = g.categories.reduce((s, c) => s + (c.estimateAmount ?? 0), 0);
      map.set(g.project.id, total);
    });
    return map;
  }, [groups]);

  const toggleProject = (id: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const formatMoney = (n: number) => n.toLocaleString("ko-KR");

  if (isLoading) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">시공업체 견적확인</h1>
          <p className="mt-0.5 text-sm text-gray-500">계약완료된 대공정을 프로젝트별로 확인하세요.</p>
        </div>
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        </div>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">시공업체 견적확인</h1>
          <p className="mt-0.5 text-sm text-gray-500">계약완료된 대공정을 프로젝트별로 확인하세요.</p>
        </div>
        <ProviderSearchBar value={searchQuery} onChange={setSearchQuery} placeholder="프로젝트명, 대공정, 업체명으로 검색" />
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white py-20 text-center shadow-sm">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-400">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
          <p className="mt-4 text-sm font-medium text-gray-700">아직 계약완료된 대공정이 없습니다</p>
          <p className="mt-1 text-xs text-gray-400">내 프로젝트에서 업체를 선택하고 거래진행을 완료하면 여기에 표시됩니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-800">시공업체 견적확인</h1>
        <p className="mt-0.5 text-sm text-gray-500">계약완료된 대공정을 프로젝트별로 확인하세요.</p>
      </div>

      <ProviderSearchBar
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="프로젝트명, 대공정, 업체명으로 검색"
      />

      {filteredGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white py-20 text-center shadow-sm">
          <p className="text-sm font-medium text-gray-400">
            {groups.length === 0 ? "아직 계약완료된 대공정이 없습니다" : "검색 결과가 없습니다."}
          </p>
        </div>
      ) : (
      <div className="space-y-4">
        {filteredGroups.map(({ project, categories }) => {
          const isExpanded = expandedProjects.has(project.id);
          const total = projectTotals.get(project.id) ?? 0;
          return (
          <div key={project.id} className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={() => toggleProject(project.id)}
              className="flex w-full items-center justify-between gap-3 border-b border-gray-100 bg-gray-50 px-5 py-4 text-left hover:bg-gray-100"
            >
              <div className="flex items-center gap-2">
                <span className={`shrink-0 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </span>
                <h2 className="text-base font-bold text-gray-900">{project.title || "프로젝트"}</h2>
              </div>
              {total > 0 && (
                <span className="rounded-lg bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-700">
                  ₩{formatMoney(total)}
                </span>
              )}
            </button>
            {isExpanded && (
            <div className="divide-y divide-gray-100">
              {categories.map((cat) => (
                <div key={cat.category} className="px-5 py-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-gray-800">{cat.category}</p>
                        {cat.estimateAmount != null && (
                          <span className="rounded-lg bg-emerald-50 px-2.5 py-0.5 text-sm font-semibold text-emerald-700">
                            ₩{formatMoney(cat.estimateAmount)}
                          </span>
                        )}
                      </div>
                      {cat.subs.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5 text-sm text-gray-600">
                          {cat.subs.map((sub) => (
                            <li key={sub} className="flex items-center gap-1.5">
                              <span className="text-gray-400">·</span>
                              {sub}
                            </li>
                          ))}
                        </ul>
                      )}
                      {cat.requirements && (
                        <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                          <p className="mb-1.5 text-xs font-semibold text-gray-600">나의 요구사항</p>
                          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{cat.requirements}</p>
                        </div>
                      )}
                      <div className="mt-3 space-y-1 text-sm">
                        <p><span className="text-gray-500">진행업체:</span> <span className="font-medium text-gray-800">{cat.providerBusinessName}</span></p>
                        <p className="flex flex-wrap items-center gap-2"><span className="text-gray-500 shrink-0">업체 연락처:</span> <PhoneLink phone={cat.providerPhone} /></p>
                        <p><span className="text-gray-500">사업자주소지:</span> <span className="text-gray-700">{cat.providerAddress}</span></p>
                        <p><span className="text-gray-500">사장이름:</span> <span className="text-gray-700">{cat.ownerName || "—"}</span></p>
                        <p><span className="text-gray-500">공정진행일자:</span> <span className="text-gray-700">{cat.scheduleStr}</span></p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center sm:items-start">
                      <button
                        type="button"
                        onClick={() => setInquiryModal({
                          providerId: cat.providerId,
                          providerBusinessName: cat.providerBusinessName,
                          projectId: project.id,
                          projectTitle: project.title || "프로젝트",
                          category: cat.category,
                          categorySubs: cat.subs,
                          scheduleStr: cat.scheduleStr,
                        })}
                        className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 sm:w-auto"
                      >
                        문의하기
                      </button>
                    </div>
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

      {inquiryModal && consumerId && (
        <InquiryModal
          providerBusinessName={inquiryModal.providerBusinessName}
          providerId={inquiryModal.providerId}
          projectId={inquiryModal.projectId}
          projectTitle={inquiryModal.projectTitle}
          category={inquiryModal.category}
          categorySubs={inquiryModal.categorySubs}
          scheduleStr={inquiryModal.scheduleStr}
          consumerId={consumerId}
          onClose={() => setInquiryModal(null)}
          onSuccess={() => {}}
        />
      )}
    </div>
  );
}
