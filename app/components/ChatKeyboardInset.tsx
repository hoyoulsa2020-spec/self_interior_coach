"use client";

import { useEffect } from "react";

/**
 * 키보드 올라올 때 입력창이 가려지지 않도록 --keyboard-inset-bottom 설정
 * visualViewport로 키보드 높이 감지 → 입력창에 padding 추가
 */
function updateKeyboardInset() {
  if (typeof window === "undefined" || !window.visualViewport) return;
  const vv = window.visualViewport;
  const ih = window.innerHeight;
  const keyboardHeight = Math.max(0, ih - vv.height - vv.offsetTop);
  /* 입력창이 키보드 위 10px에 오도록. 200px 간격 줄임 (너무 멀었음) */
  const bottom = keyboardHeight > 0 ? Math.max(0, keyboardHeight - 190) : 0;
  document.documentElement.style.setProperty("--keyboard-inset-bottom", `${bottom}px`);
  /* Android 모달 전체 키보드 높이 (모달 하단을 키보드 위로 맞추기) */
  document.documentElement.style.setProperty("--keyboard-height", `${keyboardHeight}px`);
}

export default function ChatKeyboardInset() {
  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    document.documentElement.style.setProperty("--keyboard-inset-bottom", "0px");
    document.documentElement.style.setProperty("--keyboard-height", "0px");
    updateKeyboardInset();
    const vv = window.visualViewport;
    vv.addEventListener("resize", updateKeyboardInset);
    vv.addEventListener("scroll", updateKeyboardInset);
    return () => {
      vv.removeEventListener("resize", updateKeyboardInset);
      vv.removeEventListener("scroll", updateKeyboardInset);
      document.documentElement.style.removeProperty("--keyboard-inset-bottom");
    document.documentElement.style.removeProperty("--keyboard-height");
    };
  }, []);
  return null;
}
