"use client";

import { useEffect, useRef } from "react";
import { Preferences } from "@capacitor/preferences";
import { supabase } from "@/lib/supabaseClient";

const KEY_FIRST_LAUNCH_DONE = "app_install_first_launch_done";
const KEY_INSTALL_ID = "app_install_id";

function generateInstallId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function AppInstallTracker() {
  const doneRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor;
    if (!cap?.isNativePlatform?.()) return;
    if (doneRef.current) return;

    const run = async () => {
      try {
        const { value: done } = await Preferences.get({ key: KEY_FIRST_LAUNCH_DONE });
        if (done === "1") return;

        let installId = (await Preferences.get({ key: KEY_INSTALL_ID })).value;
        if (!installId) {
          installId = generateInstallId();
          await Preferences.set({ key: KEY_INSTALL_ID, value: installId });
        }

        const platform = cap.getPlatform?.() ?? "android";
        let appVersion: string | null = null;
        let appBuild: string | null = null;
        let deviceModel: string | null = null;
        let deviceManufacturer: string | null = null;
        let osVersion: string | null = null;

        try {
          const [App, Device] = await Promise.all([
            import("@capacitor/app").then((m) => m.App),
            import("@capacitor/device").then((m) => m.Device),
          ]);
          const info = await App.getInfo();
          appVersion = info.version ?? null;
          appBuild = info.build ?? null;
          const dev = await Device.getInfo();
          deviceModel = dev.model ?? null;
          deviceManufacturer = dev.manufacturer ?? null;
          osVersion = dev.osVersion ?? null;
        } catch {
          // 플러그인 로드 실패 시 기본값 유지
        }

        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id ?? null;

        const res = await fetch("/api/app-install/record", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            install_id: installId,
            platform,
            app_version: appVersion,
            app_build: appBuild,
            device_model: deviceModel,
            device_manufacturer: deviceManufacturer,
            os_version: osVersion,
            user_id: userId,
          }),
        });

        if (res.ok) {
          await Preferences.set({ key: KEY_FIRST_LAUNCH_DONE, value: "1" });
        }
      } catch (err) {
        console.warn("[AppInstallTracker]", err);
      } finally {
        doneRef.current = true;
      }
    };

    run();
  }, []);

  return null;
}
