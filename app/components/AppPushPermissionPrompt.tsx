"use client";

import { useEffect, useRef } from "react";

/**
 * Capacitor 앱: 알림 권한 요청 + 앱 열 때 배지 초기화
 */
export default function AppPushPermissionPrompt() {
  const listenerRef = useRef<{ remove: () => Promise<void> } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const cap = (window as any).Capacitor;
    if (!cap?.isNativePlatform?.()) return;

    const run = async () => {
      try {
        const { PushNotifications } = await import("@capacitor/push-notifications");
        const status = await PushNotifications.checkPermissions();
        if (status.receive === "prompt" || status.receive === "prompt-with-rationale") {
          await PushNotifications.requestPermissions();
        }
      } catch {
        // 무시 (프로필에서 다시 시도)
      }
    };
    run();
  }, []);

  // 앱 포그라운드 시 배지 초기화
  useEffect(() => {
    if (typeof window === "undefined") return;
    const cap = (window as any).Capacitor;
    if (!cap?.isNativePlatform?.()) return;

    const clearBadge = async () => {
      try {
        const { Badge } = await import("@capawesome/capacitor-badge");
        if (await Badge.isSupported()) {
          await Badge.clear();
        }
      } catch {
        // 무시
      }
    };

    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        listenerRef.current = await App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) clearBadge();
        });
        await clearBadge(); // 앱 시작 시에도 한 번 초기화
      } catch {
        // 무시
      }
    })();

    return () => {
      listenerRef.current?.remove().catch(() => {});
    };
  }, []);

  return null;
}
