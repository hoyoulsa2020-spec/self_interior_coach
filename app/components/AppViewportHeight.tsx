"use client";

import { useEffect } from "react";

/**
 * 모바일 채팅 UI 레이아웃 안정화: visualViewport 기반 실시간 높이 반영
 * - --app-height: 실제 보이는 뷰포트 높이 (키보드 올라오면 자동 감소)
 * - --keyboard-height: 키보드 높이 (Android 모달 등에서 사용)
 * - fallback: visualViewport 미지원 시 100dvh 사용
 */
function updateViewportHeight() {
  if (typeof window === "undefined") return;
  const root = document.documentElement;

  if (window.visualViewport) {
    const vv = window.visualViewport;
    const ih = window.innerHeight;
    const appHeight = vv.height;
    const keyboardHeight = Math.max(0, ih - vv.height - vv.offsetTop);

    root.style.setProperty("--app-height", `${appHeight}px`);
    root.style.setProperty("--keyboard-height", `${keyboardHeight}px`);
  } else {
    root.style.setProperty("--app-height", "100dvh");
    root.style.setProperty("--keyboard-height", "0px");
  }
}

export default function AppViewportHeight() {
  useEffect(() => {
    updateViewportHeight();
    window.addEventListener("resize", updateViewportHeight);

    if (window.visualViewport) {
      const vv = window.visualViewport;
      vv.addEventListener("resize", updateViewportHeight);
      vv.addEventListener("scroll", updateViewportHeight);
      return () => {
        vv.removeEventListener("resize", updateViewportHeight);
        vv.removeEventListener("scroll", updateViewportHeight);
        window.removeEventListener("resize", updateViewportHeight);
      };
    }

    return () => window.removeEventListener("resize", updateViewportHeight);
  }, []);
  return null;
}
