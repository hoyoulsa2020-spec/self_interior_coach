"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";

type Provider = {
  user_id: string;
  business_name: string;
  owner_name: string;
  phone: string;
  category: unknown;
  work_zone: unknown;
  status: string;
  onboarding_completed: boolean;
  badges: string[];
  created_at: string;
};

type Badge = {
  id: string;
  label: string;
  color: string;
  bg: string;
  border: string;
  dot: string;
};

const BADGES: Badge[] = [
  { id: "sellin_certified",  label: "셀인코치인증",  color: "text-blue-700",   bg: "bg-blue-50",   border: "border-blue-200",  dot: "bg-blue-500"   },
  { id: "consumer_verified", label: "소비자인증",    color: "text-yellow-700", bg: "bg-yellow-50", border: "border-yellow-200", dot: "bg-yellow-400" },
  { id: "warranty_best",     label: "하자보수우수",  color: "text-red-700",    bg: "bg-red-50",    border: "border-red-200",    dot: "bg-red-500"    },
  { id: "good_comm",         label: "소통원활",      color: "text-green-700",  bg: "bg-green-50",  border: "border-green-200",  dot: "bg-green-500"  },
];

function toArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return value.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

const PAGE_SIZE = 20;

export default function ProviderProductsPage() {
  const [ready, setReady] = useState(false);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // 뱃지 모달
  const [badgeTarget, setBadgeTarget] = useState<Provider | null>(null);
  const [selectedBadges, setSelectedBadges] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { window.location.href = "/login"; return; }
      const { data: profile } = await supabase
        .from("profiles").select("role").eq("user_id", data.session.user.id).maybeSingle();
      if (profile?.role !== "admin" && profile?.role !== "super_admin") {
        window.location.href = "/login";
        return;
      }
      setReady(true);
    };
    init();
  }, []);

  const fetchProviders = useCallback(async () => {
    setIsLoading(true);
    const from = (currentPage - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from("profiles")
      .select(
        "user_id, business_name, owner_name, phone, category, work_zone, status, onboarding_completed, badges, created_at",
        { count: "exact" },
      )
      .eq("role", "provider")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (appliedSearch.trim()) {
      const kw = appliedSearch.trim();
      query = query.or(
        `business_name.ilike.%${kw}%,owner_name.ilike.%${kw}%,phone.ilike.%${kw}%,category.ilike.%${kw}%`,
      );
    }

    const { data, count, error } = await query;
    if (error) console.error("업체 조회 오류:", error.message);
    setProviders((data ?? []) as unknown as Provider[]);
    setTotalCount(count ?? 0);
    setIsLoading(false);
  }, [currentPage, appliedSearch]);

  useEffect(() => {
    if (!ready) return;
    fetchProviders();
  }, [ready, fetchProviders]);

  const handleSearch = () => { setCurrentPage(1); setAppliedSearch(search); };

  const openBadgeModal = (p: Provider) => {
    setBadgeTarget(p);
    setSelectedBadges(toArray(p.badges));
  };

  const toggleBadge = (id: string) => {
    setSelectedBadges((prev) =>
      prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id],
    );
  };

  const saveBadges = async () => {
    if (!badgeTarget) return;
    setIsSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ badges: selectedBadges })
      .eq("user_id", badgeTarget.user_id);

    if (!error) {
      setProviders((prev) =>
        prev.map((p) =>
          p.user_id === badgeTarget.user_id ? { ...p, badges: selectedBadges } : p,
        ),
      );
      setBadgeTarget(null);
    } else {
      console.error("뱃지 저장 오류:", error.message);
    }
    setIsSaving(false);
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-800">공급업체 유료상품</h1>
        <p className="mt-0.5 text-sm text-gray-500">업체를 클릭하여 뱃지를 부여하거나 해제합니다.</p>
      </div>

      {/* 뱃지 범례 */}
      <div className="flex flex-wrap gap-2">
        {BADGES.map((b) => (
          <span key={b.id} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${b.bg} ${b.color} ${b.border}`}>
            <span className={`h-2 w-2 rounded-full ${b.dot}`} />
            {b.label}
          </span>
        ))}
      </div>

      {/* 검색 */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="업체명, 대표자, 연락처, 전문분야 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm outline-none placeholder:text-gray-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 sm:w-80"
        />
        <button onClick={handleSearch}
          className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700">
          검색
        </button>
        {appliedSearch && (
          <button onClick={() => { setSearch(""); setAppliedSearch(""); setCurrentPage(1); }}
            className="shrink-0 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-500 hover:bg-gray-50">
            초기화
          </button>
        )}
        <span className="ml-auto shrink-0 text-xs text-gray-400">총 {totalCount}개 업체</span>
      </div>

      {/* 테이블 */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          </div>
        ) : providers.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">
            {appliedSearch ? "검색 결과가 없습니다." : "등록된 공급업체가 없습니다."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold text-gray-500">
                  <th className="px-4 py-3">업체명</th>
                  <th className="hidden px-4 py-3 sm:table-cell">대표자</th>
                  <th className="hidden px-4 py-3 md:table-cell">연락처</th>
                  <th className="hidden px-4 py-3 lg:table-cell">전문분야</th>
                  <th className="px-4 py-3">보유 뱃지</th>
                  <th className="px-4 py-3">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {providers.map((p) => {
                  const categories = toArray(p.category);
                  const badges = toArray(p.badges);
                  return (
                    <tr key={p.user_id} className="transition hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800">{p.business_name || "—"}</div>
                        <div className="mt-0.5 text-xs text-gray-400">{p.status === "active" ? "활성" : "비활성"}</div>
                      </td>
                      <td className="hidden px-4 py-3 text-gray-600 sm:table-cell">{p.owner_name || "—"}</td>
                      <td className="hidden px-4 py-3 md:table-cell">
                        {p.phone ? (
                          <a href={`tel:${p.phone}`} className="text-indigo-600 hover:underline">{p.phone}</a>
                        ) : "—"}
                      </td>
                      <td className="hidden px-4 py-3 lg:table-cell">
                        {categories.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {categories.map((c) => (
                              <span key={c} className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">{c}</span>
                            ))}
                          </div>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {badges.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {badges.map((bid) => {
                              const badge = BADGES.find((b) => b.id === bid);
                              if (!badge) return null;
                              return (
                                <span key={bid} title={badge.label}>
                                  {/* 모바일: 점만 표시 */}
                                  <span className={`block h-3 w-3 rounded-full sm:hidden ${badge.dot}`} />
                                  {/* sm 이상: 전체 뱃지 */}
                                  <span className={`hidden sm:inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${badge.bg} ${badge.color} ${badge.border}`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
                                    {badge.label}
                                  </span>
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300">없음</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => openBadgeModal(p)}
                          className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-600 transition hover:bg-indigo-100"
                        >
                          뱃지 관리
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button type="button" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => p - 1)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40">
            이전
          </button>
          <div className="flex gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
              .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
                acc.push(p);
                return acc;
              }, [])
              .map((item, idx) =>
                item === "..." ? (
                  <span key={`e${idx}`} className="px-2 py-1.5 text-sm text-gray-400">…</span>
                ) : (
                  <button key={item} type="button" onClick={() => setCurrentPage(item as number)}
                    className={`min-w-[32px] rounded-lg border px-2 py-1.5 text-sm ${
                      currentPage === item
                        ? "border-indigo-600 bg-indigo-600 font-semibold text-white"
                        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                    }`}>
                    {item}
                  </button>
                ),
              )}
          </div>
          <button type="button" disabled={currentPage === totalPages} onClick={() => setCurrentPage((p) => p + 1)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40">
            다음
          </button>
        </div>
      )}

      {/* 뱃지 관리 모달 */}
      {badgeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl">
            {/* 헤더 */}
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">{badgeTarget.business_name}</h3>
                <p className="mt-0.5 text-xs text-gray-400">부여할 뱃지를 선택하세요</p>
              </div>
              <button type="button" onClick={() => setBadgeTarget(null)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* 뱃지 선택 */}
            <div className="px-5 py-4 space-y-3">
              {BADGES.map((badge) => {
                const active = selectedBadges.includes(badge.id);
                return (
                  <button
                    key={badge.id}
                    type="button"
                    onClick={() => toggleBadge(badge.id)}
                    className={`flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition ${
                      active ? `${badge.border} ${badge.bg}` : "border-gray-100 hover:border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${active ? badge.dot : "bg-gray-100"}`}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={active ? "white" : "#9ca3af"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                    <div>
                      <p className={`text-sm font-semibold ${active ? badge.color : "text-gray-700"}`}>{badge.label}</p>
                    </div>
                    <span className={`ml-auto h-5 w-5 shrink-0 rounded-full border-2 transition ${
                      active ? `${badge.dot} border-transparent` : "border-gray-300"
                    }`}>
                      {active && (
                        <svg className="h-full w-full" viewBox="0 0 20 20" fill="white">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* 푸터 */}
            <div className="flex gap-2 border-t border-gray-100 px-5 py-4">
              <button type="button" onClick={() => setBadgeTarget(null)}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm text-gray-600 hover:bg-gray-50">
                취소
              </button>
              <button type="button" onClick={saveBadges} disabled={isSaving}
                className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                {isSaving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
