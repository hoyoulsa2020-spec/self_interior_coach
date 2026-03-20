"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { formatArea } from "@/lib/area";

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

type WorkTreeItem = { cat: string; subs: string[] };
type WorkDetail = { requirements: string; image_urls: string[]; subs?: string[] };

const ONE_HOUR_MS = 60 * 60 * 1000;

function formatRemainingPublishCancel(publishRequestedAt: string | null): string | null {
  if (!publishRequestedAt) return null;
  const deadline = new Date(publishRequestedAt).getTime() + ONE_HOUR_MS;
  const remaining = deadline - Date.now();
  if (remaining <= 0) return null;
  const m = Math.floor(remaining / 60_000);
  const s = Math.floor((remaining % 60_000) / 1000);
  if (m > 0) return `${m}분 ${s}초 남음`;
  return `${s}초 남음`;
}

type Project = {
  id: string;
  user_id: string;
  title: string;
  status: string;
  publish_requested_at: string | null;
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
  work_tree: WorkTreeItem[] | null;
  work_details: Record<string, WorkDetail> | null;
  process_schedule?: Record<string, unknown> | null;
  created_at: string;
};

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

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  active:            { label: "진행중",        color: "bg-green-50 text-green-700" },
  pending:           { label: "대기중",        color: "bg-yellow-50 text-yellow-700" },
  publish_requested: { label: "최종발행요청",   color: "bg-orange-50 text-orange-700" },
  estimate_waiting:  { label: "견적대기",      color: "bg-blue-50 text-blue-700" },
  completed:         { label: "완료",          color: "bg-blue-50 text-blue-700" },
  cancelled:         { label: "취소",          color: "bg-gray-100 text-gray-500" },
};

const STATUS_OPTIONS = [
  { value: "pending",           label: "대기중" },
  { value: "publish_requested", label: "최종발행요청" },
  { value: "estimate_waiting", label: "견적대기" },
  { value: "active",            label: "진행중" },
  { value: "completed",         label: "완료" },
  { value: "cancelled",        label: "취소" },
];

const PAGE_SIZE = 20;

