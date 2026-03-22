/**
 * FCM (Firebase Cloud Messaging) - 앱 네이티브 푸시 발송
 * 환경변수: FIREBASE_SERVICE_ACCOUNT_JSON (JSON 문자열) 또는
 *          GOOGLE_APPLICATION_CREDENTIALS (서비스 계정 파일 경로)
 */
import * as admin from "firebase-admin";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://sel-ko.co.kr";

let initialized = false;

function initFcm() {
  if (initialized) return;
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!json && !path) {
    throw new Error("FCM 미설정: FIREBASE_SERVICE_ACCOUNT_JSON 또는 GOOGLE_APPLICATION_CREDENTIALS 필요");
  }
  if (admin.apps.length === 0) {
    if (json) {
      try {
        const cred = JSON.parse(json);
        admin.initializeApp({ credential: admin.credential.cert(cred) });
      } catch (e) {
        throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON 파싱 실패");
      }
    } else {
      admin.initializeApp({ credential: admin.credential.applicationDefault() });
    }
  }
  initialized = true;
}

export interface FcmPayload {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
}

/** FCM 토큰으로 푸시 발송 */
export async function sendFcmToToken(
  token: string,
  payload: FcmPayload
): Promise<boolean> {
  try {
    initFcm();
  } catch {
    return false;
  }
  try {
    await admin.messaging().send({
      token,
      notification: {
        title: payload.title,
        body: payload.body ?? "",
        imageUrl: `${SITE_URL}/icon-192.png`,
      },
      data: {
        url: payload.url ?? "/",
        tag: payload.tag ?? "selco-notification",
      },
      android: {
        notification: {
          sound: "default",
          channelId: "selco-default",
        },
      },
    });
    return true;
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "messaging/registration-token-not-registered" || err.code === "messaging/invalid-registration-token") {
      // 토큰 만료/무효 - DB에서 비활성화 필요
      throw e;
    }
    console.error("[fcm] send error", e);
    return false;
  }
}
