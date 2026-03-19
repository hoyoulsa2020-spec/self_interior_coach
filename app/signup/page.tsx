"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import AlertModal from "@/components/AlertModal";

export default function SignupPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [userType, setUserType] = useState<"consumer" | "provider">("consumer");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [successAlert, setSuccessAlert] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }

    setIsLoading(true);

    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name,
            phone,
            userType,
          },
        },
      });

      if (authError) {
        console.error("Signup auth error:", authError);
        setError(authError.message);
        return;
      }

      console.log("Auth 성공:", data);
      setEmail("");
      setPassword("");
      setConfirmPassword("");
      setName("");
      setPhone("");
      setUserType("consumer");
      setSuccessAlert(true);
    } catch (err) {
      console.error("Unexpected signup error:", err);
      setError("회원가입 중 알 수 없는 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
    <main className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <header className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            회원가입
          </h1>
          <p className="mt-2 text-sm text-foreground/70">
            셀프 코칭 서비스를 이용하기 위해 계정을 만들어 주세요.
          </p>
        </header>

        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-2xl bg-white/90 shadow-sm ring-1 ring-black/5 backdrop-blur-sm px-5 py-6 sm:px-6"
        >
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
            <label className="block text-sm font-medium text-gray-900">
              비밀번호
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                placeholder="영문, 숫자, 특수문자 포함 8자 이상"
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

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-900">
              비밀번호 확인
            </label>
            <div className="relative">
              <input
                type={showConfirmPassword ? "text" : "password"}
                required
                placeholder="비밀번호를 다시 입력해주세요"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 pr-10 text-sm outline-none placeholder:text-gray-400 focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label={showConfirmPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
              >
                {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-900">
                이름
              </label>
              <input
                type="text"
                required
                placeholder="홍길동"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm outline-none placeholder:text-gray-400 focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-900">
                전화번호
              </label>
              <input
                type="tel"
                required
                inputMode="numeric"
                placeholder="010-1234-5678"
                value={phone}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "").slice(0, 11);
                  let formatted = digits;
                  if (digits.length > 7) {
                    formatted = `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
                  } else if (digits.length > 3) {
                    formatted = `${digits.slice(0, 3)}-${digits.slice(3)}`;
                  }
                  setPhone(formatted);
                }}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm outline-none placeholder:text-gray-400 focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          </div>

          <div className="space-y-2">
            <span className="block text-sm font-medium text-gray-900">
              사용자 유형
            </span>

            <div className="grid grid-cols-2 gap-3">
              <label
                className={`flex cursor-pointer items-center justify-center rounded-xl border px-3 py-2.5 text-xs font-medium transition ${
                  userType === "consumer"
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "border-gray-200 bg-gray-50 text-gray-800 hover:border-indigo-400 hover:bg-indigo-50"
                }`}
              >
                <input
                  type="radio"
                  name="userType"
                  value="consumer"
                  checked={userType === "consumer"}
                  className="sr-only"
                  onChange={() => setUserType("consumer")}
                />
                개인고객
              </label>

              <label
                className={`flex cursor-pointer items-center justify-center rounded-xl border px-3 py-2.5 text-xs font-medium transition ${
                  userType === "provider"
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "border-gray-200 bg-gray-50 text-gray-800 hover:border-indigo-400 hover:bg-indigo-50"
                }`}
              >
                <input
                  type="radio"
                  name="userType"
                  value="provider"
                  checked={userType === "provider"}
                  className="sr-only"
                  onChange={() => setUserType("provider")}
                />
                시공업체
              </label>
            </div>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={isLoading}
            className="mt-2 inline-flex w-full items-center justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 active:bg-indigo-800 disabled:cursor-not-allowed disabled:bg-indigo-300"
          >
            {isLoading ? "가입 중..." : "회원가입 완료"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-foreground/60">
          이미 계정이 있으신가요?{" "}
          <a href="/login" className="font-medium text-indigo-600 hover:underline">
            로그인하기
          </a>
        </p>
      </div>
    </main>
    {successAlert && (
      <AlertModal
        title="회원가입 완료"
        message="회원가입이 완료되었습니다. 이메일 인증을 확인해주세요."
        variant="info"
        onClose={() => { setSuccessAlert(false); router.push("/login"); }}
      />
    )}
    </>
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