export default function AdminProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<Project | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  const [tick, setTick] = useState(0);
  const initializedRef = useRef(false);

  // 실시간 카운트 (1초마다 갱신)
  useEffect(() => {
    const hasCountdown = projects.some(
      (p) => p.status === "publish_requested" && p.publish_requested_at
    );
    if (!hasCountdown) return;
    const iv = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(iv);
  }, [projects]);

  const fetchProjects = useCallback(async (page: number, sq: string, sf: string) => {
    setIsLoading(true);
    // 1시간 경과한 publish_requested → estimate_waiting 자동 전환
    const { data: toCheck } = await supabase.from("projects").select("id, publish_requested_at").eq("status", "publish_requested");
    const now = Date.now();
    for (const p of toCheck ?? []) {
      if (p.publish_requested_at) {
        const requestedAt = new Date(p.publish_requested_at).getTime();
        if (now - requestedAt >= ONE_HOUR_MS) {
          await supabase.from("projects").update({ status: "estimate_waiting" }).eq("id", p.id);
          try {
            const { data } = await supabase.auth.getSession();
            if (data?.session?.access_token) {
              await fetch("/api/push/estimate-waiting", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
                body: JSON.stringify({ projectId: p.id }),
              });
            }
          } catch {
            /* ignore push failure */
          }
        }
      }
    }

    let q = supabase
      .from("projects")
      .select("id, user_id, title, status, publish_requested_at, contact_name, contact_phone, contact_email, site_address1, site_address2, start_date, move_in_date, supply_area_m2, exclusive_area_m2, is_expanded, category, work_tree, work_details, process_schedule, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

    if (sf !== "all") q = q.eq("status", sf);
    if (sq.trim()) {
      q = q.or(
        `title.ilike.%${sq}%,contact_name.ilike.%${sq}%,contact_phone.ilike.%${sq}%,site_address1.ilike.%${sq}%`
      );
    }

    const { data, count, error } = await q;
    if (error) console.error("프로젝트 조회 오류:", error.message);
    setProjects(data ?? []);
    setTotalCount(count ?? 0);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    fetchProjects(1, "", "all");
  }, [fetchProjects]);

  const handleSearch = () => {
    setAppliedSearch(search);
    setCurrentPage(1);
    fetchProjects(1, search, statusFilter);
  };

  const handleStatusFilter = (sf: string) => {
    setStatusFilter(sf);
    setCurrentPage(1);
    fetchProjects(1, appliedSearch, sf);
  };

  const handlePage = (p: number) => {
    setCurrentPage(p);
    fetchProjects(p, appliedSearch, statusFilter);
  };

  const handleStatusChange = async (projectId: string, newStatus: string) => {
    setSavingStatus(true);
    await supabase.from("projects").update({ status: newStatus }).eq("id", projectId);
    if (newStatus === "estimate_waiting") {
      try {
        const { data } = await supabase.auth.getSession();
        if (data?.session?.access_token) {
          await fetch("/api/push/estimate-waiting", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
            body: JSON.stringify({ projectId }),
          });
        }
      } catch {
        /* ignore push failure */
      }
    }
    setSavingStatus(false);
    if (selected?.id === projectId) setSelected((prev) => prev ? { ...prev, status: newStatus } : prev);
    fetchProjects(currentPage, appliedSearch, statusFilter);
  };

  const approvePublishRequest = async (projectId: string) => {
    await handleStatusChange(projectId, "estimate_waiting");
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const fmtDate = (d: string) => new Date(d).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });

  const getGroups = (p: Project): WorkTreeItem[] => {
    if (p.work_tree && p.work_tree.length > 0) return p.work_tree;
    if (p.work_details) {
      return Object.keys(p.work_details).map((cat) => ({
        cat,
        subs: p.work_details![cat].subs ?? [],
      }));
    }
    return [];
  };

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div>
        <h1 className="text-xl font-semibold text-gray-800">프로젝트 관리</h1>
        <p className="mt-0.5 text-sm text-gray-500">소비자가 등록한 셀인 프로젝트를 관리합니다.</p>
      </div>

      {/* 필터 + 검색 */}
      <div className="flex flex-wrap items-center gap-2">
        {["all", "pending", "publish_requested", "estimate_waiting", "active", "completed", "cancelled"].map((s) => (
          <button key={s} type="button" onClick={() => handleStatusFilter(s)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${statusFilter === s ? "bg-indigo-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
            {s === "all" ? "전체" : STATUS_LABEL[s]?.label ?? s}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="이름·연락처·주소·제목 검색"
            className="w-64 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
          <button onClick={handleSearch}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">검색</button>
        </div>
      </div>

      {/* 테이블 */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-4 py-3 text-left">등록일</th>
              <th className="px-4 py-3 text-left">신청자</th>
              <th className="px-4 py-3 text-left">연락처</th>
              <th className="px-4 py-3 text-left">프로젝트명</th>
              <th className="hidden px-4 py-3 text-left md:table-cell">현장주소</th>
              <th className="hidden px-4 py-3 text-left lg:table-cell">공사시작</th>
              <th className="px-4 py-3 text-left">상태</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">불러오는 중...</td></tr>
            ) : projects.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">등록된 프로젝트가 없습니다.</td></tr>
            ) : projects.map((p) => {
              const si = STATUS_LABEL[p.status] ?? { label: p.status, color: "bg-gray-100 text-gray-500" };
              return (
                <tr key={p.id} onClick={() => setSelected(p)}
                  className="cursor-pointer hover:bg-indigo-50/40 transition">
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDate(p.created_at)}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{p.contact_name || "—"}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{p.contact_phone || "—"}</td>
                  <td className="px-4 py-3 text-gray-800 max-w-[180px] truncate">{p.title || "—"}</td>
                  <td className="hidden px-4 py-3 text-gray-500 text-xs max-w-[160px] truncate md:table-cell">{p.site_address1 || "—"}</td>
                  <td className="hidden px-4 py-3 text-gray-500 text-xs whitespace-nowrap lg:table-cell">{p.start_date ? fmtDate(p.start_date) : "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${si.color}`}>{si.label}</span>
                      {p.status === "publish_requested" && (() => {
                        const remaining = formatRemainingPublishCancel(p.publish_requested_at);
                        return remaining ? (
                          <span className="text-[11px] text-orange-600 font-medium">({remaining})</span>
                        ) : null;
                      })()}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1">
          <button onClick={() => handlePage(currentPage - 1)} disabled={currentPage === 1}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 disabled:opacity-40 hover:bg-gray-50">이전</button>
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map((p) => (
            <button key={p} onClick={() => handlePage(p)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${currentPage === p ? "bg-indigo-600 text-white" : "border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>{p}</button>
          ))}
          <button onClick={() => handlePage(currentPage + 1)} disabled={currentPage === totalPages}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 disabled:opacity-40 hover:bg-gray-50">다음</button>
        </div>
      )}

      {/* 상세 모달 */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSelected(null)}>
          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4 z-10">
              <h2 className="text-base font-bold text-gray-900 truncate pr-4">{selected.title || "제목 없음"}</h2>
              <button onClick={() => setSelected(null)} className="shrink-0 rounded-lg p-1 text-gray-400 hover:bg-gray-100">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* 기본 정보 */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ["신청자", selected.contact_name],
                  ["연락처", selected.contact_phone],
                  ["이메일", selected.contact_email],
                  ["현장주소", [selected.site_address1, selected.site_address2].filter(Boolean).join(" ")],
                  ["공사시작일", selected.start_date ? fmtDate(selected.start_date) : null],
                  ["입주일", selected.move_in_date ? fmtDate(selected.move_in_date) : null],
                  ["공급면적", selected.supply_area_m2 ? formatArea(selected.supply_area_m2) : null],
                  ["전용면적", selected.exclusive_area_m2 ? formatArea(selected.exclusive_area_m2) : null],
                  ["확장여부", selected.is_expanded == null ? null : selected.is_expanded ? "확장" : "비확장"],
                  ["등록일", fmtDate(selected.created_at)],
                ].filter(([, v]) => v).map(([k, v]) => (
                  <div key={k as string}>
                    <p className="text-[11px] text-gray-400">{k}</p>
                    <p className="font-medium text-gray-800">{v}</p>
                  </div>
                ))}
              </div>

              {/* 최종발행요청 승인 — 시간 상관없이 즉시 견적대기로 */}
              {selected.status === "publish_requested" && (
                <div className="rounded-xl border-2 border-orange-200 bg-orange-50 p-4">
                  <p className="mb-2 text-xs font-semibold text-orange-700">최종발행요청 승인</p>
                  <p className="mb-2 text-xs text-orange-600">승인 시 즉시 견적대기로 변경됩니다. (일반적으로는 1시간 후 자동 전환)</p>
                  {formatRemainingPublishCancel(selected.publish_requested_at) && (
                    <p className="mb-3 text-xs font-semibold text-orange-700">자동 전환까지: {formatRemainingPublishCancel(selected.publish_requested_at)}</p>
                  )}
                  <button type="button" onClick={() => approvePublishRequest(selected.id)} disabled={savingStatus}
                    className="rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50">
                    {savingStatus ? "처리 중..." : "즉시 견적대기로 변경"}
                  </button>
                </div>
              )}

              {/* 견적대기: 업체가 견적 입력 시 자동으로 진행중 전환 (관리자 수동 변경 불가) */}
              {selected.status === "estimate_waiting" && (
                <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-4">
                  <p className="mb-1 text-xs font-semibold text-blue-700">견적대기</p>
                  <p className="text-xs text-blue-600">업체가 견적을 입력하면 자동으로 진행중으로 전환됩니다.</p>
                </div>
              )}

              {/* 상태 변경 (견적대기 → 진행중은 업체 견적 입력 시 자동 전환) */}
              <div>
                <p className="mb-2 text-xs font-semibold text-gray-500">상태 변경</p>
                <div className="flex gap-2 flex-wrap">
                  {STATUS_OPTIONS.map((opt) => {
                    const isEstimateWaitingToActive = selected.status === "estimate_waiting" && opt.value === "active";
                    return (
                      <button key={opt.value} type="button" disabled={savingStatus || isEstimateWaitingToActive}
                        onClick={() => handleStatusChange(selected.id, opt.value)}
                        className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition disabled:opacity-50 ${selected.status === opt.value ? "bg-indigo-600 text-white" : "border border-gray-200 text-gray-600 hover:bg-gray-50"} ${isEstimateWaitingToActive ? "cursor-not-allowed" : ""}`}>
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 공사 항목 */}
              {(() => {
                const groups = getGroups(selected);
                if (groups.length === 0) {
                  const flat = selected.category ?? [];
                  return flat.length > 0 ? (
                    <div>
                      <p className="mb-2 text-xs font-semibold text-gray-500">공사 항목</p>
                      <div className="flex flex-wrap gap-1">
                        {flat.map((c) => <span key={c} className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs text-gray-600">{c}</span>)}
                      </div>
                    </div>
                  ) : null;
                }
                return (
                  <div>
                    <p className="mb-3 text-xs font-semibold text-gray-500">공사 항목</p>
                    <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 overflow-hidden">
                      {groups.map((g, gi) => {
                        const detail = selected.work_details?.[g.cat];
                        const scheduleStr = formatScheduleRange(selected.process_schedule ?? null, g.cat);
                        return (
                          <div key={g.cat} className="px-4 py-3">
                            <p className="text-sm font-bold text-gray-900">
                              <span className="mr-1.5 text-indigo-500">{gi + 1}.</span>{g.cat}
                              {scheduleStr && <span className="ml-1.5 font-normal text-gray-500">· {scheduleStr}</span>}
                            </p>
                            {g.subs.length > 0 && (
                              <ol className="mt-1.5 space-y-0.5 pl-4">
                                {g.subs.map((s, si) => (
                                  <li key={s} className="text-xs text-gray-600">
                                    <span className="mr-1 text-gray-400">{si + 1}.</span>{s}
                                  </li>
                                ))}
                              </ol>
                            )}
                            {detail?.requirements && (
                              <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                                <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">고객 요구사항</p>
                                <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-line">{detail.requirements}</p>
                              </div>
                            )}
                            {detail?.image_urls && detail.image_urls.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {detail.image_urls.map((url, i) => (
                                  <button key={i} type="button" className="shrink-0"
                                    onClick={() => setLightbox({ urls: detail.image_urls, index: i })}>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={url} alt={`참고사진 ${i + 1}`}
                                      className="h-16 w-16 rounded-lg object-cover border border-gray-200 hover:opacity-80 transition" />
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
      {lightbox && <Lightbox urls={lightbox.urls} index={lightbox.index} onClose={() => setLightbox(null)} />}
    </div>
  );
}
