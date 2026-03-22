"use client";

import { useEffect } from "react";

/**
 * Capacitor 앱에서만 --safe-top, --safe-bottom 적용.
 * 웹(모바일 사파리 포함)에는 적용 안 함.
 * iOS: 하단 버튼 없음 → bottom 0. Android: 네비버튼 있음 → bottom 여유.
 */
function applySafeArea() {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (!cap?.isNativePlatform?.()) return;

  const platform = (cap as { getPlatform?: () => string }).getPlatform?.() ?? "";
  const root = document.documentElement;
  root.style.setProperty("--safe-top", "40px");
  root.style.setProperty("--safe-bottom", platform === "android" ? "48px" : platform === "ios" ? "env(safe-area-inset-bottom, 0px)" : "0px");
  document.body.setAttribute("data-app-mode", "true");
  if (platform === "android") {
    document.body.setAttribute("data-app-android", "true");
  } else {
    document.body.removeAttribute("data-app-android");
    root.style.removeProperty("--chat-modal-inset");
  }
}

export default function CapacitorSafeArea() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    applySafeArea();
    // Capacitor가 늦게 로드될 수 있음
    const t = setTimeout(applySafeArea, 100);
    const t2 = setTimeout(applySafeArea, 500);
    return () => {
      clearTimeout(t);
      clearTimeout(t2);
    };
  }, []);
  return null;
}
