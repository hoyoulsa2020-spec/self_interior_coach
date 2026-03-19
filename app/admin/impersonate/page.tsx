"use client";

// TODO: 관리자 계정 대리 로그인 기능 필요
// Supabase Admin SDK (service_role key) 를 사용하는 서버 API Route를 별도로 구현해야 합니다.
// 예시 흐름:
//   1. 이 페이지 로드 시 서버 API(/api/admin/impersonate?userId=...) 호출
//   2. 서버에서 supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email }) 호출
//   3. 반환된 링크로 리다이렉트 → 해당 사용자로 자동 로그인
//
// ⚠️ service_role key는 절대 클라이언트에 노출하지 마세요.

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function ImpersonatePage() {
  const searchParams = useSearchParams();
  const userId = searchParams.get("userId");
  const [message, setMessage] = useState("대리 로그인 준비 중...");

  useEffect(() => {
    if (!userId) {
      setMessage("유효하지 않은 접근입니다.");
      return;
    }

    // TODO: 아래 함수를 실제 구현으로 교체하세요
    // 현재는 플레이스홀더만 존재합니다.
    handleImpersonate(userId);
  }, [userId]);

  async function handleImpersonate(targetUserId: string) {
    // TODO: 관리자 계정 대리 로그인 기능 필요
    // 예시:
    // const res = await fetch(`/api/admin/impersonate?userId=${targetUserId}`);
    // const { loginUrl } = await res.json();
    // window.location.href = loginUrl;

    console.log("[Impersonate] target userId:", targetUserId);
    setMessage(`대리 로그인 기능 준비 중입니다. (userId: ${targetUserId})`);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100">
          <svg className="h-6 w-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <h2 className="text-base font-semibold text-gray-800">관리자 대리 로그인</h2>
        <p className="mt-2 text-sm text-gray-500">{message}</p>
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
