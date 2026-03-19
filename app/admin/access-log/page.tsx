"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import CollapsiblePanel from "@/components/CollapsiblePanel";

type AccessLogRow = {
  user_id: string;
  access_date: string;
  first_visit_at: string;
  last_visit_at: string;
  visit_count: number;
  name: string | null;
  email: string | null;
  business_name: string | null;
  role: string;
};

const ROLE_LABEL: Record<string, string> = {
  consumer: "개인",
  provider: "업체",
  admin: "관리자",
  super_admin: "관리자",
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type VisitorStats = {
  totalVisits: number;
  totalRevisits: number;
  providerCount: number;
  consumerCount: number;
  totalVisitors: number;
};

export default function AdminAccessLogPage() {
  const [logs, setLogs] = useState<AccessLogRow[]>([]);
  const [stats, setStats] = useState<VisitorStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const init = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;

      if (!session) {
        window.location.href = "/login";
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (profile?.role !== "admin" && profile?.role !== "super_admin") {
        window.location.href = "/login";
        return;
      }

      loadStats();
      loadLogs(dateFrom, dateTo);
      setIsLoading(false);
    };

    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadStats = async () => {
    const { data: logData, error: logError } = await supabase
      .from("daily_access_logs")
      .select("user_id, visit_count");

    if (logError || !logData?.length) {
      setStats({
        totalVisits: 0,
        totalRevisits: 0,
        providerCount: 0,
        consumerCount: 0,
        totalVisitors: 0,
      });
      return;
    }

    const userIds = [...new Set(logData.map((r) => r.user_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, role")
      .in("user_id", userIds);

    const roleMap = new Map((profiles ?? []).map((p) => [p.user_id, p.role]));

    let totalVisits = 0;
    let totalRevisits = 0;
    const providerIds = new Set<string>();
    const consumerIds = new Set<string>();

    logData.forEach((row) => {
      totalVisits += row.visit_count;
      totalRevisits += Math.max(0, row.visit_count - 1);
      const role = roleMap.get(row.user_id) ?? "consumer";
      if (role === "provider") providerIds.add(row.user_id);
      else if (role === "consumer") consumerIds.add(row.user_id);
    });

    setStats({
      totalVisits,
      totalRevisits,
      providerCount: providerIds.size,
      consumerCount: consumerIds.size,
      totalVisitors: userIds.length,
    });
  };

  const loadLogs = async (from: string, to: string) => {
    setIsLoading(true);
    setError(null);

    const { data: logData, error: logError } = await supabase
      .from("daily_access_logs")
      .select("user_id, access_date, first_visit_at, last_visit_at, visit_count")
      .gte("access_date", from)
      .lte("access_date", to)
      .order("access_date", { ascending: false })
      .order("visit_count", { ascending: false });

    if (logError) {
      setError(`조회 오류: ${logError.message}`);
      setIsLoading(false);
      return;
    }

    const userIds = [...new Set((logData ?? []).map((r) => r.user_id))];
    if (userIds.length === 0) {
      setLogs([]);
      setIsLoading(false);
      return;
    }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, name, email, business_name, role")
      .in("user_id", userIds);

    const profileMap = new Map(
      (profiles ?? []).map((p) => [p.user_id, p])
    );

    const rows: AccessLogRow[] = (logData ?? []).map((row) => {
      const p = profileMap.get(row.user_id);
      return {
        ...row,
        name: p?.name ?? null,
        email: p?.email ?? null,
        business_name: p?.business_name ?? null,
        role: p?.role ?? "consumer",
      };
    });

    setLogs(rows);
    setIsLoading(false);
  };

  const handleSearch = () => {
    loadLogs(dateFrom, dateTo);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-800">접속로그</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          계정별 일별 로그인 횟수, 최초방문, 24시간 기준 재방문 횟수
        </p>
      </div>

      {/* 기간 선택 */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
        <span className="text-sm font-medium text-gray-700">기간</span>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
        />
        <span className="text-gray-400">~</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={isLoading}
          className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          조회
        </button>
      </div>

      {/* 방문자 통계 (전체 기간) */}
      <CollapsiblePanel
        title="방문자 통계 (전체 누적)"
        defaultCollapsed={true}
        storageKey="admin-access-log-stats"
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
            <p className="text-xs text-gray-500">총 접속 횟수</p>
            <p className="mt-0.5 text-xl font-bold text-indigo-600">
              {stats ? stats.totalVisits.toLocaleString() : "-"}
            </p>
            <p className="text-[10px] text-gray-400">회</p>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
            <p className="text-xs text-gray-500">재방문 횟수</p>
            <p className="mt-0.5 text-xl font-bold text-violet-600">
              {stats ? stats.totalRevisits.toLocaleString() : "-"}
            </p>
            <p className="text-[10px] text-gray-400">회</p>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
            <p className="text-xs text-gray-500">공급업체 방문</p>
            <p className="mt-0.5 text-xl font-bold text-violet-600">
              {stats ? stats.providerCount.toLocaleString() : "-"}
            </p>
            <p className="text-[10px] text-gray-400">명</p>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
            <p className="text-xs text-gray-500">개인고객 방문</p>
            <p className="mt-0.5 text-xl font-bold text-blue-600">
              {stats ? stats.consumerCount.toLocaleString() : "-"}
            </p>
            <p className="text-[10px] text-gray-400">명</p>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 sm:col-span-2 lg:col-span-1">
            <p className="text-xs text-gray-500">총 방문자</p>
            <p className="mt-0.5 text-xl font-bold text-gray-800">
              {stats ? stats.totalVisitors.toLocaleString() : "-"}
            </p>
            <p className="text-[10px] text-gray-400">명</p>
          </div>
        </div>
      </CollapsiblePanel>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full table-fixed divide-y divide-gray-200 text-xs">
              <colgroup>
                <col className="w-10" />
                <col />
                <col className="w-14" />
                <col className="w-20" />
                <col className="w-12" />
                <col className="w-12" />
              </colgroup>
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-2 py-1.5 text-center text-[10px] font-medium text-gray-500">No</th>
                  <th className="px-2 py-1.5 text-left text-[10px] font-medium text-gray-500">계정</th>
                  <th className="px-2 py-1.5 text-center text-[10px] font-medium text-gray-500">구분</th>
                  <th className="px-2 py-1.5 text-left text-[10px] font-medium text-gray-500">최초</th>
                  <th className="px-2 py-1.5 text-center text-[10px] font-medium text-gray-500">접속</th>
                  <th className="px-2 py-1.5 text-center text-[10px] font-medium text-gray-500">재방</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-2 py-8 text-center text-[11px] text-gray-400">
                      해당 기간에 접속 기록이 없습니다.
                    </td>
                  </tr>
                ) : (
                  logs.map((row, index) => (
                    <tr key={`${row.user_id}-${row.access_date}`} className="hover:bg-gray-50/80">
                      <td className="px-2 py-1.5 text-center text-[11px] font-medium text-gray-600">
                        {logs.length - index}
                      </td>
                      <td className="px-2 py-1.5 text-[11px] text-gray-700 truncate">
                        {row.business_name || row.name || "-"}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <span className="inline-block rounded bg-gray-100 px-1 py-0.5 text-[10px] text-gray-600">
                          {ROLE_LABEL[row.role] ?? row.role}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-[10px] text-gray-500">
                        {formatDateTime(row.first_visit_at)}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <span className="text-[11px] font-semibold text-indigo-600">{row.visit_count}</span>
                        <span className="text-[10px] text-gray-400">회</span>
                      </td>
                      <td className="px-2 py-1.5 text-center text-[11px] text-gray-600">
                        {Math.max(0, row.visit_count - 1)}회
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
