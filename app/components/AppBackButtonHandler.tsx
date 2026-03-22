"use client";

import { useEffect, useRef } from "react";

/** 루트 화면(정확히 일치): 여기서 뒤로가기 누르면 앱 종료 */
const ROOT_PATHS = new Set([
  "/",
  "/login",
  "/signup",
  "/dashboard",
  "/provider",
  "/provider/dashboard",
  "/admin",
]);

function isRootPath(pathname: string): boolean {
  return ROOT_PATHS.has(pathname);
}

/**
 * Android 앱: 뒤로가기 버튼 처리
 * - 루트 화면: 한 번 더 누르면 종료
 * - 그 외: 이전 페이지로
 */
export default function AppBackButtonHandler() {
  const lastBackRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const cap = (window as any).Capacitor;
    if (!cap?.isNativePlatform?.() || cap.getPlatform?.() !== "android") return;

    const handleBack = async () => {
      try {
        const { App } = await import("@capacitor/app");
        const pathname = window.location.pathname || "/";

        // 루트 화면이 아니면 history.back()
        if (!isRootPath(pathname)) {
          window.history.back();
          return;
        }

        // 루트 화면: 2초 내 두 번 누르면 종료
        const now = Date.now();
        if (now - lastBackRef.current < 2000) {
          await App.exitApp();
        } else {
          lastBackRef.current = now;
          const toast = document.createElement("div");
          toast.textContent = "한 번 더 누르면 종료됩니다";
          toast.style.cssText =
            "position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.7);color:white;padding:8px 16px;border-radius:8px;font-size:14px;z-index:99999;";
          document.body.appendChild(toast);
          setTimeout(() => toast.remove(), 1500);
        }
      } catch {
        // 무시
      }
    };

    let listener: { remove: () => Promise<void> } | null = null;
    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        listener = await App.addListener("backButton", handleBack);
      } catch {
        // 무시
      }
    })();

    return () => {
      listener?.remove().catch(() => {});
    };
  }, []);

  return null;
}
