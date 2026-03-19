/**
 * 카카오 알림톡 - 가입 환영 메시지 (채널 친구추가 안내)
 *
 * 1. 카카오 비즈니스에서 알림톡 템플릿 등록·승인 필요
 *    예: "#{name}님, 셀인코치 가입을 환영합니다. 알림을 받으려면 채널을 친구추가해주세요. #{link}"
 * 2. NHN Cloud Kakao Talk Bizmessage 가입 후 연동
 *
 * .env 설정:
 * - NHN_KAKAO_APP_KEY
 * - NHN_KAKAO_SECRET_KEY
 * - KAKAO_SENDER_KEY (채널 발신키 40자, 비즈니스 채널 관리에서 확인)
 * - KAKAO_TEMPLATE_CODE_WELCOME (승인된 템플릿 코드)
 * - KAKAO_CHANNEL_FRIEND_URL (친구추가 링크, 예: https://pf.kakao.com/_xxxxx/friend)
 */

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("0") ? "82" + digits.slice(1) : digits || "";
}

export async function sendWelcomeAlimtalk(
  phone: string,
  name: string
): Promise<{ ok: boolean; error?: string }> {
  const appKey = process.env.NHN_KAKAO_APP_KEY;
  const secretKey = process.env.NHN_KAKAO_SECRET_KEY;
  const senderKey = process.env.KAKAO_SENDER_KEY;
  const templateCode = process.env.KAKAO_TEMPLATE_CODE_WELCOME;

  if (!appKey || !secretKey || !senderKey || !templateCode) {
    console.warn(
      "[알림톡] 설정 없음. NHN_KAKAO_APP_KEY, NHN_KAKAO_SECRET_KEY, KAKAO_SENDER_KEY, KAKAO_TEMPLATE_CODE_WELCOME 확인"
    );
    return { ok: false, error: "알림톡 설정 없음" };
  }

  const recipientNo = formatPhone(phone);
  if (!recipientNo || recipientNo.length < 10) {
    return { ok: false, error: "유효하지 않은 전화번호" };
  }

  const channelUrl = process.env.KAKAO_CHANNEL_FRIEND_URL || "https://pf.kakao.com/_x셀인코치/friend";
  const nameVal = name || "회원";

  // 템플릿 변수 - 등록한 템플릿의 #{변수명}에 맞게 설정 (없는 키는 무시됨)
  const templateParameter: Record<string, string> = {
    "#{name}": nameVal,
    "#{link}": channelUrl,
  };

  try {
    const res = await fetch(
      `https://kakaotalk-bizmessage.api.nhncloudservice.com/alimtalk/v2.0/appkeys/${appKey}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json;charset=UTF-8",
          "X-Secret-Key": secretKey,
        },
        body: JSON.stringify({
          senderKey,
          templateCode,
          recipientList: [
            {
              recipientNo,
              templateParameter,
            },
          ],
        }),
      }
    );

    const data = await res.json().catch(() => ({}));
    const ok = data?.header?.isSuccessful ?? res.ok;

    if (!ok) {
      const msg = data?.header?.resultMessage || data?.message || res.statusText;
      console.error("[알림톡] 발송 실패:", msg);
      return { ok: false, error: msg };
    }
    return { ok: true };
  } catch (e) {
    console.error("[알림톡] 발송 실패:", e);
    return { ok: false, error: String(e) };
  }
}
