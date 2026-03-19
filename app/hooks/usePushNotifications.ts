"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ok = "serviceWorker" in navigator && "PushManager" in window && !!publicKey;
    setIsSupported(ok);
  }, [publicKey]);

  const checkSubscription = useCallback(async () => {
    if (!isSupported) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setIsSubscribed(!!sub);
    } catch {
      setIsSubscribed(false);
    }
  }, [isSupported]);

  useEffect(() => {
    if (!isSupported) return;
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
  }, [isSupported, checkSubscription]);

  const subscribe = useCallback(async () => {
    if (!isSupported || !publicKey || isLoading) return false;
    setError(null);
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError("로그인이 필요합니다.");
        return false;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });

      const payload = sub.toJSON();

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
        setError(data.error || "구독에 실패했습니다.");
        return false;
      }

      setIsSubscribed(true);
      return true;
    } catch (e) {
      console.error("[usePushNotifications] subscribe", e);
      setError("알림 구독에 실패했습니다.");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, publicKey, isLoading]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported || isLoading) return false;
    setError(null);
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return false;

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
      }
      setIsSubscribed(false);
      return true;
    } catch (e) {
      console.error("[usePushNotifications] unsubscribe", e);
      setError("구독 해제에 실패했습니다.");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, isLoading]);

  const toggle = useCallback(async () => {
    if (isSubscribed) return unsubscribe();
    return subscribe();
  }, [isSubscribed, subscribe, unsubscribe]);

  return {
    isSupported,
    isSubscribed,
    isLoading,
    error,
    subscribe,
    unsubscribe,
    toggle,
    checkSubscription,
  };
}
