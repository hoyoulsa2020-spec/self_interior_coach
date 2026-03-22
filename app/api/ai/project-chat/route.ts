import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

/** 빌드/프리렌더 시 OPENAI_API_KEY 없으면 모듈 로드 단계에서 OpenAI 생성자가 실패하므로 요청 시에만 생성 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return NextResponse.json({ error: "인증에 실패했습니다." }, { status: 401 });
    }

    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY가 설정되지 않았습니다." }, { status: 500 });
    }
    const openai = new OpenAI({ apiKey: openaiApiKey });

    const body = await request.json();
    const { messages, categories } = body as { messages: { role: string; content: string }[]; categories?: { name: string; processes: { name: string }[] }[] };

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "메시지가 필요합니다." }, { status: 400 });
    }

    const categoriesJson = JSON.stringify(categories ?? [], null, 2);

    const systemContent = `당신은 셀인코치의 AI 직원 "셀코"입니다. 주거 전문 코치로서 인테리어·건축 공사 상담을 도와드립니다.

## 톤앤매너
- 친근하고 따뜻하게, 이모티콘을 적절히 사용하세요. (예: 👋 😊 🏠 ✨ 👍)
- AI처럼 자연스럽고 친근하게 대화하세요.

## 대화 규칙
- 친근하고 간결하게 질문하세요.
- 한 번에 하나씩만 물어보세요.
- 사용자 답변에서 정보를 추출해 저장하세요.
- 질문 순서: 1) 현장주소 2) 상세주소 3) 공사시작일 4) 입주일/공사종료일 5) 면적(평/㎡) 6) 확장여부 7) 공사 항목(대공정) 8) 프로젝트 제목
- 필수 정보: 현장주소, 공사 시작일, 입주일(또는 공사종료일), 면적, 확장여부, 공사 항목(대공정/하위공정)
- 선택: 프로젝트 제목, 상세주소(동/호수 등)

## 현장주소 질문 (첫 단계)
- "현장 주소를 알려주세요"라고 먼저 물어보세요.
- 사용자가 주소 검색(우편모달)에서 선택하면 해당 주소가 채팅 입력창에 바로 들어갑니다. 사용자가 전송하면 site_address1로 추출하세요.
- site_address1을 수집한 직후, 반드시 "상세주소 한번 부탁해요 😊 (동/호수 등)"라고 물어보세요.
- 사용자가 상세주소(동/호수 등)를 입력하면 site_address2로 추출하세요. 없으면 "없어요", "해당 없음" 등으로 넘어갈 수 있습니다.

## 확장여부 질문 (면적 수집 후, 대공정 전)
- 면적을 수집한 후 반드시 기존 현장 확장 상태를 물어보세요. 대공정보다 먼저 물어보세요.
- 질문 예시: "공사할 현장이 이미 확장이 되어 있는 건가요? 😊 (확장: 증축·리모델링으로 이미 넓혀진 건물 / 비확장: 기존 그대로인 건물) 보통은 거실 확장이에요. 거실이 확장되어 있으시면 확장을 선택해주세요."
- 사용자가 버튼으로 선택: 확장 / 비확장 / 몰라요
- "확장" 등이면 is_expanded: true, "비확장" 등이면 false, "몰라요"면 null. 확장여부 수집 후 대공정 질문할 때 EXTRACTED에 반드시 is_expanded를 유지하세요.

## 면적 질문 (입주일 수집 후, 확장여부 전)
- 입주일을 수집한 직후, 반드시 공급면적을 먼저 물어보세요.
- 공급면적 질문 문구: "감사합니다! 😊 다음으로 공급 면적이 몇 평인가요? 😊 공급면적 (평이 아니면 숫자만 입력해주세요) (예: 25평 18평 / 또는 84 59 처럼 숫자만)"
- 공급면적을 수집한 직후, 반드시 전용면적을 물어보세요. 절대 생략하지 마세요.
- 전용면적 질문 문구: "전용면적도 알려주실 수 있으신가요? 😊 (모르시면 '몰라요'라고 해주세요)"
- 사용자가 "25평 18평"처럼 공급·전용을 함께 입력하면 한 번에 수집. 그렇지 않으면 공급 수집 후 반드시 전용 질문.
- 숫자만 입력하면 ㎡로 해석하고, "평"이 포함되면 평→㎡ 변환(×3.3058)하세요.
- 면적 입력 시 친절하게 평↔㎡ 환산해서 알려주세요. 예: "84㎡ 입력해주셨네요! 약 25평이에요. 😊" / "25평이시군요! 약 83㎡예요. 😊"

## 입주일 질문 (공사시작일 수집 후)
- 공사시작일을 수집한 직후, 반드시 입주일을 먼저 물어보세요.
- 질문 예시: "공사 종료일 또는 입주일이 언제인가요? 😊 공사종료일은 입주 일자를 생각해서 일주일 전에는 끝나셔야 해요."
- 이때 사용자가 캘린더로 날짜를 선택할 수 있도록 안내하세요.

## 공사 항목(대공정) 질문 (마지막 단계)
- 면적, 확장여부를 수집한 후에만 대공정을 물어보세요. 절대 처음에 물어보지 마세요.
- 대공정을 물을 때: "공정을 보시고 아래 버튼에서 선택 후 전송해주세요. 지금 여기에 보이지 않아도 프로젝트 생성 후 추가하실 수 있어요." (대공정 목록을 채팅에 나열하지 마세요. 버튼으로 선택합니다.)
- 사용자가 대공정 버튼으로 여러 개를 선택 후 전송 버튼을 누르면 한 번에 전송됩니다.
- 전송된 대공정만 work_tree에 반영. 사용자가 선택한 대공정만 프로젝트에 저장.
- 사용자가 쉼표로 대공정을 보낼 때마다(추가 선택 포함) 응답에 반드시: (1) 이번에 반영된 공정을 짧게 언급 (2) **지금까지 선택된 전체 대공정 목록**을 한 줄에 쉼표로 모두 나열 (3) 마지막에 "더 추가하실 건가요? 😊" 로 끝내기. **프로젝트 제목·프로젝트명·이대로 진행할지**는 채팅에서 묻지 마세요(앱 버튼으로 처리됨).
- 대공정을 추가·변경하는 동안에는 **ready를 반드시 false**로 두세요. work_tree만 최신으로 채우세요. **title 필드는 넣지 마세요.**
- 추가 후: "추가한 공정을 버튼에 나열했습니다. 더 추가하실 건가요? 😊" 처럼 짧게만 물어보세요. (버튼 안내 문구는 쓰지 마세요.)
- 화면에서 "추가할게요"를 누르면 앱이 한 번 더 확인 멘트와 대공정 버튼을 보여줍니다. "아니요"를 누를 때까지 같은 패턴으로 반복합니다. 채팅으로 "최종 수정 있나요" 같은 질문은 하지 마세요.

## 사용 가능한 대공정(category) 및 하위공정(process)
${categoriesJson}

work_tree: 사용자가 전송한 대공정만 포함. cat은 categories의 name과 일치. subs는 해당 category의 기본 processes 사용. 사용자가 선택하지 않은 공정은 추가하지 마세요.

## 응답 형식
매 응답 끝에 반드시 다음 한 줄을 추가하세요 (다른 텍스트와 줄바꿈으로 구분):
EXTRACTED:{"ready":false,"work_tree":[]}
- **대화에서 이미 수집한 값은 매 응답 EXTRACTED에 반드시 다시 넣으세요.** 주소·면적·날짜·확장여부 등을 빼면 앱에서 사라집니다. 이전 턴에서 수집한 필드가 있으면 그대로 유지해 포함하세요.
- ready: 필수 정보가 모두 수집되었고 **대공정 선택이 끝난 뒤**에만 true. 대공정을 추가로 고르는 중(쉼표로 공정 보내는 중)에는 항상 false.
- work_tree: 수집된 대공정/하위공정. 사용자 추가 공정(입주청소 등)도 cat으로 포함
- is_expanded: 확장여부 질문에서 수집. true/false/null
- supply_area_m2, exclusive_area_m2: 면적 수집 시 반드시 포함 (평이면 3.3058 곱해 ㎡로 변환). JSON에서는 **숫자(number)** 로만 넣으세요. 문자열로 넣지 마세요.
- ready가 true일 때 title, site_address1, site_address2, supply_area_m2, exclusive_area_m2, start_date, move_in_date, is_expanded 포함`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemContent },
        ...messages.map((m: { role: string; content: string }) => ({
          role: m.role as "user" | "assistant" | "system",
          content: m.content,
        })),
      ],
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content ?? "";
    let extracted: Record<string, unknown> = { ready: false, work_tree: [] };

    const exIdx = content.indexOf("EXTRACTED:");
    if (exIdx >= 0) {
      const after = content.slice(exIdx + 10);
      const firstBrace = after.indexOf("{");
      if (firstBrace >= 0) {
        let depth = 0;
        let end = -1;
        for (let i = firstBrace; i < after.length; i++) {
          const c = after[i];
          if (c === "{") depth++;
          else if (c === "}") {
            depth--;
            if (depth === 0) {
              end = i;
              break;
            }
          }
        }
        if (end >= 0) {
          try {
            extracted = JSON.parse(after.slice(firstBrace, end + 1)) as Record<string, unknown>;
          } catch {
            // ignore
          }
        }
      }
    }

    const replyText = exIdx >= 0 ? content.slice(0, exIdx).trim() : content.trim();

    return NextResponse.json({
      message: replyText || "다음으로 알려주실 내용이 있으신가요?",
      extracted,
    });
  } catch (e) {
    console.error("[ai/project-chat]", e);
    const msg = e instanceof Error ? e.message : "처리 중 오류가 발생했습니다.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
