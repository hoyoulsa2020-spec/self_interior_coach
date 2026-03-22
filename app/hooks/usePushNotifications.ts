"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export type PushSource = "pwa" | "app";

export type PushPrefs = {
  chat_push: boolean;
  progress_push: boolean;
  estimate_push: boolean;
};

export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentEndpoint, setCurrentEndpoint] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<PushPrefs | null>(null);
  const [fcmToken, setFcmToken] = useState<string | null>(null);

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const isApp = typeof window !== "undefined" && !!(window as any).Capacitor?.isNativePlatform?.();
  const listenersRef = useRef<{ remove: () => Promise<void> }[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const webPushOk = "serviceWorker" in navigator && "PushManager" in window && !!publicKey;
    const ok = webPushOk || isApp;
    setIsSupported(ok);
  }, [publicKey, isApp]);

  /** refreshSession()만 부르면 저장소에 refresh_token이 없을 때 "Invalid Refresh Token: Refresh Token Not Found" 발생 */
  const getFreshSession = useCallback(async () => {
    const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr) console.warn("[usePushNotifications] getSession", sessionErr.message);
    if (!session?.access_token) return null;

    if (!session.refresh_token) {
      return session;
    }

    const { data, error } = await supabase.auth.refreshSession();
    if (error) {
      const m = error.message?.toLowerCase() ?? "";
      if (m.includes("refresh") || m.includes("invalid")) {
        console.warn("[usePushNotifications] refreshSession:", error.message);
        return session;
      }
      return null;
    }
    return data.session ?? session;
  }, []);

  const checkSubscription = useCallback(async () => {
    if (!isSupported) return;
    if (isApp) {
      const token = fcmToken;
      if (!token) return;
      try {
        const session = await getFreshSession();
        if (!session?.access_token) return;
        const res = await fetch("/api/push/preferences", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) return;
        const { subscriptions } = await res.json();
        const endpoint = `fcm:${token}`;
        const mine = subscriptions?.find((s: { endpoint: string }) => s.endpoint === endpoint);
        setIsSubscribed(!!mine);
        setCurrentEndpoint(mine ? endpoint : null);
        if (mine) setPrefs({ chat_push: mine.chat_push ?? true, progress_push: mine.progress_push ?? true, estimate_push: mine.estimate_push ?? true });
        else setPrefs(null);
      } catch {
        setIsSubscribed(false);
        setPrefs(null);
      }
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setIsSubscribed(!!sub);
      setCurrentEndpoint(sub?.endpoint ?? null);
      if (sub) {
        const session = await getFreshSession();
        if (session?.access_token) {
          const res = await fetch("/api/push/preferences", {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          if (res.ok) {
            const { subscriptions } = await res.json();
            const mine = subscriptions?.find((s: { endpoint: string }) => s.endpoint === sub.endpoint);
            if (mine) setPrefs({ chat_push: mine.chat_push ?? true, progress_push: mine.progress_push ?? true, estimate_push: mine.estimate_push ?? true });
          }
        }
      } else {
        setPrefs(null);
      }
    } catch {
      setIsSubscribed(false);
      setPrefs(null);
    }
  }, [isSupported, isApp, fcmToken, getFreshSession]);

  useEffect(() => {
    if (!isSupported || !isApp) return;
    let cancelled = false;
    const run = async () => {
      try {
        const { PushNotifications } = await import("@capacitor/push-notifications");
        const regHandler = await PushNotifications.addListener("registration", (t) => {
          if (!cancelled) {
            setFcmToken(t.value);
            setError(null);
          }
        });
        const errHandler = await PushNotifications.addListener("registrationError", (e) => {
          if (!cancelled) {
            console.error("[usePushNotifications] FCM registration error", e);
            setError("푸시 등록에 실패했습니다. Firebase 설정을 확인해 주세요.");
          }
        });
        listenersRef.current = [regHandler, errHandler];

        let permStatus = await PushNotifications.checkPermissions();
        if (permStatus.receive === "prompt" || permStatus.receive === "prompt-with-rationale") {
          permStatus = await PushNotifications.requestPermissions();
        }
        if (permStatus.receive !== "granted") {
          setError("알림 권한이 필요합니다.");
          return;
        }
        await PushNotifications.register();
      } catch (e) {
        if (!cancelled) {
          console.error("[usePushNotifications] Capacitor init failed", e);
          setError("푸시 알림 초기화에 실패했습니다.");
        }
      }
    };
    run();
    return () => {
      cancelled = true;
      listenersRef.current.forEach((h) => h.remove());
      listenersRef.current = [];
    };
  }, [isSupported, isApp]);

  useEffect(() => {
    if (isApp && fcmToken) checkSubscription();
  }, [isApp, fcmToken, checkSubscription]);

  useEffect(() => {
    if (!isSupported || isApp) return;
    const run = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
        await checkSubscription();
      } catch (e) {
        console.error("[usePushNotifications] register failed", e);
        setError("서비스 워커 등록에 실패했습니다.");
      }
    };
    run();
  }, [isSupported, isApp, checkSubscription]);

  const subscribe = useCallback(async () => {
    if (!isSupported || isLoading) return false;
    if (isApp) {
      if (!fcmToken) {
        setError("푸시 토큰을 기다리는 중입니다. 잠시 후 다시 시도해 주세요.");
        return false;
      }
      setError(null);
      setIsLoading(true);
      try {
        const session = await getFreshSession();
        if (!session?.access_token) {
          setError("로그인이 필요합니다.");
          return false;
        }
        const res = await fetch("/api/push/subscribe", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ fcm_token: fcmToken, source: "app" }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const msg = [
            data.error || "구독에 실패했습니다.",
            data.detail,
            data.code ? `(코드: ${data.code})` : "",
          ]
            .filter(Boolean)
            .join(" - ");
          setError(msg);
          return false;
        }
        setIsSubscribed(true);
        setCurrentEndpoint(`fcm:${fcmToken}`);
        await checkSubscription();
        return true;
      } catch (e) {
        console.error("[usePushNotifications] subscribe (app)", e);
        setError("알림 구독에 실패했습니다.");
        return false;
      } finally {
        setIsLoading(false);
      }
    }
    if (!publicKey) return false;
    setError(null);
    setIsLoading(true);
    try {
      const session = await getFreshSession();
      if (!session?.access_token) {
        setError("로그인이 필요합니다.");
        return false;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });

      const payload = sub.toJSON() as Record<string, unknown>;
      payload.source = "pwa";

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail ? `${data.error}: ${data.detail}` : (data.error || "구독에 실패했습니다."));
        return false;
      }

      setIsSubscribed(true);
      setCurrentEndpoint(sub.endpoint);
      await checkSubscription();
      return true;
    } catch (e) {
      console.error("[usePushNotifications] subscribe", e);
      setError("알림 구독에 실패했습니다.");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, publicKey, isLoading, isApp, fcmToken, checkSubscription, getFreshSession]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported || isLoading) return false;
    if (isApp) {
      if (!fcmToken) return false;
      setError(null);
      setIsLoading(true);
      try {
        const session = await getFreshSession();
        if (!session?.access_token) {
          setError("로그인이 필요합니다.");
          return false;
        }
        const res = await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ endpoint: `fcm:${fcmToken}` }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || "구독 해제에 실패했습니다.");
          return false;
        }
        setIsSubscribed(false);
        setCurrentEndpoint(null);
        setPrefs(null);
        return true;
      } catch (e) {
        console.error("[usePushNotifications] unsubscribe (app)", e);
        setError("구독 해제에 실패했습니다.");
        return false;
      } finally {
        setIsLoading(false);
      }
    }
    setError(null);
    setIsLoading(true);
    try {
      const session = await getFreshSession();
      if (!session?.access_token) return false;

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        const res = await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || "구독 해제에 실패했습니다.");
          return false;
        }
      }
      setIsSubscribed(false);
      setCurrentEndpoint(null);
      setPrefs(null);
      return true;
    } catch (e) {
      console.error("[usePushNotifications] unsubscribe", e);
      setError("구독 해제에 실패했습니다.");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, isLoading, isApp, fcmToken, getFreshSession]);

  const toggle = useCallback(async () => {
    if (isSubscribed) return unsubscribe();
    return subscribe();
  }, [isSubscribed, subscribe, unsubscribe]);

  const updatePreferences = useCallback(async (updates: Partial<PushPrefs>) => {
    if (!currentEndpoint || !isSubscribed) return false;
    setError(null);
    try {
      const session = await getFreshSession();
      if (!session?.access_token) return false;

      const res = await fetch("/api/push/preferences", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ endpoint: currentEndpoint, ...updates }),
      });

      if (!res.ok) return false;
      setPrefs((p) => (p ? { ...p, ...updates } : null));
      return true;
    } catch {
      return false;
    }
  }, [currentEndpoint, isSubscribed, getFreshSession]);

  return {
    isSupported,
    isSubscribed,
    isLoading,
    error,
    prefs,
    isApp,
    subscribe,
    unsubscribe,
    toggle,
    updatePreferences,
    checkSubscription,
  };
}
