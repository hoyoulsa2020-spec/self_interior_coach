"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import PushNotificationSettings from "@/app/components/PushNotificationSettings";

type Profile = {
  user_id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  created_at: string;
};

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeCount, setActiveCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // 편집 필드
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");

  // 탈퇴
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawPassword, setWithdrawPassword] = useState("");
  const [showWithdrawPw, setShowWithdrawPw] = useState(false);

  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const init = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      if (!session) { window.location.href = "/login"; return; }

      const [profileRes, projectsRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("user_id, name, email, phone, role, status, created_at")
          .eq("user_id", session.user.id)
          .maybeSingle(),
        supabase
          .from("projects")
          .select("*", { count: "exact", head: true })
          .eq("user_id", session.user.id)
          .eq("status", "active"),
      ]);

      if (profileRes.data) {
        setProfile({ ...profileRes.data, email: session.user.email ?? profileRes.data.email });
        setEditName(profileRes.data.name ?? "");
        setEditPhone(profileRes.data.phone ?? "");
      }
      setActiveCount(projectsRes.count ?? 0);
      setIsLoading(false);
    };
    init();
  }, []);

  const handleSave = async () => {
    if (!profile) return;
    setSaveError(null);
    setSaveSuccess(false);
    setIsSaving(true);

    const { error } = await supabase
      .from("profiles")
      .update({ name: editName.trim(), phone: editPhone.trim() })
      .eq("user_id", profile.user_id);

    if (error) {
      setSaveError(error.message);
    } else {
      setProfile((prev) => prev ? { ...prev, name: editName.trim(), phone: editPhone.trim() } : prev);
      setSaveSuccess(true);
      setIsEditing(false);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
    setIsSaving(false);
  };

  const handleCancel = () => {
    if (!profile) return;
    setEditName(profile.name ?? "");
    setEditPhone(profile.phone ?? "");
    setSaveError(null);
    setIsEditing(false);
  };

  const handleWithdraw = async () => {
    if (!profile) return;
    if (!withdrawPassword) { setWithdrawError("비밀번호를 입력해주세요."); return; }
    setWithdrawError(null);
    setIsWithdrawing(true);

    // 비밀번호 재인증
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: profile.email,
      password: withdrawPassword,
    });
    if (signInError) {
      setWithdrawError("비밀번호가 올바르지 않습니다.");
      setIsWithdrawing(false);
      return;
    }

    // profiles 상태를 inactive로 변경 후 로그아웃
    const { error } = await supabase
      .from("profiles")
      .update({ status: "inactive" })
      .eq("user_id", profile.user_id);

    if (error) {
      setWithdrawError(error.message);
      setIsWithdrawing(false);
      return;
    }

    await supabase.auth.signOut();
    window.location.href = "/login?withdrawn=1";
  };

  const ROLE_LABEL: Record<string, string> = {
    consumer: "개인고객",
    provider: "공급업체",
    admin: "관리자",
    super_admin: "최고관리자",
  };

  const STATUS_LABEL: Record<string, { label: string; color: string }> = {
    active:   { label: "정상", color: "bg-green-50 text-green-700" },
    inactive: { label: "비활성", color: "bg-red-50 text-red-600" },
    pending:  { label: "대기", color: "bg-yellow-50 text-yellow-700" },
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="py-20 text-center text-sm text-gray-400">프로필 정보를 불러올 수 없습니다.</div>
    );
  }

  const statusInfo = STATUS_LABEL[profile.status] ?? { label: profile.status, color: "bg-gray-100 text-gray-500" };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-800">내 정보</h1>
        <p className="mt-0.5 text-sm text-gray-500">계정 정보를 확인하고 수정할 수 있습니다.</p>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {/* 아바타 + 이름 */}
        <div className="col-span-2 flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:col-span-1">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-xl font-bold text-indigo-600">
            {(profile.name || "?").charAt(0)}
          </div>
          <div>
            <p className="text-base font-semibold text-gray-800">{profile.name || "—"}</p>
            <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusInfo.color}`}>
              {statusInfo.label}
            </span>
          </div>
        </div>

        {/* 역할 */}
        <div className="flex flex-col justify-center rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs text-gray-400">계정 유형</p>
          <p className="mt-1 text-sm font-semibold text-gray-800">{ROLE_LABEL[profile.role] ?? profile.role}</p>
        </div>

        {/* 진행중 프로젝트 */}
        <div className="flex flex-col justify-center rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs text-gray-400">진행중 프로젝트</p>
          <p className="mt-1 text-2xl font-bold text-indigo-600">
            {activeCount ?? "—"}
            <span className="ml-1 text-sm font-normal text-gray-400">개</span>
          </p>
        </div>
      </div>

      {/* 상세 정보 */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-gray-800">계정 정보</h2>
          {!isEditing && (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              수정
            </button>
          )}
        </div>

        <div className="divide-y divide-gray-50 px-5">
          {/* 이름 */}
          <div className="flex items-center gap-4 py-4">
            <span className="w-24 shrink-0 text-xs font-medium text-gray-400">이름</span>
            {isEditing ? (
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
              />
            ) : (
              <span className="text-sm text-gray-800">{profile.name || "—"}</span>
            )}
          </div>

          {/* 이메일 */}
          <div className="flex items-center gap-4 py-4">
            <span className="w-24 shrink-0 text-xs font-medium text-gray-400">이메일</span>
            <span className="text-sm text-gray-800">{profile.email || "—"}</span>
          </div>

          {/* 전화번호 */}
          <div className="flex items-center gap-4 py-4">
            <span className="w-24 shrink-0 text-xs font-medium text-gray-400">전화번호</span>
            {isEditing ? (
              <input
                type="tel"
                value={editPhone}
                onChange={(e) => setEditPhone(formatPhone(e.target.value))}
                placeholder="010-0000-0000"
                className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
              />
            ) : (
              <span className="text-sm text-gray-800">{profile.phone || "—"}</span>
            )}
          </div>

          {/* 가입일 */}
          <div className="flex items-center gap-4 py-4">
            <span className="w-24 shrink-0 text-xs font-medium text-gray-400">가입일</span>
            <span className="text-sm text-gray-800">
              {profile.created_at
                ? new Date(profile.created_at).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })
                : "—"}
            </span>
          </div>

          {/* 푸시 알림 */}
          <div className="flex min-w-0 flex-col gap-3 py-4 sm:flex-row sm:items-center sm:gap-4">
            <span className="w-24 shrink-0 text-xs font-medium text-gray-400">푸시 알림</span>
            <div className="min-w-0 flex-1">
              <PushNotificationSettings role="consumer" />
            </div>
          </div>
        </div>

        {/* 수정 버튼 영역 */}
        {isEditing && (
          <div className="border-t border-gray-100 px-5 py-3">
            {saveError && (
              <p className="mb-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-600">{saveError}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-lg border border-gray-200 px-4 py-1.5 text-xs text-gray-600 transition hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
              >
                {isSaving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 회원 탈퇴 */}
      <div className="rounded-2xl border border-red-100 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-red-600">회원 탈퇴</h2>
            <p className="mt-0.5 text-xs text-gray-400">탈퇴 시 계정이 비활성화되며 복구가 어렵습니다.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowWithdraw(true)}
            className="rounded-lg border border-red-200 px-4 py-1.5 text-xs font-medium text-red-500 transition hover:bg-red-50"
          >
            탈퇴하기
          </button>
        </div>
      </div>

      {/* 저장 성공 토스트 */}
      {saveSuccess && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-xl bg-gray-800 px-5 py-3 text-sm text-white shadow-lg">
          정보가 저장되었습니다.
        </div>
      )}

      {/* 탈퇴 확인 모달 */}
      {showWithdraw && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <h3 className="mt-4 text-base font-semibold text-gray-800">정말 탈퇴하시겠습니까?</h3>
            <p className="mt-2 text-sm text-gray-500">
              탈퇴하면 계정이 <span className="font-medium text-red-500">비활성화</span>되고
              진행 중인 프로젝트 및 데이터에 접근할 수 없게 됩니다.
            </p>
            {/* 비밀번호 입력 */}
            <div className="relative mt-4">
              <input
                type={showWithdrawPw ? "text" : "password"}
                placeholder="비밀번호 입력"
                value={withdrawPassword}
                onChange={(e) => setWithdrawPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleWithdraw()}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 pr-10 text-sm outline-none focus:border-red-300 focus:bg-white focus:ring-2 focus:ring-red-100"
              />
              <button
                type="button"
                onClick={() => setShowWithdrawPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showWithdrawPw ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>

            {withdrawError && (
              <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{withdrawError}</p>
            )}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => { setShowWithdraw(false); setWithdrawError(null); setWithdrawPassword(""); }}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm text-gray-600 transition hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleWithdraw}
                disabled={isWithdrawing}
                className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-medium text-white transition hover:bg-red-600 disabled:opacity-50"
              >
                {isWithdrawing ? "처리 중..." : "탈퇴하기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
