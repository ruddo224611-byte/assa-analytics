/**
 * Anthropic Claude Haiku 4.5 클라이언트 — Phase 3 Day 2 (강화).
 *
 * Day 2 변경:
 *   - candidates (후보 업종 3개) 제거 (운영자 피드백)
 *   - 비교 컨텍스트 (시군구 평균, 같은 행정동 업종 순위) 추가
 *   - prompt 가 "이 자리만의 특이점" 콕 짚도록 강화
 *   - summary 길이 2~3문장 → 4~5문장
 *
 * 환경변수: ANTHROPIC_API_KEY
 * 모델: claude-haiku-4-5
 *
 * 비용: 호출당 ~$0.001 (1.4원). input 늘어서 약간 ↑.
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
  alias: string; // 지역+업종 별명 (8~15자)
  summary: string; // 4~5문장. 특이점 콕 짚기 + 구체 비교
}

export interface CompareContext {
  // 시군구 평균 대비 이 행정동 위치
  signgu_avg_pop: number | null; // 시군구 평균 인구
  signgu_avg_age3040_pct: number | null; // 시군구 평균 30~40대 비율
  this_age3040_pct: number | null; // 이 행정동 30~40대 비율

  // 이 행정동 안에서 이 업종의 상대 위치
  upjong_rank_in_adong: number | null; // 종합점수 순위 (1 = 가장 높음)
  upjong_total_in_adong: number | null; // 행정동 안 총 업종 수 (대개 99)

  // 같은 시군구 안 같은 업종의 상대 위치
  adong_rank_in_signgu: number | null; // 종합점수 순위
  adong_total_in_signgu: number | null;
}

/**
 * 한 번 호출로 별명 + 요약.
 * 비교 컨텍스트 + 점수 + 핵심 통계 → 깊이 있는 분석.
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
  비교: CompareContext;
}): Promise<LLMOutput> {
  const c = getClient();

  // 비교 컨텍스트 자연어 변환
  const compareLines: string[] = [];
  if (input.비교.signgu_avg_pop != null && input.수요요약.includes("인구")) {
    const avg = input.비교.signgu_avg_pop;
    const popMatch = input.수요요약.match(/인구\s+([\d,]+)명/);
    if (popMatch) {
      const thisPop = Number(popMatch[1].replace(/,/g, ""));
      const ratio = (thisPop / avg).toFixed(2);
      compareLines.push(
        `이 행정동 인구는 ${input.시군구} 평균 (${avg.toLocaleString()}명) 대비 ${ratio}배`,
      );
    }
  }
  if (
    input.비교.signgu_avg_age3040_pct != null &&
    input.비교.this_age3040_pct != null
  ) {
    const diff =
      input.비교.this_age3040_pct - input.비교.signgu_avg_age3040_pct;
    const sign = diff > 0 ? "+" : "";
    compareLines.push(
      `30~40대 비율 ${input.비교.this_age3040_pct.toFixed(1)}% (시군구 평균 ${input.비교.signgu_avg_age3040_pct.toFixed(1)}% 대비 ${sign}${diff.toFixed(1)}%p)`,
    );
  }
  if (input.비교.upjong_rank_in_adong && input.비교.upjong_total_in_adong) {
    const pct = Math.round(
      (input.비교.upjong_rank_in_adong / input.비교.upjong_total_in_adong) * 100,
    );
    compareLines.push(
      `이 행정동 ${input.비교.upjong_total_in_adong}개 업종 중 ${input.업종} 종합점수 ${input.비교.upjong_rank_in_adong}위 (상위 ${pct}%)`,
    );
  }
  if (input.비교.adong_rank_in_signgu && input.비교.adong_total_in_signgu) {
    const pct = Math.round(
      (input.비교.adong_rank_in_signgu / input.비교.adong_total_in_signgu) * 100,
    );
    compareLines.push(
      `${input.시군구} ${input.비교.adong_total_in_signgu}개 동 중 ${input.업종} 적합도 ${input.비교.adong_rank_in_signgu}위 (상위 ${pct}%)`,
    );
  }
  const compareBlock =
    compareLines.length > 0
      ? `[비교 컨텍스트]\n${compareLines.map((l) => `- ${l}`).join("\n")}\n\n`
      : "";

  const prompt = `당신은 한국 자영업 시장 데이터를 자연어로 풀어주는 베테랑 분석가입니다.
누구나 보면 알 수 있는 평범한 말 ("인구 많네요", "경쟁 심하네요") 은 절대 쓰지 마세요.
대신 데이터에서 발견되는 **이 자리만의 특이점·역설·놓치기 쉬운 함의**를 짚어주세요.

[지역] ${input.시도} ${input.시군구} ${input.행정동}
[업종] ${input.업종}
[점수] 수요 ${input.점수.수요}, 경쟁 ${input.점수.경쟁}, 임대료 ${input.점수.임대료}, 종합 ${input.점수.종합} (${input.점수.톤})
[수요] ${input.수요요약}
[경쟁] ${input.경쟁요약}
[임대료] ${input.임대료요약}

${compareBlock}규칙:
1. **alias**: 지역+업종 별명 한 줄. 8~15자. 예: "테헤란로 직장인 점심 격전지", "주거 밀집 1인가구 카페 시장".
2. **summary**: 4~5문장. 친근체 ("~네요", "~인 셈이에요"). **반드시** 다음 3가지 포함:
   (1) 비교 컨텍스트에서 도출되는 **이 자리만의 특이점** (시군구 평균/순위 활용 — "강남구 평균보다 인구 1.3배인 데 비해..." 같이)
   (2) 데이터에서 보이는 **숨은 함의 또는 역설** (예: "수요는 평균인데 30~40대만 유독 많아서 점심 직장인 시장에 집중 가능", "경쟁이 적은 게 좋아 보이지만 시군구 1위라 거주 인구 자체가 부족할 가능성")
   (3) 신중한 결론 ("판단은 현장에서", "추가 확인 필요" 같은 단정 회피)
3. 단정적 표현 ("확실해요", "무조건", "망해요", "성공해요") 절대 금지.
4. "참고용" 의식. 운영자가 카페 사장님인 친근한 톤.

다른 설명 없이 JSON 만 출력 (markdown code fence 도 X):
{
  "alias": "...",
  "summary": "..."
}`;

  const r = await c.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 800,
    messages: [{ role: "user", content: prompt }],
  });

  const text = r.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("");

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`LLM 응답에서 JSON 못 찾음: ${text.slice(0, 200)}`);
  }
  const parsed = JSON.parse(jsonMatch[0]) as LLMOutput;

  if (!parsed.alias || !parsed.summary) {
    throw new Error(`LLM 출력 검증 실패: ${JSON.stringify(parsed)}`);
  }

  return parsed;
}
