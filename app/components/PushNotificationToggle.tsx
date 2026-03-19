"use client";

import { usePushNotifications } from "@/app/hooks/usePushNotifications";

export default function PushNotificationToggle() {
  const { isSupported, isSubscribed, isLoading, error, toggle } = usePushNotifications();

  if (!isSupported) return null;

  return (
    <div className="flex flex-col gap-1">
      <label className="flex cursor-pointer items-center gap-3">
        <div className="relative">
          <input
            type="checkbox"
            checked={isSubscribed}
            onChange={() => toggle()}
            disabled={isLoading}
            className="peer sr-only"
          />
          <div className="h-6 w-11 rounded-full bg-gray-200 transition peer-checked:bg-indigo-600 peer-disabled:opacity-50" />
          <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
        </div>
        <span className="text-sm font-medium text-gray-700">
          {isSubscribed ? "푸시 알림 켜짐" : "푸시 알림 끔"}
        </span>
      </label>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
