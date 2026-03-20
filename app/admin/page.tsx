"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import CollapsiblePanel from "@/components/CollapsiblePanel";
import VideoOrGradientBackground from "@/components/VideoOrGradientBackground";
import { DASHBOARD_VIDEOS } from "@/lib/backgroundVideos";
import { useAdminLayout } from "./AdminLayoutContext";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from "recharts";

type Stats = { consumer: number; provider: number; total: number };
type PeriodStats = { yesterday: number; week: number; month: number };
type RolePeriodStats = { consumer: PeriodStats; provider: PeriodStats };
type ChartRow = { date: string; consumer: number; provider: number };
type CategoryStat = { name: string; count: number };
type ActivityRow = { date: string; projects: number; bids: number };
type ActivitySummary = { totalProjects: number; totalBids: number; totalMatches: number };

function formatMoney(n: number) {
  return n.toLocaleString("ko-KR");
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function getDateRange(days: number): string[] {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    return d.toISOString().slice(0, 10);
  });
}

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

function parseArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try {
      const p = JSON.parse(value);
      if (Array.isArray(p)) return p.map(String);
    } catch {
      return value.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

export default function AdminDashboardPage() {
  const { sidebarCollapsed } = useAdminLayout();
  const [stats, setStats] = useState<Stats | null>(null);
  const [periodStats, setPeriodStats] = useState<RolePeriodStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [chartData, setChartData] = useState<ChartRow[]>([]);
  const [isChartLoading, setIsChartLoading] = useState(true);
  const [categoryStats, setCategoryStats] = useState<CategoryStat[]>([]);
  const [isCatLoading, setIsCatLoading] = useState(true);
  const [activityData, setActivityData] = useState<ActivityRow[]>([]);
  const [activitySummary, setActivitySummary] = useState<ActivitySummary | null>(null);
  const [isActivityLoading, setIsActivityLoading] = useState(true);
  const [activityDays, setActivityDays] = useState(30);
  const [dailySales, setDailySales] = useState<{ date: string; amount: number }[]>([]);
  const [totalSales, setTotalSales] = useState(0);
  const [isSalesLoading, setIsSalesLoading] = useState(true);


  // 총 가입자 수 + 기간별 통계
  useEffect(() => {
    const fetch = async () => {
      const now = new Date();

      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);

      const yesterdayStart = new Date(todayStart);
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);

      const weekStart = new Date(todayStart);
      weekStart.setDate(weekStart.getDate() - 6);

      const monthStart = new Date(todayStart);
      monthStart.setDate(monthStart.getDate() - 29);

      const [
        consumerTotal, providerTotal,
        consumerYest, providerYest,
        consumerWeek, providerWeek,
        consumerMonth, providerMonth,
      ] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "consumer"),
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "provider"),
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "consumer").gte("created_at", yesterdayStart.toISOString()).lt("created_at", todayStart.toISOString()),
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "provider").gte("created_at", yesterdayStart.toISOString()).lt("created_at", todayStart.toISOString()),
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "consumer").gte("created_at", weekStart.toISOString()),
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "provider").gte("created_at", weekStart.toISOString()),
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "consumer").gte("created_at", monthStart.toISOString()),
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "provider").gte("created_at", monthStart.toISOString()),
      ]);

      setStats({
        consumer: consumerTotal.count ?? 0,
        provider: providerTotal.count ?? 0,
        total: (consumerTotal.count ?? 0) + (providerTotal.count ?? 0),
      });
      setPeriodStats({
        consumer: {
          yesterday: consumerYest.count ?? 0,
          week: consumerWeek.count ?? 0,
          month: consumerMonth.count ?? 0,
        },
        provider: {
          yesterday: providerYest.count ?? 0,
          week: providerWeek.count ?? 0,
          month: providerMonth.count ?? 0,
        },
      });
      setIsLoading(false);
    };
    fetch();
  }, []);

  // 전문분야별 업체 수
  useEffect(() => {
    const fetch = async () => {
      const [catRes, providerRes] = await Promise.all([
        supabase.from("category").select("name, sort_order")
          .order("sort_order", { ascending: true })
          .order("id", { ascending: true }),
        supabase.from("profiles").select("category").eq("role", "provider"),
      ]);

      const catNames: string[] = (catRes.data ?? []).map((r) => r.name).filter(Boolean);
      const counts: Record<string, number> = {};
      catNames.forEach((n) => { counts[n] = 0; });

      (providerRes.data ?? []).forEach((row) => {
        parseArray(row.category).forEach((c) => {
          if (counts[c] !== undefined) counts[c] += 1;
          else counts[c] = 1;
        });
      });

      setCategoryStats(catNames.map((name) => ({ name, count: counts[name] ?? 0 })));
      setIsCatLoading(false);
    };
    fetch();
  }, []);

  // 견적요청 & 입찰 현황
  useEffect(() => {
    const load = async (days: number) => {
      setIsActivityLoading(true);
      const since = new Date();
      since.setDate(since.getDate() - (days - 1));
      since.setHours(0, 0, 0, 0);

      const [projectPeriodRes, estimatesCountRes, assignmentsCompletedRes, projectAllRes] = await Promise.all([
        supabase.from("projects").select("created_at").gte("created_at", since.toISOString()),
        supabase.from("project_estimates").select("id", { count: "exact", head: true }),
        supabase.from("project_category_assignments").select("id", { count: "exact", head: true }).eq("match_status", "completed"),
        supabase.from("projects").select("id", { count: "exact", head: true }),
      ]);

      // 일별 프로젝트 생성 집계
      const dayList: ActivityRow[] = Array.from({ length: days }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (days - 1 - i));
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return { date: `${mm}/${dd}`, projects: 0, bids: 0 };
      });

      (projectPeriodRes.data ?? []).forEach((row) => {
        const d = new Date(row.created_at);
        const key = `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
        const target = dayList.find((r) => r.date === key);
        if (target) target.projects += 1;
      });

      // 총 업체 입찰: project_estimates 전체 건수 (견적 제시한 업체)
      // 매칭 성공: project_category_assignments 중 match_status='completed' (계약완료)
      const totalBids = estimatesCountRes.count ?? 0;
      const totalMatches = assignmentsCompletedRes.count ?? 0;

      setActivityData(dayList);
      setActivitySummary({
        totalProjects: projectAllRes.count ?? 0,
        totalBids,
        totalMatches,
      });
      setIsActivityLoading(false);
    };
    load(activityDays);
  }, [activityDays]);

  // 최근 30일 일별 가입 추이
  useEffect(() => {
    const fetch = async () => {
      const since = new Date();
      since.setDate(since.getDate() - 29);
      since.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from("profiles")
        .select("role, created_at")
        .in("role", ["consumer", "provider"])
        .gte("created_at", since.toISOString());

      if (error || !data) { setIsChartLoading(false); return; }

      const days: ChartRow[] = Array.from({ length: 30 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (29 - i));
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return { date: `${mm}/${dd}`, consumer: 0, provider: 0 };
      });

      data.forEach((row) => {
        const d = new Date(row.created_at);
        const key = `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
        const target = days.find((r) => r.date === key);
        if (!target) return;
        if (row.role === "consumer") target.consumer += 1;
        else if (row.role === "provider") target.provider += 1;
      });

      setChartData(days);
      setIsChartLoading(false);
    };
    fetch();
  }, []);

  // 업체들 총 계약완료 금액 (일자별)
  useEffect(() => {
    const load = async () => {
      setIsSalesLoading(true);
      const { data: completedAssigns } = await supabase
        .from("project_category_assignments")
        .select("project_id, category, provider_id, match_started_at")
        .eq("match_status", "completed");
      const projectIds = [...new Set((completedAssigns ?? []).map((a) => a.project_id))];
      const peMap: Record<string, Record<string, number>> = {};
      if (projectIds.length > 0) {
        const { data: estData } = await supabase
          .from("project_estimates")
          .select("project_id, provider_id, amounts")
          .in("project_id", projectIds);
        (estData ?? []).forEach((row) => {
          const key = `${row.project_id}-${row.provider_id}`;
          peMap[key] = (row.amounts as Record<string, number>) ?? {};
        });
      }
      const byDate: Record<string, number> = {};
      let total = 0;
      (completedAssigns ?? []).forEach((a) => {
        const key = `${a.project_id}-${a.provider_id}`;
        const amt = peMap[key]?.[a.category] ?? 0;
        if (amt > 0) {
          const d = a.match_started_at ? a.match_started_at.slice(0, 10) : new Date().toISOString().slice(0, 10);
          byDate[d] = (byDate[d] ?? 0) + amt;
          total += amt;
        }
      });
      const dateRange = getDateRange(30);
      setDailySales(dateRange.map((d) => ({ date: d, amount: byDate[d] ?? 0 })));
      setTotalSales(total);
      setIsSalesLoading(false);
    };
    load();
  }, []);

  const animatedTotalSales = useAnimatedValue(totalSales, 1200, [totalSales]);

  const roleCards = [
    {
      role: "consumer" as const,
      label: "개인고객",
      total: stats?.consumer ?? 0,
      period: periodStats?.consumer ?? null,
      iconBg: "bg-blue-100",
      iconColor: "text-blue-600",
      totalColor: "text-blue-700",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
        </svg>
      ),
    },
    {
      role: "provider" as const,
      label: "시공업체",
      total: stats?.provider ?? 0,
      period: periodStats?.provider ?? null,
      iconBg: "bg-violet-100",
      iconColor: "text-violet-600",
      totalColor: "text-violet-700",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
        </svg>
      ),
    },
  ];

  return (
    <div className="relative min-h-[calc(100vh-3.5rem)]">
      <VideoOrGradientBackground
        videos={DASHBOARD_VIDEOS}
        overlayClassName="bg-black/40"
        wrapperClassName={`fixed inset-0 left-0 z-0 bg-black top-[var(--header-offset)] ${sidebarCollapsed ? "lg:left-16" : "lg:left-60"}`}
      />

      <div className="relative z-10 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white drop-shadow-md">관리자 대시보드</h1>
        <p className="mt-0.5 text-sm text-white/90">전체 서비스 현황을 확인하세요.</p>
      </div>

      {/* 가입자 카드 */}
      <CollapsiblePanel title="가입자 현황" subtitle="개인고객·시공업체·전체" storageKey="admin-dash-stats">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {/* 개인고객 / 시공업체 카드 (기간별 통계 포함) */}
          {roleCards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${card.iconBg} ${card.iconColor}`}>
                {card.icon}
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500">{card.label}</p>
                {isLoading
                  ? <div className="mt-1 h-7 w-16 animate-pulse rounded-md bg-gray-100" />
                  : <p className={`text-2xl font-bold ${card.totalColor}`}>{card.total.toLocaleString()}<span className="ml-1 text-sm font-normal text-gray-400">명</span></p>
                }
              </div>
            </div>
            {/* 기간별 통계 */}
            <div className="mt-4 grid grid-cols-3 divide-x divide-gray-100 rounded-xl bg-gray-50 py-2.5">
              {[
                { label: "어제", key: "yesterday" as const },
                { label: "7일", key: "week" as const },
                { label: "한달", key: "month" as const },
              ].map(({ label, key }) => (
                <div key={key} className="flex flex-col items-center">
                  <span className="text-xs text-gray-400">{label}</span>
                  {isLoading || !card.period
                    ? <div className="mt-1 h-5 w-8 animate-pulse rounded bg-gray-200" />
                    : <span className="mt-0.5 text-sm font-semibold text-gray-700">+{card.period[key].toLocaleString()}</span>
                  }
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* 전체 가입자 카드 */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">전체 가입자</p>
              {isLoading
                ? <div className="mt-1 h-7 w-16 animate-pulse rounded-md bg-gray-100" />
                : <p className="text-2xl font-bold text-indigo-700">{(stats?.total ?? 0).toLocaleString()}<span className="ml-1 text-sm font-normal text-gray-400">명</span></p>
              }
            </div>
          </div>
          {/* 기간별 통계 (개인고객 + 시공업체 합산) */}
          <div className="mt-4 grid grid-cols-3 divide-x divide-gray-100 rounded-xl bg-gray-50 py-2.5">
            {[
              { label: "어제", key: "yesterday" as const },
              { label: "7일", key: "week" as const },
              { label: "한달", key: "month" as const },
            ].map(({ label, key }) => {
              const total = periodStats
                ? (periodStats.consumer[key] + periodStats.provider[key])
                : null;
              return (
                <div key={key} className="flex flex-col items-center">
                  <span className="text-xs text-gray-400">{label}</span>
                  {isLoading || total === null
                    ? <div className="mt-1 h-5 w-8 animate-pulse rounded bg-gray-200" />
                    : (
                      <span className="mt-0.5 text-sm font-semibold text-gray-700">+{total.toLocaleString()}</span>
                    )
                  }
                  {!isLoading && total !== null && (
                    <div className="mt-0.5 flex gap-1.5 text-[10px] text-gray-400">
                      <span className="text-blue-500">개 {periodStats!.consumer[key]}</span>
                      <span>·</span>
                      <span className="text-violet-500">업 {periodStats!.provider[key]}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      </CollapsiblePanel>

      {/* 전문분야별 업체 현황 */}
      <CollapsiblePanel title="전문분야별 업체 현황" subtitle="전체 누적 기준" storageKey="admin-dash-category">
        {isCatLoading ? (
          <div className="flex gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 w-24 animate-pulse rounded-xl bg-gray-100" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
            {categoryStats.map((cat) => (
              <Link
                key={cat.name}
                href={`/admin/providers?category=${encodeURIComponent(cat.name)}`}
                className="flex flex-col items-center justify-center rounded-xl border border-gray-100 bg-gray-50 px-3 py-3 text-center transition hover:border-indigo-300 hover:bg-indigo-50"
              >
                <span className="text-xl font-bold text-indigo-600">{cat.count}</span>
                <span className="mt-0.5 text-xs text-gray-500 leading-tight">{cat.name}</span>
              </Link>
            ))}
          </div>
        )}
      </CollapsiblePanel>

      {/* 견적요청 & 입찰 현황 */}
      <CollapsiblePanel
        title="견적요청 & 입찰 현황"
        subtitle="일별 프로젝트 요청건수 및 누적 입찰 통계"
        storageKey="admin-dash-activity"
        headerRight={
          <div className="flex gap-1.5">
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setActivityDays(d)}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
                  activityDays === d
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                {d}일
              </button>
            ))}
          </div>
        }
      >
        {/* 요약 카드 3개 */}
        <div className="mb-5 grid grid-cols-3 gap-3">
          {[
            { label: "총 프로젝트 요청", value: activitySummary?.totalProjects, color: "text-indigo-600", sub: "누적 전체" },
            { label: "총 업체 입찰", value: activitySummary?.totalBids, color: "text-violet-600", sub: "견적 제시한 업체" },
            { label: "매칭 성공", value: activitySummary?.totalMatches, color: "text-emerald-600", sub: "계약완료" },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
              <p className="text-xs text-gray-400">{item.label}</p>
              {isActivityLoading || item.value === undefined
                ? <div className="mt-1.5 h-6 w-14 animate-pulse rounded bg-gray-200" />
                : <p className={`mt-0.5 text-2xl font-bold ${item.color}`}>{item.value.toLocaleString()}<span className="ml-1 text-xs font-normal text-gray-400">건</span></p>
              }
              <p className="mt-0.5 text-[10px] text-gray-400">{item.sub}</p>
            </div>
          ))}
        </div>

        {/* 일별 견적요청 차트 */}
        {isActivityLoading ? (
          <div className="flex h-56 items-center justify-center">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={activityData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }} barSize={activityDays <= 7 ? 28 : activityDays <= 14 ? 20 : 12}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} interval={activityDays <= 7 ? 0 : "preserveStartEnd"} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ borderRadius: "10px", border: "1px solid #e5e7eb", fontSize: "12px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
                formatter={(value: unknown) => [`${value != null ? value : 0}건`]}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }}
                formatter={(value) => value === "projects" ? "프로젝트 요청" : value}
              />
              <Bar dataKey="projects" name="projects" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CollapsiblePanel>

      {/* 일별 가입 추이 */}
      <CollapsiblePanel
        title="일별 가입 추이"
        subtitle="최근 30일"
        storageKey="admin-dash-signup"
        headerRight={
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-500" />개인고객</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-violet-500" />시공업체</span>
          </div>
        }
      >
        {isChartLoading ? (
          <div className="flex h-56 items-center justify-center">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ borderRadius: "10px", border: "1px solid #e5e7eb", fontSize: "12px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
                formatter={(value: unknown, name: unknown) => [`${value != null ? value : 0}명`, name === "consumer" ? "개인고객" : "시공업체"]}
              />
              <Line type="monotone" dataKey="consumer" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="provider" stroke="#8b5cf6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CollapsiblePanel>

      {/* 업체들 총 계약완료 금액 */}
      <CollapsiblePanel
        title="일자별 계약완료 금액"
        subtitle="전체 업체 총 매출 · 최근 30일 기준"
        storageKey="admin-dash-sales"
        headerRight={
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2">
            <p className="text-[10px] text-emerald-600">총 매출금액</p>
            <p className="text-lg font-bold tabular-nums text-emerald-700 transition-all duration-300">
              ₩{formatMoney(animatedTotalSales)}
            </p>
          </div>
        }
      >
        {isSalesLoading ? (
          <div className="flex h-56 items-center justify-center">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          </div>
        ) : (
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
        )}
      </CollapsiblePanel>
      </div>
    </div>
  );
}
