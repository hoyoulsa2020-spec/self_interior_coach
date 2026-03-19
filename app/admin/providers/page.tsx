"use client";

// profiles 테이블 필요 컬럼:
// - business_name: TEXT — 업체명
// - owner_name: TEXT — 대표자명
// - phone: TEXT — 연락처
// - status: TEXT ('pending' | 'active') — 활성화 여부
// - onboarding_completed: BOOLEAN — 온보딩 완료 여부
// - created_at: TIMESTAMPTZ DEFAULT NOW() — 가입일

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// TODO: bid_count(입찰시도), match_count(매칭성공)는 추후 별도 테이블 집계로 교체 예정
// 현재는 profiles 테이블의 컬럼으로 관리 (기본값 0)
// SQL: ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bid_count INT DEFAULT 0;
// SQL: ALTER TABLE profiles ADD COLUMN IF NOT EXISTS match_count INT DEFAULT 0;
const BADGES = [
  { id: "sellin_certified",  label: "셀인코치인증",  dot: "bg-blue-500"   },
  { id: "consumer_verified", label: "소비자인증",    dot: "bg-yellow-400" },
  { id: "warranty_best",     label: "하자보수우수",  dot: "bg-red-500"    },
  { id: "good_comm",         label: "소통원활",      dot: "bg-green-500"  },
];

const BADGE_FULL = [
  { id: "sellin_certified",  label: "셀인코치인증",  bg: "bg-blue-50",   color: "text-blue-700",   border: "border-blue-200",  dot: "bg-blue-500"   },
  { id: "consumer_verified", label: "소비자인증",    bg: "bg-yellow-50", color: "text-yellow-700", border: "border-yellow-200", dot: "bg-yellow-400" },
  { id: "warranty_best",     label: "하자보수우수",  bg: "bg-red-50",    color: "text-red-700",    border: "border-red-200",    dot: "bg-red-500"    },
  { id: "good_comm",         label: "소통원활",      bg: "bg-green-50",  color: "text-green-700",  border: "border-green-200",  dot: "bg-green-500"  },
];

type Provider = {
  user_id: string;
  name: string;
  business_name: string;
  owner_name: string;
  phone: string;
  status: string;
  onboarding_completed: boolean;
  category: unknown;
  work_zone: unknown;
  badges: string[] | null;
  warranty_period: string | null;
  bid_count: number;
  match_count: number;
  created_at: string;
};

type ProviderDetail = {
  user_id: string;
  name: string;
  email: string;
  phone: string;
  business_name: string;
  owner_name: string;
  business_number: string;
  business_license_url: string;
  business_verified: boolean;
  address1: string;
  address2: string;
  category: unknown;
  work_zone: unknown;
  introduction: string;
  warranty_period: string | null;
  badges: string[] | null;
  status: string;
  onboarding_completed: boolean;
  bid_count: number;
  match_count: number;
  created_at: string;
};

// DB에 문자열·JSON string·배열 어떤 형태로 저장돼도 배열로 변환
function toArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // 쉼표 구분 문자열 처리
      return value.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

const PAGE_SIZE_OPTIONS = [10, 20, 30];

const WORK_ZONES = [
  "전국",
  "서울",
  "인천",
  "경기",
  "충북",
  "충남",
  "경북",
  "경남",
  "전북",
  "전남",
  "제주도",
  "그 외 섬지역",
];

