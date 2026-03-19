"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { formatArea } from "@/lib/area";

type ProjectSnapshot = {
  title?: string;
  site_address1?: string;
  site_address2?: string;
  supply_area_m2?: number;
  exclusive_area_m2?: number;
  is_expanded?: boolean;
  start_date?: string;
  move_in_date?: string;
  work_tree?: { cat: string; subs: string[] }[];
};

type EstimateRow = {
  id: string;
  project_id: string;
  provider_id: string;
  amounts: Record<string, number>;
  project_snapshot: ProjectSnapshot | null;
  process_schedule: Record<string, unknown> | null;
  provider_business_name: string | null;
  created_at: string;
  updated_at: string;
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

function formatAmount(n: number): string {
  return n.toLocaleString("ko-KR") + "원";
}

export default function EstimateLabPage() {
  const [estimates, setEstimates] = useState<EstimateRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState("");
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { window.location.href = "/login"; return; }
      const { data: profile } = await supabase
        .from("profiles").select("role").eq("user_id", data.session.user.id).maybeSingle();
      if (profile?.role !== "admin" && profile?.role !== "super_admin") {
        window.location.href = "/login";
        return;
      }

      const { data: estData, error } = await supabase
        .from("project_estimates")
        .select("id, project_id, provider_id, amounts, project_snapshot, process_schedule, provider_business_name, created_at, updated_at")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("견적 데이터 조회 오류:", error.message);
      } else {
        setEstimates((estData ?? []) as EstimateRow[]);
      }
      setIsLoading(false);
    };
    check();
  }, []);

  const fmtDate = (d: string) => new Date(d).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

  // 대공정별 필터링
  const filtered = categoryFilter
    ? estimates.filter((e) => Object.keys(e.amounts ?? {}).some((cat) => cat.includes(categoryFilter)))
    : estimates;

  const allCategories = [...new Set(estimates.flatMap((e) => Object.keys(e.amounts ?? {})))].sort();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-800">견적연구소</h1>
        <p className="mt-0.5 text-sm text-gray-500">시공업체로부터 수집된 견적 데이터를 활용합니다.</p>
      </div>

      {/* 필터 */}
      {allCategories.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-500">대공정 필터:</span>
          <button
            type="button"
            onClick={() => setCategoryFilter("")}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${!categoryFilter ? "bg-indigo-600 text-white" : "border border-gray-200 text-gray-600 hover:bg-gray-50"}`}
          >
            전체
          </button>
          {allCategories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${categoryFilter === cat ? "bg-indigo-600 text-white" : "border border-gray-200 text-gray-600 hover:bg-gray-50"}`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* 데이터 요약 */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">총 견적 건수</p>
          <p className="mt-1 text-2xl font-bold text-indigo-600">{filtered.length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">참여 업체 수</p>
          <p className="mt-1 text-2xl font-bold text-blue-600">{new Set(filtered.map((e) => e.provider_id)).size}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">프로젝트 수</p>
          <p className="mt-1 text-2xl font-bold text-green-600">{new Set(filtered.map((e) => e.project_id)).size}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">대공정 종류</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{allCategories.length}</p>
        </div>
      </div>

      {/* 견적 목록 */}
      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left font-semibold text-gray-700">작성일</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">업체명</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">프로젝트</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">평형</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">대공정별 금액</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">업체 제안 합계</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                    아직 수집된 견적 데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                filtered.map((row) => {
                  const snap = row.project_snapshot;
                  const amt = row.amounts ?? {};
                  const total = Object.values(amt).reduce((s, v) => s + (v ?? 0), 0);
                  const areaStr = snap?.supply_area_m2 != null || snap?.exclusive_area_m2 != null
                    ? `${snap?.supply_area_m2 ? formatArea(snap.supply_area_m2) : "—"} / ${snap?.exclusive_area_m2 ? formatArea(snap.exclusive_area_m2) : "—"}`
                    : "—";
                  return (
                    <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-gray-600">{fmtDate(row.created_at)}</td>
                      <td className="px-4 py-3 font-medium text-gray-800">{row.provider_business_name || "—"}</td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-gray-800">{snap?.title || "—"}</p>
                          {snap?.site_address1 && (
                            <p className="text-xs text-gray-500">{snap.site_address1}{snap.site_address2 ? ` ${snap.site_address2}` : ""}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{areaStr}</td>
                      <td className="px-4 py-3">
                        <div className="space-y-0.5">
                          {Object.entries(amt).map(([cat, val]) => (
                            <div key={cat} className="flex items-center gap-2">
                              <span className="text-xs font-medium text-indigo-600">{cat}</span>
                              <span className="text-xs text-gray-700">{formatAmount(val)}</span>
                              {row.process_schedule?.[cat as keyof typeof row.process_schedule] != null ? (
                                <span className="text-[10px] text-gray-400">
                                  {formatScheduleRange(row.process_schedule, cat)}
                                </span>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-800">{formatAmount(total)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
