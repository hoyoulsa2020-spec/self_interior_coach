"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function ImpersonatePage() {
  const searchParams = useSearchParams();
  const userId = searchParams.get("userId");
  const [message, setMessage] = useState("대리 로그인 준비 중...");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setMessage("유효하지 않은 접근입니다.");
      setError("userId가 필요합니다.");
      return;
    }
    handleImpersonate(userId);
  }, [userId]);

  async function handleImpersonate(targetUserId: string) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError("로그인이 필요합니다. 관리자 계정으로 로그인해 주세요.");
        setMessage("인증 실패");
        return;
      }

      const res = await fetch(`/api/admin/impersonate?userId=${targetUserId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "대리 로그인에 실패했습니다.");
        setMessage("실패");
        return;
      }

      if (json.loginUrl) {
        window.location.replace(json.loginUrl);
        return;
      }

      setError("로그인 링크를 받지 못했습니다.");
      setMessage("실패");
    } catch (err) {
      console.error("[Impersonate] 오류:", err);
      setError("예기치 못한 오류가 발생했습니다.");
      setMessage("실패");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm max-w-md">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100">
          <svg className="h-6 w-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <h2 className="text-base font-semibold text-gray-800">관리자 대리 로그인</h2>
        <p className="mt-2 text-sm text-gray-500">{message}</p>
        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
        <button
          type="button"
          onClick={() => window.close()}
          className="mt-6 rounded-xl bg-gray-100 px-5 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-200"
        >
          창 닫기
        </button>
      </div>
    </div>
  );
}
