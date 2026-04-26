/**
 * Anthropic Claude Haiku 4.5 클라이언트 — Phase 3 Day 1.
 *
 * 환경변수: ANTHROPIC_API_KEY
 * 모델: claude-haiku-4-5
 *
 * 비용 (2026-04 기준):
 *   - input: $1 / 1M tokens
 *   - output: $5 / 1M tokens
 *   - 우리 호출 평균: input ~150 + output ~120 ≈ $0.00075 / call
 *   - 강남구 22 행정동 × 99 업종 ≈ 2,178 calls ≈ $1.6
 *   - 전국 255 시군구 × ~14 행정동 × 99 업종 ≈ 353,430 calls ≈ $265 (절대 일괄 X)
 *
 * 캐싱:
 *   - build-time CLI (web/scripts/build-llm.mjs) 가 호출
 *   - 결과를 data/build/{시도}/{시군구}-llm.json 으로 저장
 *   - web 은 read 만 (server fetch)
 */

import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY 환경변수 필요");
  }
  client = new Anthropic({ apiKey });
  return client;
}

export interface LLMOutput {
  summary: string; // 2~3문장 한 줄 요약
  alias: string; // 지역+업종 별명 (8~15자)
  candidates: { name: string; reason: string }[]; // 후보 업종 3개
}

/**
 * 한 번 호출로 한 줄 요약 + 별명 + 후보 업종 3개 받기.
 * JSON output mode (model 이 JSON 만 출력).
 */
export async function generateReport(input: {
  시도: string;
  시군구: string;
  행정동: string;
  업종: string;
  점수: { 수요: number; 경쟁: number; 임대료: number; 종합: number; 톤: string };
  수요요약: string;
  경쟁요약: string;
  임대료요약: string;
}): Promise<LLMOutput> {
  const c = getClient();

  const prompt = `당신은 한국 자영업 시장 데이터를 자연어로 풀어주는 분석가입니다.
다음 정보를 바탕으로 JSON 으로 답해주세요.

[지역] ${input.시도} ${input.시군구} ${input.행정동}
[업종] ${input.업종}
[점수] 수요 ${input.점수.수요}, 경쟁 ${input.점수.경쟁}, 임대료 ${input.점수.임대료}, 종합 ${input.점수.종합} (${input.점수.톤})
[수요] ${input.수요요약}
[경쟁] ${input.경쟁요약}
[임대료] ${input.임대료요약}

규칙:
1. summary: 2~3문장. "~네요" 같은 친근체. 긍정·우려 균형. 구체 수치 1~2개 인용. 단정적 표현 ("확실해요", "망해요", "무조건") 절대 금지.
2. alias: 지역+업종 별명 한 줄. 8~15자. 예: "테헤란로 IT 사무직 점심 격전지", "주거 밀집 1인가구 카페 시장".
3. candidates: 이 자리에 ${input.업종} 외에도 어울릴 만한 업종 3개. NTS 100대 생활업종 (한식·분식·미용실·편의점·학원·치킨집·세탁소 등) 안에서. 같은 ${input.업종} 은 제외. reason 은 1문장.

다른 설명 없이 JSON 만 출력:
{
  "summary": "...",
  "alias": "...",
  "candidates": [
    { "name": "...", "reason": "..." },
    { "name": "...", "reason": "..." },
    { "name": "...", "reason": "..." }
  ]
}`;

  const r = await c.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 600,
    messages: [{ role: "user", content: prompt }],
  });

  // Anthropic SDK 의 content 는 array of blocks. text 만 추출.
  const text = r.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("");

  // JSON 추출 (model 이 ```json``` 으로 감쌀 수도 있음)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`LLM 응답에서 JSON 못 찾음: ${text.slice(0, 200)}`);
  }
  const parsed = JSON.parse(jsonMatch[0]) as LLMOutput;

  // 검증: candidates 가 정확히 3개인지
  if (!Array.isArray(parsed.candidates) || parsed.candidates.length !== 3) {
    throw new Error(
      `LLM candidates 검증 실패: ${JSON.stringify(parsed.candidates)}`,
    );
  }

  return parsed;
}
