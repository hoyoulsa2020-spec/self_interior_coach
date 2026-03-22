"use client";

import { usePushNotifications } from "@/app/hooks/usePushNotifications";

type Role = "consumer" | "provider";

type Props = {
  role: Role;
};

export default function PushNotificationSettings({ role }: Props) {
  const {
    isSupported,
    isSubscribed,
    isLoading,
    error,
    prefs,
    isApp,
    toggle,
    updatePreferences,
  } = usePushNotifications();

  if (!isSupported) {
    return (
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-sm font-medium text-gray-700">푸시 알림</p>
        <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
          {isApp
            ? "앱 푸시 알림 설정을 불러오는 중입니다."
            : "이 브라우저에서는 푸시 알림을 지원하지 않습니다. Safari에서 홈 화면에 추가하면 PWA 모드에서 푸시 알림을 사용할 수 있습니다."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* 메인 토글: 푸시 켜기/끄기 */}
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-700">
            푸시 알림 {isApp ? "(앱)" : "(웹)"}
          </p>
          <p className="text-xs text-gray-500">
            {isApp ? "모바일 앱에서 수신" : "이 브라우저에서 수신"}
          </p>
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-3">
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
            {isSubscribed ? "켜짐" : "끔"}
          </span>
        </label>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* 구독 중일 때만 유형별 토글 표시: 개인고객=채팅+진행상태, 시공업체=채팅+견적정보 */}
      {isSubscribed && prefs && (
        <div className="space-y-3 border-t border-gray-100 pt-4">
          <p className="text-xs font-medium text-gray-500">
            {role === "consumer" ? "개인고객 알림 설정" : "시공업체 알림 설정"}
          </p>

          {/* 채팅 알림 - 공통 */}
          <label className="flex min-w-0 cursor-pointer items-center justify-between gap-3">
            <span className="min-w-0 shrink text-sm text-gray-700">채팅 알림 켜기/끄기</span>
            <div className="relative shrink-0">
              <input
                type="checkbox"
                checked={prefs.chat_push}
                onChange={(e) => updatePreferences({ chat_push: e.target.checked })}
                disabled={isLoading}
                className="peer sr-only"
              />
              <div className="h-5 w-9 rounded-full bg-gray-200 transition peer-checked:bg-indigo-600 peer-disabled:opacity-50" />
              <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
            </div>
          </label>

          {role === "consumer" && (
            <label className="flex min-w-0 cursor-pointer items-center justify-between gap-3">
              <span className="min-w-0 shrink text-sm text-gray-700">진행상태 알림 켜기/끄기</span>
              <div className="relative shrink-0">
                <input
                  type="checkbox"
                  checked={prefs.progress_push}
                  onChange={(e) => updatePreferences({ progress_push: e.target.checked })}
                  disabled={isLoading}
                  className="peer sr-only"
                />
                <div className="h-5 w-9 rounded-full bg-gray-200 transition peer-checked:bg-indigo-600 peer-disabled:opacity-50" />
                <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
              </div>
            </label>
          )}

          {role === "provider" && (
            <label className="flex min-w-0 cursor-pointer items-center justify-between gap-3">
              <span className="min-w-0 shrink text-sm text-gray-700">견적정보 알림 켜기/끄기</span>
              <div className="relative shrink-0">
                <input
                  type="checkbox"
                  checked={prefs.estimate_push}
                  onChange={(e) => updatePreferences({ estimate_push: e.target.checked })}
                  disabled={isLoading}
                  className="peer sr-only"
                />
                <div className="h-5 w-9 rounded-full bg-gray-200 transition peer-checked:bg-indigo-600 peer-disabled:opacity-50" />
                <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
              </div>
            </label>
          )}
        </div>
      )}
    </div>
  );
}
