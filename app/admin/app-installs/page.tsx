"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type AppInstallRow = {
  id: string;
  install_id: string;
  platform: string;
  app_version: string | null;
  app_build: string | null;
  device_model: string | null;
  device_manufacturer: string | null;
  os_version: string | null;
  first_launch_at: string;
  user_id: string | null;
  created_at: string;
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminAppInstallsPage() {
  const [rows, setRows] = useState<AppInstallRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [platformFilter, setPlatformFilter] = useState<string>("");

  useEffect(() => {
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

      load();
      setIsLoading(false);
    };

    init();
  }, []);

  const load = async () => {
    setError(null);
    let query = supabase
      .from("app_installs")
      .select("*")
      .order("first_launch_at", { ascending: false })
      .limit(500);

    if (platformFilter === "android" || platformFilter === "ios") {
      query = query.eq("platform", platformFilter);
    }

    const { data, error: err } = await query;

    if (err) {
      setError(err.message);
      setRows([]);
      return;
    }
    setRows((data ?? []) as AppInstallRow[]);
  };

  useEffect(() => {
    if (!isLoading) load();
  }, [platformFilter]);

  if (isLoading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <span className="text-gray-500">로딩 중...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-lg font-semibold text-gray-800">앱 설치 정보</h1>
        <div className="flex items-center gap-2">
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400"
          >
            <option value="">전체</option>
            <option value="android">Android</option>
            <option value="ios">iOS</option>
          </select>
          <button
            type="button"
            onClick={load}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            새로고침
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-3 text-left font-medium text-gray-600">플랫폼</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">앱 버전</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">기기</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">OS</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">첫 실행</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">회원</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  기록이 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-3">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${r.platform === "android" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}`}>
                      {r.platform}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {r.app_version ?? "-"}
                    {r.app_build && <span className="ml-1 text-gray-400">({r.app_build})</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {[r.device_manufacturer, r.device_model].filter(Boolean).join(" ") || "-"}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{r.os_version ?? "-"}</td>
                  <td className="px-4 py-3 text-gray-600">{formatDateTime(r.first_launch_at)}</td>
                  <td className="px-4 py-3 text-gray-500">{r.user_id ? "로그인됨" : "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500">
        APK/앱 설치 후 첫 실행 시 자동 기록됩니다. 최근 500건 표시.
      </p>
    </div>
  );
}
