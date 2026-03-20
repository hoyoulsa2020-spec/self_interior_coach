"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "pwa_install_dismissed";

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function PWAInstallPrompt() {
  const [show, setShow] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [platform, setPlatform] = useState<"ios" | "android" | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Capacitor 앱(네이티브) 내에서는 PWA 설치 안내 숨김
    const Capacitor = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    if (Capacitor?.isNativePlatform?.()) return;

    // iOS: iPhone/iPad/iPod. iPadOS 13+ reports MacIntel + maxTouchPoints. standalone은 iOS Safari에만 존재
    const ios =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      /iPad|iPhone|iPod/.test(navigator.platform || "") ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ||
      (navigator.platform === "MacIntel" && "standalone" in navigator);

    const android = /Android/.test(navigator.userAgent);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: minimal-ui)").matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    const dismissed = sessionStorage.getItem(STORAGE_KEY);

    if (standalone || dismissed) return;

    const handler = (e: BeforeInstallPromptEvent) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setPlatform("android");
      setShow(true);
    };

    if (android) {
      window.addEventListener("beforeinstallprompt", handler);
      setPlatform("android");
      setShow(true);
      return () => window.removeEventListener("beforeinstallprompt", handler);
    }

    if (ios) {
      setPlatform("ios");
      setShow(true);
    }
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") setShow(false);
    }
  };

  const handleDismiss = () => {
    sessionStorage.setItem(STORAGE_KEY, "1");
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 rounded-xl border border-gray-200 bg-white p-4 shadow-lg sm:left-auto sm:right-4 sm:max-w-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-100">
          <svg className="h-5 w-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800">
            {deferredPrompt ? "앱 설치" : platform === "ios" ? "홈 화면에 추가" : "앱으로 사용하기"}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            {deferredPrompt
              ? "설치하면 홈 화면에서 앱처럼 실행됩니다."
              : platform === "ios"
                ? "하단 공유 버튼 → 홈 화면에 추가"
                : "메뉴(⋮) → 앱 설치 또는 홈 화면에 추가"}
          </p>
          {deferredPrompt && (
            <button
              type="button"
              onClick={handleInstall}
              className="mt-2 w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
            >
              설치하기
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="닫기"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
