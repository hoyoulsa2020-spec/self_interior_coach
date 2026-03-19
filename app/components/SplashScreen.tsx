"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const SPLASH_DURATION_MS = 4000;
const FADE_OUT_MS = 500;

async function getRedirectPath(): Promise<string> {
  const { data: userData, error: getUserError } = await supabase.auth.getUser();
  if (getUserError || !userData.user) return "/login";

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, onboarding_completed")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (profileError) return "/login";

  const role = profile?.role ?? "consumer";

  if (role === "admin" || role === "super_admin") return "/admin";
  if (role === "provider") {
    if (!profile?.onboarding_completed) return "/provider/onboarding";
    return "/provider/dashboard";
  }
  return "/dashboard";
}

export default function SplashScreen() {
  const router = useRouter();
  const [phase, setPhase] = useState<"show" | "fadeout">("show");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("fadeout"), SPLASH_DURATION_MS);

    const t2 = setTimeout(async () => {
      const path = await getRedirectPath();
      router.replace(path);
    }, SPLASH_DURATION_MS + FADE_OUT_MS);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [router]);

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-gradient-to-br from-indigo-600 via-indigo-700 to-indigo-900 transition-opacity duration-500 ${
        phase === "fadeout" ? "opacity-0" : "opacity-100"
      }`}
    >
      {/* 배경 장식 */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl animate-pulse" />
        <div className="absolute -bottom-20 -right-20 h-80 w-80 rounded-full bg-indigo-400/20 blur-3xl animate-pulse" style={{ animationDelay: "0.5s" }} />
        <div className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/5 blur-2xl" />
      </div>

      {/* 로고 + 텍스트 */}
      <div className="relative flex flex-col items-center gap-4">
        {/* 셀코 (아이콘 위) */}
        <div
          className="splash-text flex flex-col items-center"
          style={{
            animation: "splash-fade-up 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
          }}
        >
          <h1 className="text-4xl font-bold tracking-tight text-white drop-shadow-lg sm:text-5xl">
            셀코
          </h1>
        </div>

        {/* 아파트 아이콘 */}
        <div
          className="splash-logo flex h-20 w-20 items-center justify-center rounded-2xl bg-white/95 shadow-2xl"
          style={{
            animation: "splash-scale-in 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.15s forwards",
          }}
        >
          <svg
            width="44"
            height="44"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-indigo-600"
          >
            <path d="M3 21h18" />
            <path d="M5 21V9l7-4 7 4v12" />
            <path d="M9 21v-4h6v4" />
            <path d="M9 13h6" />
            <path d="M9 9h6" />
          </svg>
        </div>

        {/* Self Interior Coach (아이콘 아래) */}
        <div
          className="splash-text flex flex-col items-center"
          style={{
            animation: "splash-fade-up 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.3s forwards",
          }}
        >
          <p className="text-sm font-medium text-white/90 tracking-widest">Self Interior Coach</p>
        </div>

        {/* 로딩 인디케이터 */}
        <div
          className="splash-bar mt-4 h-1 w-24 overflow-hidden rounded-full bg-white/30"
          style={{ animation: "splash-fade-in 0.6s 0.6s forwards" }}
        >
          <div
            className="h-full w-full rounded-full bg-white"
            style={{ animation: "splash-progress 2s ease-in-out forwards" }}
          />
        </div>
      </div>
    </div>
  );
}