export default function ProvidersPage() {
  const [ready, setReady] = useState(false);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [zoneFilter, setZoneFilter] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [detailProvider, setDetailProvider] = useState<ProviderDetail | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  const searchParams = useSearchParams();
  const categoryFilter = searchParams.get("category"); // URL ?category=도배

  const initializedRef = useRef(false);

  // 권한 체크 (최초 1회)
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const init = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      if (!session) { window.location.href = "/login"; return; }

      const { data: profileData } = await supabase
        .from("profiles").select("role").eq("user_id", session.user.id).maybeSingle();

      if (profileData?.role !== "admin" && profileData?.role !== "super_admin") {
        window.location.href = "/login";
        return;
      }

      setReady(true);
    };

    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchProviders = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from("profiles")
        .select("user_id, name, business_name, owner_name, phone, status, onboarding_completed, category, work_zone, badges, warranty_period, bid_count, match_count, created_at", { count: "exact" })
        .eq("role", "provider")
        .order("created_at", { ascending: false })
        .range(from, to);

      // 공정별 카테고리 필터
      if (categoryFilter) {
        query = query.ilike("category", `%${categoryFilter}%`);
      }

      // 시공지역 필터
      if (zoneFilter) {
        query = query.ilike("work_zone", `%${zoneFilter}%`);
      }

      // 검색어 필터
      if (appliedSearch.trim()) {
        const keyword = appliedSearch.trim();
        query = query.or(
          `business_name.ilike.%${keyword}%,owner_name.ilike.%${keyword}%,phone.ilike.%${keyword}%,category.ilike.%${keyword}%`,
        );
      }

      const { data, count, error: fetchError } = await query;

      if (fetchError) {
        console.error("업체 조회 오류:", fetchError.message);
        setError(`조회 오류: ${fetchError.message}`);
      } else {
        setProviders(data ?? []);
        setTotalCount(count ?? 0);
      }
    } catch (err) {
      console.error("fetchProviders 예외:", err);
      setError("데이터를 불러오는 중 예기치 못한 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, pageSize, appliedSearch, categoryFilter, zoneFilter]);

  // 카테고리/지역 필터 변경 시 페이지 리셋
  useEffect(() => {
    setCurrentPage(1);
    setAppliedSearch("");
    setSearch("");
  }, [categoryFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [zoneFilter]);

  useEffect(() => {
    if (!ready) return;
    fetchProviders();
  }, [ready, fetchProviders]);

  const handleSearch = () => {
    setCurrentPage(1);
    setAppliedSearch(search);
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  };

  const toggleStatus = async (provider: Provider) => {
    const newStatus = provider.status === "active" ? "pending" : "active";
    setTogglingId(provider.user_id);

    setProviders((prev) =>
      prev.map((p) => p.user_id === provider.user_id ? { ...p, status: newStatus } : p),
    );

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ status: newStatus })
      .eq("user_id", provider.user_id);

    if (updateError) {
      console.error("상태 변경 오류:", updateError);
      setProviders((prev) =>
        prev.map((p) => p.user_id === provider.user_id ? { ...p, status: provider.status } : p),
      );
    }

    setTogglingId(null);
  };

  const openDetail = async (userId: string) => {
    setIsDetailLoading(true);
    setDetailProvider(null);

    const { data, error } = await supabase
      .from("profiles")
      .select("user_id, name, email, phone, business_name, owner_name, business_number, business_license_url, business_verified, address1, address2, category, work_zone, introduction, warranty_period, badges, status, onboarding_completed, bid_count, match_count, created_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) console.error("상세 조회 오류:", error.message);
    else setDetailProvider(data);

    setIsDetailLoading(false);
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  if (!ready && isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-800">
          공급업체관리
          {categoryFilter && (
            <span className="ml-2 inline-flex items-center rounded-full bg-indigo-100 px-2.5 py-0.5 text-sm font-medium text-indigo-700">
              {categoryFilter}
            </span>
          )}
        </h1>
        <p className="mt-0.5 text-sm text-gray-500">
          {categoryFilter ? `'${categoryFilter}' 공정 업체 목록입니다.` : "등록된 시공 업체 목록입니다."}
        </p>
      </div>

      {/* 검색 + 시공지역 필터 + 페이지당 개수 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="업체명 / 대표자 / 전화번호 / 전문분야 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm outline-none placeholder:text-gray-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 sm:w-96"
          />
          {/* 시공지역 드롭다운 */}
          <select
            value={zoneFilter}
            onChange={(e) => setZoneFilter(e.target.value)}
            className={`rounded-xl border px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-indigo-100
              ${zoneFilter
                ? "border-indigo-400 bg-indigo-50 text-indigo-700 font-medium"
                : "border-gray-200 bg-white text-gray-600 focus:border-indigo-400"
              }`}
          >
            <option value="">시공지역 전체</option>
            {WORK_ZONES.map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleSearch}
            className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
          >
            검색
          </button>
          {/* 필터 초기화 */}
          {(appliedSearch || zoneFilter) && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setAppliedSearch("");
                setZoneFilter("");
                setCurrentPage(1);
              }}
              className="shrink-0 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-500 transition hover:bg-gray-50"
            >
              초기화
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">페이지당</span>
          <select
            value={pageSize}
            onChange={(e) => handlePageSizeChange(Number(e.target.value))}
            className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-700 outline-none focus:border-indigo-400"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}개</option>
            ))}
          </select>
          <span className="text-xs text-gray-400">전체 {totalCount}개</span>
        </div>
      </div>

      {/* 테이블 */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          </div>
        ) : error ? (
          <div className="py-16 text-center text-sm text-red-500">{error}</div>
        ) : providers.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">
            {appliedSearch ? "검색 결과가 없습니다." : "등록된 업체가 없습니다."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold text-gray-500">
                  <th className="px-4 py-3">업체명</th>
                  <th className="hidden px-4 py-3 sm:table-cell">대표자</th>
                  <th className="hidden px-4 py-3 sm:table-cell">전화번호</th>
                  <th className="hidden px-4 py-3 lg:table-cell">전문분야</th>
                  <th className="hidden px-4 py-3 lg:table-cell">시공지역</th>
                  <th className="hidden px-4 py-3 lg:table-cell">보유뱃지</th>
                  <th className="hidden px-4 py-3 lg:table-cell">하자보증기간</th>
                  <th className="hidden px-4 py-3 md:table-cell text-center">입찰시도</th>
                  <th className="hidden px-4 py-3 md:table-cell text-center">매칭성공</th>
                  <th className="hidden px-4 py-3 md:table-cell">온보딩</th>
                  <th className="hidden px-4 py-3 md:table-cell">가입일</th>
                  <th className="px-4 py-3 text-center">활성화</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {providers.map((provider) => (
                  <tr key={provider.user_id} className="transition hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openDetail(provider.user_id)}
                        className="font-medium text-gray-800 underline-offset-2 hover:text-indigo-600 hover:underline text-left"
                      >
                        {provider.business_name || provider.name || "—"}
                      </button>
                    </td>
                    <td className="hidden px-4 py-3 text-gray-600 sm:table-cell">
                      {provider.owner_name || "—"}
                    </td>
                    <td className="hidden px-4 py-3 sm:table-cell">
                      {provider.phone
                        ? <PhoneActions phone={provider.phone} />
                        : <span className="text-gray-400">—</span>}
                    </td>
                    {/* 전문분야 */}
                    <td className="hidden px-4 py-3 lg:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {(() => {
                          const cats = toArray(provider.category);
                          if (cats.length === 0) return <span className="text-gray-400">—</span>;
                          return (
                            <>
                              {cats.slice(0, 2).map((c) => (
                                <span key={c} className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                                  {c}
                                </span>
                              ))}
                              {cats.length > 2 && (
                                <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                                  +{cats.length - 2}
                                </span>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </td>

                    {/* 시공지역 */}
                    <td className="hidden px-4 py-3 lg:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {(() => {
                          const zones = toArray(provider.work_zone);
                          if (zones.length === 0) return <span className="text-gray-400">—</span>;
                          return (
                            <>
                              {zones.slice(0, 2).map((z) => (
                                <span key={z} className="inline-flex rounded-full bg-violet-50 px-2 py-0.5 text-xs text-violet-700">
                                  {z.replace(/\s*전체$/, "")}
                                </span>
                              ))}
                              {zones.length > 2 && (
                                <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                                  +{zones.length - 2}
                                </span>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </td>

                    {/* 보유뱃지 - 점으로 표시 */}
                    <td className="hidden px-4 py-3 lg:table-cell">
                      <div className="flex items-center gap-1">
                        {(() => {
                          const bs = toArray(provider.badges);
                          if (bs.length === 0) return <span className="text-xs text-gray-300">—</span>;
                          return bs.map((bid) => {
                            const b = BADGES.find((x) => x.id === bid);
                            if (!b) return null;
                            return <span key={bid} title={b.label} className={`h-3 w-3 rounded-full ${b.dot}`} />;
                          });
                        })()}
                      </div>
                    </td>

                    {/* 하자보증기간 */}
                    <td className="hidden px-4 py-3 lg:table-cell text-sm text-gray-600">
                      {provider.warranty_period ? `${provider.warranty_period}개월` : <span className="text-gray-300">—</span>}
                    </td>

                    {/* 입찰시도 */}
                    <td className="hidden px-4 py-3 md:table-cell text-center font-medium text-gray-700">
                      {provider.bid_count ?? 0}
                    </td>

                    {/* 매칭성공 */}
                    <td className="hidden px-4 py-3 md:table-cell text-center font-medium text-emerald-600">
                      {provider.match_count ?? 0}
                    </td>

                    <td className="hidden px-4 py-3 md:table-cell">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium
                        ${provider.onboarding_completed
                          ? "bg-green-50 text-green-700"
                          : "bg-yellow-50 text-yellow-700"
                        }`}
                      >
                        {provider.onboarding_completed ? "완료" : "미완료"}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-gray-500 md:table-cell">
                      {provider.created_at
                        ? new Date(provider.created_at).toLocaleDateString("ko-KR")
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center">
                        <button
                          type="button"
                          disabled={togglingId === provider.user_id}
                          onClick={() => toggleStatus(provider)}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50
                            ${provider.status === "active" ? "bg-indigo-600" : "bg-gray-200"}`}
                          aria-label="활성화 토글"
                        >
                          <span
                            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200
                              ${provider.status === "active" ? "translate-x-5" : "translate-x-0"}`}
                          />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 업체 상세 모달 */}
      {(isDetailLoading || detailProvider) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => { setDetailProvider(null); setIsDetailLoading(false); }}>
          <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            {/* 모달 헤더 */}
            <div className="sticky top-0 flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
              <h2 className="text-base font-semibold text-gray-800">
                {detailProvider?.business_name || "업체 상세정보"}
              </h2>
              <button type="button" onClick={() => { setDetailProvider(null); setIsDetailLoading(false); }} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {isDetailLoading ? (
              <div className="flex items-center justify-center py-20">
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
              </div>
            ) : detailProvider && (
              <div className="space-y-5 px-6 py-5">

                {/* 기본정보 */}
                <Section title="기본 정보">
                  <Row label="이름" value={detailProvider.name} />
                  <Row label="이메일" value={detailProvider.email} />
                  <Row label="연락처" value={
                    detailProvider.phone
                      ? <PhoneActions phone={detailProvider.phone} />
                      : undefined
                  } />
                  <Row label="가입일" value={detailProvider.created_at ? new Date(detailProvider.created_at).toLocaleDateString("ko-KR") : undefined} />
                  <Row label="계정 상태" value={
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${detailProvider.status === "active" ? "bg-green-50 text-green-700" : "bg-yellow-50 text-yellow-700"}`}>
                        {detailProvider.status === "active" ? "활성" : "비활성"}
                      </span>
                      <button
                        type="button"
                        disabled={togglingId === detailProvider.user_id}
                        onClick={async () => {
                          const newStatus = detailProvider.status === "active" ? "pending" : "active";
                          setTogglingId(detailProvider.user_id);

                          // 모달 + 목록 동시 업데이트
                          setDetailProvider((prev) => prev ? { ...prev, status: newStatus } : prev);
                          setProviders((prev) =>
                            prev.map((p) => p.user_id === detailProvider.user_id ? { ...p, status: newStatus } : p),
                          );

                          const { error: updateError } = await supabase
                            .from("profiles")
                            .update({ status: newStatus })
                            .eq("user_id", detailProvider.user_id);

                          if (updateError) {
                            // 롤백
                            setDetailProvider((prev) => prev ? { ...prev, status: detailProvider.status } : prev);
                            setProviders((prev) =>
                              prev.map((p) => p.user_id === detailProvider.user_id ? { ...p, status: detailProvider.status } : p),
                            );
                          }
                          setTogglingId(null);
                        }}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50
                          ${detailProvider.status === "active" ? "bg-indigo-600" : "bg-gray-200"}`}
                        aria-label="활성화 토글"
                      >
                        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200
                          ${detailProvider.status === "active" ? "translate-x-5" : "translate-x-0"}`}
                        />
                      </button>
                    </div>
                  } />
                  <Row label="온보딩" value={
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${detailProvider.onboarding_completed ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-500"}`}>
                      {detailProvider.onboarding_completed ? "완료" : "미완료"}
                    </span>
                  } />
                </Section>

                {/* 업체정보 */}
                <Section title="업체 정보">
                  <Row label="업체명" value={detailProvider.business_name} />
                  <Row label="대표자명" value={detailProvider.owner_name} />
                  <Row label="사업자번호" value={detailProvider.business_number} />
                  <Row label="사업자 인증" value={
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${detailProvider.business_verified ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {detailProvider.business_verified ? "인증완료" : "미인증"}
                    </span>
                  } />
                  <Row label="사업장 주소" value={[detailProvider.address1, detailProvider.address2].filter(Boolean).join(" ") || undefined} />
                </Section>

                {/* 사업자등록증 */}
                {detailProvider.business_license_url && (
                  <Section title="사업자등록증">
                    <a href={detailProvider.business_license_url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl border border-gray-200">
                      <img src={detailProvider.business_license_url} alt="사업자등록증" className="w-full object-contain" />
                    </a>
                    <p className="mt-1.5 text-xs text-gray-400 text-center">이미지 클릭 시 원본 열기</p>
                  </Section>
                )}

                {/* 전문분야 / 시공지역 */}
                <Section title="서비스 정보">
                  <div className="space-y-3">
                    <div>
                      <p className="mb-1.5 text-xs font-medium text-gray-500">전문분야</p>
                      <div className="flex flex-wrap gap-1.5">
                        {toArray(detailProvider.category).length > 0
                          ? toArray(detailProvider.category).map((c) => (
                            <span key={c} className="rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-700">{c}</span>
                          ))
                          : <span className="text-xs text-gray-400">없음</span>
                        }
                      </div>
                    </div>
                    <div>
                      <p className="mb-1.5 text-xs font-medium text-gray-500">시공가능지역</p>
                      <div className="flex flex-wrap gap-1.5">
                        {toArray(detailProvider.work_zone).length > 0
                          ? toArray(detailProvider.work_zone).map((z) => (
                            <span key={z} className="rounded-full bg-violet-50 px-2.5 py-1 text-xs text-violet-700">{z.replace(/\s*전체$/, "")}</span>
                          ))
                          : <span className="text-xs text-gray-400">없음</span>
                        }
                      </div>
                    </div>
                    {detailProvider.introduction && (
                      <div>
                        <p className="mb-1.5 text-xs font-medium text-gray-500">업체 소개</p>
                        <p className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{detailProvider.introduction}</p>
                      </div>
                    )}
                    {detailProvider.warranty_period && (
                      <div>
                        <p className="mb-1.5 text-xs font-medium text-gray-500">하자보증기간</p>
                        <p className="text-sm font-medium text-gray-800">{detailProvider.warranty_period}개월</p>
                      </div>
                    )}
                    {(() => {
                      const bs = toArray(detailProvider.badges);
                      if (bs.length === 0) return null;
                      return (
                        <div>
                          <p className="mb-2 text-xs font-medium text-gray-500">보유 뱃지</p>
                          <div className="flex flex-wrap gap-1.5">
                            {bs.map((bid) => {
                              const b = BADGE_FULL.find((x) => x.id === bid);
                              if (!b) return null;
                              return (
                                <span key={bid} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${b.bg} ${b.color} ${b.border}`}>
                                  <span className={`h-2 w-2 rounded-full ${b.dot}`} />
                                  {b.label}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </Section>

                {/* 활동 현황 */}
                <Section title="활동 현황">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-gray-50 p-4 text-center">
                      <p className="text-2xl font-bold text-gray-800">{detailProvider.bid_count ?? 0}</p>
                      <p className="mt-0.5 text-xs text-gray-500">입찰시도</p>
                    </div>
                    <div className="rounded-xl bg-emerald-50 p-4 text-center">
                      <p className="text-2xl font-bold text-emerald-600">{detailProvider.match_count ?? 0}</p>
                      <p className="mt-0.5 text-xs text-gray-500">매칭성공</p>
                    </div>
                  </div>
                </Section>

              </div>
            )}
          </div>
        </div>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => p - 1)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
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
                  <span key={`ellipsis-${idx}`} className="px-2 py-1.5 text-sm text-gray-400">…</span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setCurrentPage(item as number)}
                    className={`min-w-[32px] rounded-lg border px-2 py-1.5 text-sm transition
                      ${currentPage === item
                        ? "border-indigo-600 bg-indigo-600 font-semibold text-white"
                        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                      }`}
                  >
                    {item}
                  </button>
                ),
              )}
          </div>

          <button
            type="button"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage((p) => p + 1)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            다음
          </button>
        </div>
      )}
    </div>
  );
}

function PhoneActions({ phone }: { phone: string }) {
  const digits = phone.replace(/\D/g, "");
  return (
    <div className="flex items-center gap-2">
      {/* 전화 걸기 */}
      <a
        href={`tel:${digits}`}
        className="flex items-center gap-1 rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-200"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6.29 6.29l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
        {phone}
      </a>

      {/* 카카오톡 메시지 — 모바일 전용 */}
      <a
        href={`kakaotalk://msg/send?to=${digits}`}
        className="sm:hidden flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition"
        style={{ backgroundColor: "#FEE500", color: "#3A1D1D" }}
        title="카카오톡으로 메시지 보내기"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.477 2 2 5.805 2 10.5c0 2.91 1.69 5.484 4.28 7.084L5.25 21l4.2-2.1C10.268 19.29 11.12 19.5 12 19.5c5.523 0 10-3.805 10-8.5S17.523 2 12 2z" />
        </svg>
        카카오
      </a>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</h3>
      <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 space-y-2.5">
        {children}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-24 shrink-0 text-xs text-gray-500 pt-0.5">{label}</span>
      <span className="flex-1 text-sm text-gray-800">
        {value ?? <span className="text-gray-400">—</span>}
      </span>
    </div>
  );
}
