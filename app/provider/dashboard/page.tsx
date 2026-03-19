"use client";

import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LineChart, Line, Legend,
} from "recharts";

type DailyStat = { date: string; count: number };
type CategoryStat = { name: string; total: number; data: DailyStat[] };

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

function categoryMatches(providerCat: string, projectCat: string): boolean {
  const a = (providerCat ?? "").trim();
  const b = (projectCat ?? "").trim();
  if (!a || !b) return false;
  return a === b;
}

const BAR_COLORS = [
  "#6366f1", "#8b5cf6", "#3b82f6", "#06b6d4",
  "#10b981", "#f59e0b", "#ef4444", "#ec4899",
];

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatMoney(n: number) {
  return n.toLocaleString("ko-KR");
}

// 숫자 카운팅 애니메이션
function useAnimatedValue(target: number, duration = 1200, deps: unknown[] = []) {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);
  useEffect(() => {
    if (target === prevRef.current) return;
    const start = prevRef.current;
    const diff = target - start;
    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - (1 - progress) ** 2;
      setDisplay(Math.round(start + diff * eased));
      if (progress < 1) requestAnimationFrame(animate);
      else prevRef.current = target;
    };
    requestAnimationFrame(animate);
  }, [target, duration, ...deps]);
  useEffect(() => { prevRef.current = target; }, [target]);
  return display;
}

// 지난 N일 날짜 배열 생성
function getDateRange(days: number): string[] {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    return d.toISOString().slice(0, 10);
  });
}

