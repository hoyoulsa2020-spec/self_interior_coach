import webpush from "web-push";
import { createAdminClient } from "./supabaseAdmin";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://sel-ko.co.kr";

export function initWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error("VAPID keys not configured. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.");
  }
  webpush.setVapidDetails(`mailto:support@sel-ko.co.kr`, publicKey, privateKey);
}

export interface PushPayload {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
}

/** 특정 사용자에게 푸시 발송 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<{ ok: number; fail: number }> {
  initWebPush();
  const supabase = createAdminClient();
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (!subs?.length) return { ok: 0, fail: 0 };

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body ?? "",
    icon: `${SITE_URL}/icon-192.png`,
    url: payload.url ?? "/",
    tag: payload.tag ?? "selco-notification",
  });

  let ok = 0;
  let fail = 0;

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        body
      );
      ok++;
    } catch (e) {
      fail++;
      const status = (e as { statusCode?: number })?.statusCode;
      if (status === 410 || status === 404) {
        await supabase.from("push_subscriptions").update({ is_active: false }).eq("endpoint", sub.endpoint);
      }
    }
  }

  return { ok, fail };
}

/** 전체 구독자에게 푸시 발송 (공지 등) */
export async function sendPushToAll(payload: PushPayload): Promise<{ ok: number; fail: number }> {
  initWebPush();
  const supabase = createAdminClient();
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("is_active", true);

  if (!subs?.length) return { ok: 0, fail: 0 };

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body ?? "",
    icon: `${SITE_URL}/icon-192.png`,
    url: payload.url ?? "/",
    tag: payload.tag ?? "selco-notification",
  });

  let ok = 0;
  let fail = 0;

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        body
      );
      ok++;
    } catch (e) {
      fail++;
      const status = (e as { statusCode?: number })?.statusCode;
      if (status === 410 || status === 404) {
        await supabase.from("push_subscriptions").update({ is_active: false }).eq("endpoint", sub.endpoint);
      }
    }
  }

  return { ok, fail };
}
