"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { pickRandomVideo, SPLASH_VIDEOS } from "@/lib/backgroundVideos";

const SPLASH_DURATION_MS = 5000;
const FADE_OUT_MS = 500;
const GRADIENT_STYLE = {
  background: "linear-gradient(180deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%)",
};

async function getRedirectPath(): Promise<string> {
  try {
    const { data } = await supabase.auth.getSession();
    const session = data?.session;
    if (!session?.user) return "/login";

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, onboarding_completed")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (profileError) return "/login";

    const role = profile?.role ?? "consumer";

    if (role === "admin" || role === "super_admin") return "/admin";
    if (role === "provider") {
      if (!profile?.onboarding_completed) return "/provider/onboarding";
      return "/provider/dashboard";
    }
    return "/dashboard";
  } catch {
    await supabase.auth.signOut({ scope: "local" });
    return "/login";
  }
}

export default function SplashScreen() {
  const [phase, setPhase] = useState<"show" | "fadeout">("show");
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [useGradient, setUseGradient] = useState(false); // SSR/초기: 검은 배경(서버·클라이언트 동일)

  useEffect(() => {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    const isCap = !!cap?.isNativePlatform?.();
    setUseGradient(isCap);
    if (!isCap) setVideoSrc(pickRandomVideo(SPLASH_VIDEOS));
  }, []);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("fadeout"), SPLASH_DURATION_MS);

    const t2 = setTimeout(async () => {
      const path = await getRedirectPath();
      window.location.href = path;
    }, SPLASH_DURATION_MS + FADE_OUT_MS);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden transition-opacity duration-500 ${
        phase === "fadeout" ? "opacity-0" : "opacity-100"
      }`}
    >
      {/* 웹: 배경 영상 / Capacitor 앱: 그라데이션 (Hydration 방지: 초기엔 검은 배경) */}
      <div className="absolute inset-0 bg-black">
        {useGradient ? (
          <div className="absolute inset-0" style={GRADIENT_STYLE} aria-hidden />
        ) : videoSrc ? (
          <>
            <video
              key={videoSrc}
              autoPlay
              muted
              loop
              playsInline
              className="absolute inset-0 h-full w-full object-cover"
            >
              <source src={videoSrc} type="video/mp4" />
            </video>
            <div className="absolute inset-0 bg-black/30" aria-hidden />
          </>
        ) : (
          <div className="absolute inset-0 bg-black" aria-hidden />
        )}
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
          <p className="text-base font-semibold text-white drop-shadow-md tracking-wide">셀프 인테리어 코치</p>
        </div>

        {/* 로딩 인디케이터 */}
        <div
          className="splash-bar mt-4 h-1 w-24 overflow-hidden rounded-full bg-white/30"
          style={{ animation: "splash-fade-in 0.6s 0.6s forwards" }}
        >
          <div
            className="h-full w-full rounded-full bg-white"
            style={{ animation: "splash-progress 4s ease-in-out forwards" }}
          />
        </div>
      </div>
    </div>
  );
}
