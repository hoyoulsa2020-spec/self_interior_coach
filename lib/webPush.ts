import webpush from "web-push";
import { createAdminClient } from "./supabaseAdmin";
import { sendFcmToToken } from "./fcm";

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

export type PushSource = "admin-send" | "chat-reply" | "chat-notify" | "consumer-provider-chat-notify" | (string & {});

async function logPush(
  supabase: ReturnType<typeof createAdminClient>,
  recipientUserId: string,
  payload: PushPayload,
  source: PushSource,
  status: "success" | "failed"
) {
  await supabase.from("push_logs").insert({
    recipient_user_id: recipientUserId,
    title: payload.title,
    body: payload.body ?? null,
    url: payload.url ?? null,
    tag: payload.tag ?? null,
    source,
    status,
  });
}

/** 푸시 유형: chat=채팅, progress=진행상태(소비자), estimate=견적(시공업체) */
export type PushType = "chat" | "progress" | "estimate" | "all";

/** 특정 사용자에게 푸시 발송 (pushType 지정 시 해당 설정 켜진 구독자에게만) */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
  source: PushSource = "admin-send",
  pushType: PushType = "all"
): Promise<{ ok: number; fail: number }> {
  initWebPush();
  const supabase = createAdminClient();
  let query = supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (pushType === "chat") query = query.eq("chat_push", true);
  else if (pushType === "progress") query = query.eq("progress_push", true);
  else if (pushType === "estimate") query = query.eq("estimate_push", true);

  const { data: subs } = await query;

  if (!subs?.length) return { ok: 0, fail: 0 };

  const webPushBody = JSON.stringify({
    title: payload.title,
    body: payload.body ?? "",
    icon: `${SITE_URL}/icon-192.png`,
    url: payload.url ?? "/",
    tag: payload.tag ?? "selco-notification",
  });

  let ok = 0;
  let fail = 0;

  for (const sub of subs) {
    const isFcm = sub.endpoint?.startsWith("fcm:");
    const fcmToken = isFcm ? sub.endpoint.slice(4) : null;

    try {
      if (isFcm && fcmToken) {
        const sent = await sendFcmToToken(fcmToken, {
          title: payload.title,
          body: payload.body ?? "",
          url: payload.url ?? "/",
          tag: payload.tag ?? "selco-notification",
        });
        if (sent) {
          ok++;
          await logPush(supabase, userId, payload, source, "success");
        } else {
          fail++;
          await logPush(supabase, userId, payload, source, "failed");
        }
      } else if (sub.p256dh && sub.auth) {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          webPushBody
        );
        ok++;
        await logPush(supabase, userId, payload, source, "success");
      }
    } catch (e) {
      fail++;
      await logPush(supabase, userId, payload, source, "failed");
      const status = (e as { statusCode?: number })?.statusCode;
      const code = (e as { code?: string })?.code;
      const invalidToken = status === 410 || status === 404 || code?.includes("registration-token") || code?.includes("invalid-registration");
      if (invalidToken) {
        await supabase.from("push_subscriptions").update({ is_active: false }).eq("endpoint", sub.endpoint);
      }
    }
  }

  return { ok, fail };
}

/** 관리자 계정들에게만 푸시 발송 (실시간 채팅 등) */
export async function sendPushToAdmins(
  payload: PushPayload,
  source: PushSource = "chat-notify"
): Promise<{ ok: number; fail: number }> {
  initWebPush();
  const supabase = createAdminClient();
  const { data: adminIds } = await supabase
    .from("profiles")
    .select("user_id")
    .in("role", ["admin", "super_admin"]);
  const ids = (adminIds ?? []).map((r) => r.user_id);
  if (ids.length === 0) return { ok: 0, fail: 0 };

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("user_id, endpoint, p256dh, auth")
    .in("user_id", ids)
    .eq("is_active", true);

  if (!subs?.length) return { ok: 0, fail: 0 };

  const webPushBody = JSON.stringify({
    title: payload.title,
    body: payload.body ?? "",
    icon: `${SITE_URL}/icon-192.png`,
    url: payload.url ?? "/",
    tag: payload.tag ?? "selco-chat",
  });

  let ok = 0;
  let fail = 0;

  for (const sub of subs) {
    const uid = (sub as { user_id?: string }).user_id;
    const isFcm = sub.endpoint?.startsWith("fcm:");
    const fcmToken = isFcm ? sub.endpoint.slice(4) : null;

    try {
      if (isFcm && fcmToken) {
        const sent = await sendFcmToToken(fcmToken, {
          title: payload.title,
          body: payload.body ?? "",
          url: payload.url ?? "/",
          tag: payload.tag ?? "selco-chat",
        });
        if (sent) {
          ok++;
          if (uid) await logPush(supabase, uid, payload, source, "success");
        } else {
          fail++;
          if (uid) await logPush(supabase, uid, payload, source, "failed");
        }
      } else if (sub.p256dh && sub.auth) {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          webPushBody
        );
        ok++;
        if (uid) await logPush(supabase, uid, payload, source, "success");
      }
    } catch (e) {
      fail++;
      if (uid) await logPush(supabase, uid, payload, source, "failed");
      const status = (e as { statusCode?: number })?.statusCode;
      const code = (e as { code?: string })?.code;
      const invalidToken = status === 410 || status === 404 || code?.includes("registration-token") || code?.includes("invalid-registration");
      if (invalidToken) {
        await supabase.from("push_subscriptions").update({ is_active: false }).eq("endpoint", sub.endpoint);
      }
    }
  }

  return { ok, fail };
}

/** 전체 구독자에게 푸시 발송 (공지 등) */
export async function sendPushToAll(
  payload: PushPayload,
  source: PushSource = "admin-send"
): Promise<{ ok: number; fail: number }> {
  initWebPush();
  const supabase = createAdminClient();
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("user_id, endpoint, p256dh, auth")
    .eq("is_active", true);

  if (!subs?.length) return { ok: 0, fail: 0 };

  const webPushBody = JSON.stringify({
    title: payload.title,
    body: payload.body ?? "",
    icon: `${SITE_URL}/icon-192.png`,
    url: payload.url ?? "/",
    tag: payload.tag ?? "selco-notification",
  });

  let ok = 0;
  let fail = 0;

  for (const sub of subs) {
    const uid = (sub as { user_id?: string }).user_id;
    const isFcm = sub.endpoint?.startsWith("fcm:");
    const fcmToken = isFcm ? sub.endpoint.slice(4) : null;

    try {
      if (isFcm && fcmToken) {
        const sent = await sendFcmToToken(fcmToken, {
          title: payload.title,
          body: payload.body ?? "",
          url: payload.url ?? "/",
          tag: payload.tag ?? "selco-notification",
        });
        if (sent) {
          ok++;
          if (uid) await logPush(supabase, uid, payload, source, "success");
        } else {
          fail++;
          if (uid) await logPush(supabase, uid, payload, source, "failed");
        }
      } else if (sub.p256dh && sub.auth) {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          webPushBody
        );
        ok++;
        if (uid) await logPush(supabase, uid, payload, source, "success");
      }
    } catch (e) {
      fail++;
      if (uid) await logPush(supabase, uid, payload, source, "failed");
      const status = (e as { statusCode?: number })?.statusCode;
      const code = (e as { code?: string })?.code;
      const invalidToken = status === 410 || status === 404 || code?.includes("registration-token") || code?.includes("invalid-registration");
      if (invalidToken) {
        await supabase.from("push_subscriptions").update({ is_active: false }).eq("endpoint", sub.endpoint);
      }
    }
  }

  return { ok, fail };
}
