"use client";

import { FormEvent, useEffect, useState } from "react";
import { LOGIN_VIDEOS, pickRandomVideo } from "@/lib/backgroundVideos";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const STORAGE_KEY = "sc_remembered_login";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isResetLoading, setIsResetLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const { email: savedEmail, password: savedPassword } = JSON.parse(saved);
        setEmail(savedEmail ?? "");
        setPassword(savedPassword ?? "");
        setRememberMe(true);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // profiles.user_id 컬럼에 UNIQUE 제약이 있어야 중복 방지가 완전히 동작합니다.
  // SQL: ALTER TABLE profiles ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);
  const ensureProfile = async () => {
    const { data: userData, error: getUserError } = await supabase.auth.getUser();

    if (getUserError || !userData.user) {
      console.error("유저 정보 조회 실패:", getUserError);
      return;
    }

    const user = userData.user;
    const metadata = user.user_metadata as Record<string, string>;

    const { error: insertError } = await supabase.from("profiles").insert({
      user_id: user.id,
      email: user.email ?? "",
      name: metadata.name ?? "",
      phone: metadata.phone ?? "",
      role: metadata.userType ?? "consumer",
      status: "pending",
    });

    if (!insertError) {
      console.log("Profile 생성 완료");
      return;
    }

    // 23505: unique_violation — 이미 존재하는 row, 정상 케이스
    if (insertError.code === "23505") {
      console.log("Profile 이미 존재함, 건너뜀");
      return;
    }

    console.error("Profile 생성 오류:", insertError);
  };

  const redirectByRole = async () => {
    const { data: userData, error: getUserError } = await supabase.auth.getUser();

    if (getUserError || !userData.user) {
      console.error("[redirectByRole] 유저 조회 실패:", getUserError);
      window.location.href = "/dashboard";
      return;
    }

    // role만 먼저 조회 — onboarding_completed 컬럼 부재 시 에러 방지
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (profileError) {
      console.error("[redirectByRole] profile 조회 오류:", profileError.message);
      window.location.href = "/dashboard";
      return;
    }

    const role = profile?.role ?? "consumer";
    console.log("[redirectByRole] role:", role);

    if (role === "admin" || role === "super_admin") {
      window.location.href = "/admin";
      return;
    }

    if (role === "provider") {
      // provider일 때만 onboarding_completed 추가 조회
      const { data: providerProfile } = await supabase
        .from("profiles")
        .select("onboarding_completed, business_name")
        .eq("user_id", userData.user.id)
        .maybeSingle();

      if (!providerProfile?.onboarding_completed) {
        window.location.href = "/provider/onboarding";
        return;
      }
      window.location.href = "/provider/dashboard";
      return;
    }

    window.location.href = "/dashboard";
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setResetMessage(null);
    setIsLoading(true);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        console.error("로그인 오류:", signInError);
        setError("이메일 또는 비밀번호가 올바르지 않습니다.");
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        fetch("/api/access-log/record", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
          keepalive: true,
        }).catch(() => {});
      }

      if (rememberMe) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ email, password }));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }

      await ensureProfile();
      await redirectByRole();
    } catch (err) {
      console.error("예상치 못한 오류:", err);
      setError("로그인 중 알 수 없는 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    setError(null);
    setResetMessage(null);

    if (!email.trim()) {
      setError("이메일을 먼저 입력하세요.");
      return;
    }

    setIsResetLoading(true);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "/reset-password",
      });

      if (resetError) {
        console.error("비밀번호 재설정 오류:", resetError);
        setError("재설정 메일 전송에 실패했습니다. 다시 시도해 주세요.");
        return;
      }

      setResetMessage("비밀번호 재설정 메일을 전송했습니다. 이메일을 확인해 주세요.");
    } catch (err) {
      console.error("예상치 못한 오류:", err);
      setError("재설정 메일 전송 중 알 수 없는 오류가 발생했습니다.");
    } finally {
      setIsResetLoading(false);
    }
  };

  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  useEffect(() => {
    setVideoSrc(pickRandomVideo(LOGIN_VIDEOS));
  }, []);

  return (
    <main className="relative min-h-screen flex items-center justify-center overflow-hidden px-4 py-8">
      {/* 배경 영상 */}
      <div className="fixed inset-0 z-0 bg-black">
        {videoSrc && (
        <video
          key={videoSrc}
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        >
          <source
            src={videoSrc}
            type="video/mp4"
          />
        </video>
        )}
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" aria-hidden />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <header className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-white drop-shadow-md">
            로그인
          </h1>
          <p className="mt-2 text-sm text-white/90">
            셀인코치 서비스에 오신걸 환영합니다.
          </p>
        </header>

        <div className="rounded-2xl bg-white/90 shadow-sm ring-1 ring-black/5 backdrop-blur-sm px-5 py-6 sm:px-6">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-900">
                이메일
              </label>
              <input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm outline-none placeholder:text-gray-400 focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-900">
                  비밀번호
                </label>
                <button
                  type="button"
                  onClick={handleResetPassword}
                  disabled={isResetLoading}
                  className="text-xs text-indigo-600 hover:underline disabled:opacity-50"
                >
                  {isResetLoading ? "전송 중..." : "비밀번호를 잊으셨나요?"}
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="비밀번호를 입력하세요"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 pr-10 text-sm outline-none placeholder:text-gray-400 focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 accent-indigo-600"
              />
              <span className="text-xs text-gray-600">로그인 정보 기억하기</span>
            </label>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                {error}
              </p>
            )}

            {resetMessage && (
              <p className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
                {resetMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 active:bg-indigo-800 disabled:cursor-not-allowed disabled:bg-indigo-300"
            >
              {isLoading && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              )}
              {isLoading ? "로그인 중..." : "로그인"}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-white/80">
          계정이 없으신가요?{" "}
          <a href="/signup" className="font-medium text-indigo-200 hover:text-white hover:underline">
            회원가입하기
          </a>
        </p>
      </div>
    </main>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" x2="22" y1="2" y2="22" />
    </svg>
  );
}