export default function ProviderDashboardPage() {
  const [businessName, setBusinessName] = useState<string>("");
  const [myCategories, setMyCategories] = useState<string[]>([]);
  const [categoryStats, setCategoryStats] = useState<CategoryStat[]>([]);
  const [combinedData, setCombinedData] = useState<Record<string, number & { [key: string]: number }>[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [estimateWaitingCount, setEstimateWaitingCount] = useState(0);
  const [contractCompletedCount, setContractCompletedCount] = useState(0);
  const [dailySales, setDailySales] = useState<{ date: string; amount: number }[]>([]);
  const [totalSales, setTotalSales] = useState(0);
  const [selectedRange, setSelectedRange] = useState<7 | 14 | 30>(14);
  const [isLoading, setIsLoading] = useState(true);
  const [isChartLoading, setIsChartLoading] = useState(false);
  const initializedRef = useRef(false);
  const categoriesRef = useRef<string[]>([]);
  const animatedTotalSales = useAnimatedValue(totalSales, 1200, [totalSales]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const init = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      if (!session) { window.location.href = "/login"; return; }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, business_name, name, category")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (!profile || profile.role !== "provider") {
        window.location.href = "/login"; return;
      }

      setBusinessName(profile.business_name || profile.name || "업체");
      const cats = toArray(profile.category);
      setMyCategories(cats);
      categoriesRef.current = cats;

      // 견적대기 프로젝트 수 (estimates 페이지와 동일 로직: 계약완료/매칭실패 제외)
      const { data: projData } = await supabase
        .from("projects")
        .select("id, work_tree, work_details, category")
        .in("status", ["estimate_waiting", "active"]);
      const list = projData ?? [];
      const providerCats = cats.map((c) => c.trim()).filter(Boolean);
      const getProjectCats = (p: { work_tree?: { cat: string }[]; work_details?: Record<string, unknown>; category?: string[] }) => {
        const tree = p.work_tree ?? [];
        if (tree.length > 0) return tree.map((g) => g.cat?.trim() ?? "").filter(Boolean);
        if (p.work_details) return Object.keys(p.work_details).map((c) => c.trim()).filter(Boolean);
        if (p.category?.length) return (p.category as string[]).map((c) => String(c).trim()).filter(Boolean);
        return [];
      };
      const matchesProject = (projectCat: string) =>
        providerCats.length === 0 || providerCats.some((pc) => categoryMatches(pc, projectCat));
      const matched = list.filter((p: { work_tree?: { cat: string }[]; work_details?: Record<string, unknown>; category?: string[] }) => {
        const projectCats = getProjectCats(p);
        if (projectCats.length === 0) return providerCats.length === 0;
        return projectCats.some((c) => matchesProject(c));
      });
      const allProjectIds = new Set(matched.map((m: { id: string }) => m.id));
      const { data: estData } = await supabase.from("project_estimates").select("project_id, amounts").eq("provider_id", session.user.id);
      (estData ?? []).forEach((row) => allProjectIds.add(row.project_id));
      const idsNotInList = Array.from(allProjectIds).filter((id) => !list.some((p: { id: string }) => p.id === id));
      let extraList: typeof list = [];
      if (idsNotInList.length > 0) {
        const { data: extraData } = await supabase.from("projects").select("id, work_tree, work_details, category").in("id", idsNotInList);
        extraList = extraData ?? [];
      }
      const fullList = [...list, ...extraList.filter((p: { id: string }) => !list.some((m: { id: string }) => m.id === p.id))];
      const estMap: Record<string, Record<string, number>> = {};
      (estData ?? []).forEach((row) => { estMap[row.project_id] = (row.amounts as Record<string, number>) ?? {}; });
      const { data: assignData } = await supabase
        .from("project_category_assignments")
        .select("project_id, category, provider_id, match_status")
        .in("project_id", Array.from(allProjectIds));
      const assignMap: Record<string, Record<string, { provider_id: string; match_status: string }>> = {};
      (assignData ?? []).forEach((row) => {
        if (!assignMap[row.project_id]) assignMap[row.project_id] = {};
        assignMap[row.project_id][row.category] = { provider_id: row.provider_id, match_status: row.match_status ?? "in_progress" };
      });
      const getCatStatus = (projectId: string, category: string) => {
        const hasBid = !!estMap[projectId] && estMap[projectId][category] != null;
        if (!hasBid) return "none";
        const a = assignMap[projectId]?.[category];
        if (!a) return "매칭대기";
        if (a.provider_id !== session.user.id) return "매칭실패";
        if (a.match_status === "cancelled") return "거래취소";
        if (a.match_status === "completed") return "계약완료";
        return "고민중";
      };
      const estimateWaitingProjects = fullList.filter((p: { id: string; work_tree?: { cat: string }[]; work_details?: Record<string, unknown>; category?: string[] }) => {
        const projectCats = getProjectCats(p);
        const groups = projectCats.filter((c) => matchesProject(c));
        if (groups.length === 0) return false;
        const hasAnyCompleted = groups.some((c) => getCatStatus(p.id, c) === "계약완료");
        if (hasAnyCompleted) return false;
        return groups.some((c) => {
          const st = getCatStatus(p.id, c);
          return st !== "계약완료" && st !== "매칭실패";
        });
      });
      setEstimateWaitingCount(estimateWaitingProjects.length);

      // 총 계약완료 건수 (대공정별)
      const { count: completedCount } = await supabase
        .from("project_category_assignments")
        .select("id", { count: "exact", head: true })
        .eq("provider_id", session.user.id)
        .eq("match_status", "completed");
      setContractCompletedCount(completedCount ?? 0);

      // 일자별 계약완료 금액 및 총 매출 (계약완료 건만)
      const { data: completedAssigns } = await supabase
        .from("project_category_assignments")
        .select("project_id, category, match_started_at")
        .eq("provider_id", session.user.id)
        .eq("match_status", "completed");
      const completedProjectIds = [...new Set((completedAssigns ?? []).map((a) => a.project_id))];
      const peMap: Record<string, Record<string, number>> = {};
      if (completedProjectIds.length > 0) {
        const { data: completedEstData } = await supabase
          .from("project_estimates")
          .select("project_id, amounts")
          .eq("provider_id", session.user.id)
          .in("project_id", completedProjectIds);
        (completedEstData ?? []).forEach((row) => { peMap[row.project_id] = (row.amounts as Record<string, number>) ?? {}; });
      }
      const byDate: Record<string, number> = {};
      let total = 0;
      (completedAssigns ?? []).forEach((a) => {
        const amt = peMap[a.project_id]?.[a.category] ?? 0;
        if (amt > 0) {
          const d = a.match_started_at ? a.match_started_at.slice(0, 10) : new Date().toISOString().slice(0, 10);
          byDate[d] = (byDate[d] ?? 0) + amt;
          total += amt;
        }
      });
      const dateRange = getDateRange(30);
      setDailySales(dateRange.map((d) => ({ date: d, amount: byDate[d] ?? 0 })));
      setTotalSales(total);

      setIsLoading(false);
    };
    init();
  }, []);

  // 실시간 구독: 프로젝트·견적 변경 시 카운트 갱신
  useEffect(() => {
    if (!businessName) return;
    const cats = categoriesRef.current;
    const reload = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      if (!session) return;
      const { data: projData } = await supabase.from("projects").select("id, work_tree, work_details, category").in("status", ["estimate_waiting", "active"]);
      const list = projData ?? [];
      const providerCats = cats.map((c) => c.trim()).filter(Boolean);
      const getProjectCats = (p: { work_tree?: { cat: string }[]; work_details?: Record<string, unknown>; category?: string[] }) => {
        const tree = p.work_tree ?? [];
        if (tree.length > 0) return tree.map((g) => g.cat?.trim() ?? "").filter(Boolean);
        if (p.work_details) return Object.keys(p.work_details).map((c) => c.trim()).filter(Boolean);
        if (p.category?.length) return (p.category as string[]).map((c) => String(c).trim()).filter(Boolean);
        return [];
      };
      const matchesProject = (projectCat: string) =>
        providerCats.length === 0 || providerCats.some((pc) => categoryMatches(pc, projectCat));
      const matched = list.filter((p: { work_tree?: { cat: string }[]; work_details?: Record<string, unknown>; category?: string[] }) => {
        const projectCats = getProjectCats(p);
        if (projectCats.length === 0) return providerCats.length === 0;
        return projectCats.some((c) => matchesProject(c));
      });
      const allProjectIds = new Set(matched.map((m: { id: string }) => m.id));
      const { data: estData } = await supabase.from("project_estimates").select("project_id, amounts").eq("provider_id", session.user.id);
      (estData ?? []).forEach((row) => allProjectIds.add(row.project_id));
      const idsNotInList = Array.from(allProjectIds).filter((id) => !list.some((p: { id: string }) => p.id === id));
      let extraList: { id: string; work_tree?: { cat: string }[]; work_details?: Record<string, unknown>; category?: string[] }[] = [];
      if (idsNotInList.length > 0) {
        const { data: extraData } = await supabase.from("projects").select("id, work_tree, work_details, category").in("id", idsNotInList);
        extraList = extraData ?? [];
      }
      const fullList = [...list, ...extraList.filter((p) => !list.some((m: { id: string }) => m.id === p.id))];
      const estMap: Record<string, Record<string, number>> = {};
      (estData ?? []).forEach((row) => { estMap[row.project_id] = (row.amounts as Record<string, number>) ?? {}; });
      const { data: assignData } = await supabase
        .from("project_category_assignments")
        .select("project_id, category, provider_id, match_status")
        .in("project_id", Array.from(allProjectIds));
      const assignMap: Record<string, Record<string, { provider_id: string; match_status: string }>> = {};
      (assignData ?? []).forEach((row) => {
        if (!assignMap[row.project_id]) assignMap[row.project_id] = {};
        assignMap[row.project_id][row.category] = { provider_id: row.provider_id, match_status: row.match_status ?? "in_progress" };
      });
      const getCatStatus = (projectId: string, category: string) => {
        const hasBid = !!estMap[projectId] && estMap[projectId][category] != null;
        if (!hasBid) return "none";
        const a = assignMap[projectId]?.[category];
        if (!a) return "매칭대기";
        if (a.provider_id !== session.user.id) return "매칭실패";
        if (a.match_status === "cancelled") return "거래취소";
        if (a.match_status === "completed") return "계약완료";
        return "고민중";
      };
      const estimateWaitingProjects = fullList.filter((p: { id: string; work_tree?: { cat: string }[]; work_details?: Record<string, unknown>; category?: string[] }) => {
        const projectCats = getProjectCats(p);
        const groups = projectCats.filter((c) => matchesProject(c));
        if (groups.length === 0) return false;
        const hasAnyCompleted = groups.some((c) => getCatStatus(p.id, c) === "계약완료");
        if (hasAnyCompleted) return false;
        return groups.some((c) => {
          const st = getCatStatus(p.id, c);
          return st !== "계약완료" && st !== "매칭실패";
        });
      });
      setEstimateWaitingCount(estimateWaitingProjects.length);
      const { count: completedCount } = await supabase
        .from("project_category_assignments")
        .select("id", { count: "exact", head: true })
        .eq("provider_id", session.user.id)
        .eq("match_status", "completed");
      setContractCompletedCount(completedCount ?? 0);

      // 일자별 계약완료 금액 및 총 매출 (계약완료 건만)
      const { data: completedAssigns } = await supabase
        .from("project_category_assignments")
        .select("project_id, category, match_started_at")
        .eq("provider_id", session.user.id)
        .eq("match_status", "completed");
      const completedProjectIds = [...new Set((completedAssigns ?? []).map((a) => a.project_id))];
      const peMap: Record<string, Record<string, number>> = {};
      if (completedProjectIds.length > 0) {
        const { data: completedEstData } = await supabase
          .from("project_estimates")
          .select("project_id, amounts")
          .eq("provider_id", session.user.id)
          .in("project_id", completedProjectIds);
        (completedEstData ?? []).forEach((row) => { peMap[row.project_id] = (row.amounts as Record<string, number>) ?? {}; });
      }
      const byDate: Record<string, number> = {};
      let total = 0;
      (completedAssigns ?? []).forEach((a) => {
        const amt = peMap[a.project_id]?.[a.category] ?? 0;
        if (amt > 0) {
          const d = a.match_started_at ? a.match_started_at.slice(0, 10) : new Date().toISOString().slice(0, 10);
          byDate[d] = (byDate[d] ?? 0) + amt;
          total += amt;
        }
      });
      const dateRange = getDateRange(30);
      setDailySales(dateRange.map((d) => ({ date: d, amount: byDate[d] ?? 0 })));
      setTotalSales(total);
    };
    const channel = supabase
      .channel("provider-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "project_estimates" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "project_category_assignments" }, reload)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [businessName]);

  // 날짜 범위 변경 시 데이터 조회 (견적대기 프로젝트 기준)
  useEffect(() => {
    loadStats(selectedRange, myCategories.length === 0 ? ["전체"] : myCategories);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRange, myCategories]);

  const loadStats = async (days: number, cats: string[]) => {
    setIsChartLoading(true);
    const since = new Date();
    since.setDate(since.getDate() - (days - 1));
    since.setHours(0, 0, 0, 0);

    const dateRange = getDateRange(days);

    // 견적대기+진행중 프로젝트 조회 후 전문분야별 집계
    const { data: projData } = await supabase
      .from("projects")
      .select("id, work_tree, work_details, category, created_at")
      .in("status", ["estimate_waiting", "active"])
      .gte("created_at", since.toISOString());

    const list = projData ?? [];
    const providerCats = cats.map((c) => c.trim()).filter(Boolean);
    const catsForStats = providerCats.length === 0 ? ["전체"] : providerCats;
    const matchesProject = (projectCat: string) =>
      providerCats.length === 0 ? true : providerCats.some((pc) => categoryMatches(pc, projectCat));

    // 대공정별 신규의뢰 카운팅 (프로젝트당 매칭되는 대공정 수로 집계)
    const statsResults = catsForStats.map((cat) => {
      const countByDate: Record<string, number> = {};
      dateRange.forEach((d) => { countByDate[d] = 0; });
      list.forEach((row: { work_tree?: { cat: string }[]; work_details?: Record<string, unknown>; category?: string[]; created_at: string }) => {
        const tree = row.work_tree ?? [];
        const projectCats = tree.length > 0
          ? tree.map((g) => g.cat?.trim() ?? "").filter(Boolean)
          : row.work_details
            ? Object.keys(row.work_details).map((c) => c.trim()).filter(Boolean)
            : row.category?.length
              ? (row.category as string[]).map((c) => String(c).trim()).filter(Boolean)
              : [];
        const matchingCats = cat === "전체"
          ? projectCats.filter((c) => providerCats.length === 0 || providerCats.some((pc) => categoryMatches(pc, c)))
          : projectCats.filter((c) => categoryMatches(cat, c));
        if (matchingCats.length > 0) {
          const d = row.created_at.slice(0, 10);
          if (countByDate[d] !== undefined) countByDate[d] += matchingCats.length;
        }
      });
      const total = Object.values(countByDate).reduce((s, v) => s + v, 0);
      const dailyData: DailyStat[] = dateRange.map((d) => ({ date: d, count: countByDate[d] }));
      return { name: cat, total, data: dailyData };
    });

    const totalNewRequests = statsResults.reduce((s, stat) => s + stat.total, 0);
    setCategoryStats(statsResults);
    setTotalCount(totalNewRequests);

    const combined = dateRange.map((date) => {
      const entry: Record<string, string | number> = { date: formatDate(date) };
      statsResults.forEach((stat) => {
        const found = stat.data.find((d) => d.date === date);
        entry[stat.name] = found?.count ?? 0;
      });
      return entry;
    });
    setCombinedData(combined as never);
    setIsChartLoading(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-xl font-semibold text-gray-800">안녕하세요, {businessName}님 👋</h1>
        <p className="mt-0.5 text-sm text-gray-500">업체 대시보드에 오신 것을 환영합니다.</p>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">견적대기 프로젝트</p>
          <p className="mt-1 text-2xl font-bold text-indigo-600">{estimateWaitingCount}</p>
          <p className="mt-0.5 text-[10px] text-gray-400">내 전문분야 매칭</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">기간 내 신규 의뢰</p>
          <p className="mt-1 text-2xl font-bold text-blue-600">{totalCount}</p>
          <p className="mt-0.5 text-[10px] text-gray-400">{selectedRange}일</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">계약완료</p>
          <p className="mt-1 text-2xl font-bold text-green-600">{contractCompletedCount}</p>
          <p className="mt-0.5 text-[10px] text-gray-400">총 계약완료 건수</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">내 전문분야</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{myCategories.length}</p>
          <p className="mt-0.5 text-[10px] text-gray-400">등록 공정 수</p>
        </div>
      </div>

      {/* 견적의뢰 현황 */}
      {myCategories.length > 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          {/* 헤더 + 기간 선택 */}
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">전문분야별 신규의뢰 현황</h2>
              <p className="mt-0.5 text-xs text-gray-400">대공정별 신규로 매칭된 의뢰 건수</p>
            </div>
            <div className="flex gap-1">
              {([7, 14, 30] as const).map((d) => (
                <button key={d} type="button" onClick={() => setSelectedRange(d)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                    selectedRange === d ? "bg-indigo-600 text-white" : "border border-gray-200 text-gray-500 hover:bg-gray-50"
                  }`}>
                  {d}일
                </button>
              ))}
            </div>
          </div>

          {isChartLoading ? (
            <div className="flex items-center justify-center py-16">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
            </div>
          ) : (
            <>
              {/* 전문분야별 합계 카드 */}
              <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {categoryStats.map((stat, i) => (
                  <div key={stat.name} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-600">{stat.name}</span>
                      <span className="text-lg font-bold" style={{ color: BAR_COLORS[i % BAR_COLORS.length] }}>
                        {stat.total}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[10px] text-gray-400">{selectedRange}일 신규의뢰</p>
                  </div>
                ))}
              </div>

              {/* 날짜별 차트 */}
              {(() => {
                const barData = (categoryStats[0]?.data ?? []).map((d) => ({ date: formatDate(d.date), count: d.count }));
                return categoryStats.length === 1 ? (
                  <div className="h-64 min-h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={barData.length > 0 ? barData : [{ date: "-", count: 0 }]} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={{ stroke: "#e5e7eb" }} tickLine={false} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={28} />
                        <Tooltip cursor={{ fill: "#f5f3ff" }} contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} formatter={(v: unknown) => [`${Number(v)}건`, "의뢰 수"]} />
                        <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={48} fill={BAR_COLORS[0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : categoryStats.length > 0 ? (
                  <div className="h-64 min-h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={combinedData.length > 0 ? combinedData : [{ date: "-" }]} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={{ stroke: "#e5e7eb" }} tickLine={false} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={28} />
                        <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} formatter={(v: unknown, name: string) => [`${Number(v)}건`, name]} />
                        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                        {categoryStats.map((stat, i) => (
                          <Line key={stat.name} type="monotone" dataKey={stat.name} stroke={BAR_COLORS[i % BAR_COLORS.length]}
                            strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} name={stat.name} />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : null;
              })()}

              {totalCount === 0 && (
                <p className="mt-3 text-center text-xs text-gray-400">해당 기간에 신규 의뢰가 없습니다.</p>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white py-16">
          <div className="text-center">
            <svg className="mx-auto mb-3 text-gray-300" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="text-sm font-medium text-gray-400">전문분야가 등록되지 않았습니다.</p>
            <p className="mt-1 text-xs text-gray-300">업체 정보에서 전문분야를 등록하면 의뢰 현황이 표시됩니다.</p>
          </div>
        </div>
      )}

      {/* 공사금액제안 바로가기 */}
      {estimateWaitingCount > 0 && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-6">
          <h2 className="mb-2 text-sm font-semibold text-indigo-800">견적 제안 요청</h2>
          <p className="mb-4 text-xs text-indigo-600">
            {estimateWaitingCount}건의 견적대기 프로젝트가 있습니다. 공사금액을 제안해 주세요.
          </p>
          <Link
            href="/provider/estimates"
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            공사금액제안 바로가기
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      )}

      {/* 일자별 계약완료 금액 & 총 매출 */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">일자별 계약완료 금액</h2>
            <p className="mt-0.5 text-xs text-gray-400">최근 30일 기준</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2">
            <p className="text-[10px] text-emerald-600">총 매출금액</p>
            <p className="text-lg font-bold tabular-nums text-emerald-700 transition-all duration-300">
              ₩{formatMoney(animatedTotalSales)}
            </p>
          </div>
        </div>
        <div className="h-56 min-h-[180px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={dailySales.length > 0 ? dailySales.map((d) => ({ date: formatDate(d.date), amount: d.amount })) : [{ date: "-", amount: 0 }]}
              margin={{ top: 12, right: 12, left: 0, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={{ stroke: "#e5e7eb" }} tickLine={false} />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
                width={36}
                tickFormatter={(v) => (v >= 10000 ? `${(v / 10000).toFixed(0)}만` : String(v))}
              />
              <Tooltip
                cursor={{ fill: "#ecfdf5" }}
                contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }}
                formatter={(v: unknown) => [`₩${formatMoney(Number(v))}`, "계약완료 금액"]}
              />
              <Bar dataKey="amount" radius={[6, 6, 0, 0]} maxBarSize={48} fill="#10b981">
                {(dailySales.length > 0 ? dailySales : [{ amount: 0 }]).map((d, i) => (
                  <Cell key={i} fill={(d.amount ?? 0) > 0 ? "#10b981" : "#e5e7eb"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
