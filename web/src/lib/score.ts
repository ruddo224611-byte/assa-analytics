/**
 * 룰 엔진 점수 시스템 — Phase 3 Day 3 정밀화.
 *
 * Day 3 변경 (운영자 피드백 — 강남구 다 0~30점 너무 단순):
 *   - 절대 임계값 → **시군구 분위 (percentile rank)** 기반
 *   - 100 = 시군구 안 1위, 50 = 중앙값, 0 = 꼴찌
 *   - 사용자 의도 ("이 자리, 강남구 안에서 어디쯤?") 와 일치
 *
 * 단점 보완: 시군구간 비교는 안 됨 (강남구 100 ≠ 도봉구 100 의 절대 비교).
 *   하지만 운영자 의도는 "이 시군구 안에서 어디 차릴지" 라 분위 기준이 정확.
 *
 * 점수 풀이:
 *   - 수요: 시군구 안에서 사람·30~40대 많은지
 *   - 경쟁: 시군구 안에서 비어있는지 (반경 500m 동일업종)
 *   - 임대료: 시군구 안에서 저렴한지 (1층 기준)
 *   - 종합: 위 3개 가중평균
 */
export interface ScoreInput {
  수요: {
    인구: number | null;
    세대: number | null;
    세대당인구: number | null;
    성비: number | null;
    연령대_10: Record<string, number | null>;
  };
  경쟁: {
    반경500m_동일업종: number;
    반경1km_동일업종: number;
    시군구내_업소수: number | null;
    시군구_YoY_pct: number | null;
  };
  임대료: {
    층별: Record<string, { 임대료_천원_m2: number | null; 효용비율_pct: number | null }>;
  };
}

/**
 * 시군구 컨텍스트 — 같은 시군구 안 모든 행정동·업종의 raw 통계.
 * 페이지·CLI 가 한 번 계산해서 전달.
 */
export interface SignguContext {
  populations: number[]; // 모든 행정동 인구 (정렬 안 됨, 필요 시 정렬)
  age3040Pcts: number[]; // 모든 행정동 30~40대 비율
  rentFloor1: number[]; // 모든 행정동 1층 임대료 (천원/㎡)
  competitionByUpjong: Record<string, number[]>; // 업종 → 모든 행정동 반경 500m 동일업종
}

export interface ScoreResult {
  수요: number; // 0~100
  경쟁: number;
  임대료: number;
  종합: number;
  톤: "양호" | "보통" | "우려" | "데이터부족";
  설명: { 수요: string; 경쟁: string; 임대료: string };
}

// ============ percentile helper ============
// value 가 sorted (오름차순) 안에서 몇 percentile?
// higherBetter=true: 큰 게 좋음 → value 가 클수록 점수 ↑
// higherBetter=false: 작은 게 좋음 → value 가 작을수록 점수 ↑
function percentileScore(
  value: number | null,
  arr: number[],
  higherBetter: boolean,
): number {
  if (value == null) return 50;
  if (arr.length === 0) return 50;
  if (arr.length === 1) return 50; // 비교 대상 1개면 평균
  const sorted = arr.slice().sort((a, b) => a - b);
  let belowCount = 0; // value 보다 "안 좋은" 개수
  let equalCount = 0;
  for (const v of sorted) {
    if (v === value) equalCount++;
    else if ((higherBetter && v < value) || (!higherBetter && v > value))
      belowCount++;
  }
  // 본인 포함 + 동점은 절반씩
  const rank = belowCount + equalCount / 2;
  return Math.round((rank / sorted.length) * 100);
}

// ============ 시군구 컨텍스트 빌더 ============
// page/CLI 모두 사용. SignguData 형식에서 추출.
export function buildSignguContext(signguData: {
  행정동: Record<
    string,
    {
      수요: ScoreInput["수요"];
      임대료: ScoreInput["임대료"];
      업종별: Record<string, { 경쟁: ScoreInput["경쟁"] }>;
    }
  >;
}): SignguContext {
  const ctx: SignguContext = {
    populations: [],
    age3040Pcts: [],
    rentFloor1: [],
    competitionByUpjong: {},
  };
  for (const ad of Object.values(signguData.행정동)) {
    if (ad.수요?.인구) {
      ctx.populations.push(ad.수요.인구);
      const a30 = ad.수요.연령대_10?.["30~39세"] ?? 0;
      const a40 = ad.수요.연령대_10?.["40~49세"] ?? 0;
      ctx.age3040Pcts.push(((a30 + a40) / ad.수요.인구) * 100);
    }
    const f1 = ad.임대료?.층별?.["1층"] ?? ad.임대료?.층별?.["1"];
    if (f1?.임대료_천원_m2) ctx.rentFloor1.push(f1.임대료_천원_m2);
    for (const [u, uData] of Object.entries(ad.업종별)) {
      if (!ctx.competitionByUpjong[u]) ctx.competitionByUpjong[u] = [];
      ctx.competitionByUpjong[u].push(uData.경쟁.반경500m_동일업종);
    }
  }
  return ctx;
}

// ============ 점수 계산 ============
export function calculateScore(
  input: ScoreInput,
  ctx: SignguContext,
  업종: string,
): ScoreResult {
  // 수요 = 인구 분위 0.55 + 30~40대% 분위 0.45
  const popScore = percentileScore(input.수요.인구, ctx.populations, true);
  const age3040 = input.수요.인구
    ? (((input.수요.연령대_10?.["30~39세"] ?? 0) +
        (input.수요.연령대_10?.["40~49세"] ?? 0)) /
        input.수요.인구) *
      100
    : null;
  const ageScore = percentileScore(age3040, ctx.age3040Pcts, true);
  const 수요점수 = Math.round(popScore * 0.55 + ageScore * 0.45);

  // 경쟁 = 반경 500m 동일업종 분위 (낮을수록 ↑) + YoY 가산
  const compArr = ctx.competitionByUpjong[업종] ?? [];
  let 경쟁점수 = percentileScore(
    input.경쟁.반경500m_동일업종,
    compArr,
    false,
  );
  // YoY 감소 추세는 약간 +, 증가 추세는 약간 -
  if (input.경쟁.시군구_YoY_pct != null) {
    const yoyAdj = -input.경쟁.시군구_YoY_pct * 1.5; // -1% YoY → +1.5점
    경쟁점수 = Math.max(0, Math.min(100, 경쟁점수 + yoyAdj));
  }
  경쟁점수 = Math.round(경쟁점수);

  // 임대료 = 1층 임대료 분위 (낮을수록 ↑)
  const f1 = input.임대료.층별?.["1"];
  let 임대료점수 = 50;
  let 임대료설명 = "1층 임대료 데이터 없음";
  if (f1?.임대료_천원_m2) {
    임대료점수 = percentileScore(f1.임대료_천원_m2, ctx.rentFloor1, false);
    const 평당 = Math.round(f1.임대료_천원_m2 * 1000 * 3.305785);
    임대료설명 = `1층 ${f1.임대료_천원_m2} 천원/㎡ (평당 약 ${평당.toLocaleString()}원/월)`;
  }

  // 종합: 수요 30% + 경쟁 35% + 임대료 35%
  const 종합 = Math.round(
    수요점수 * 0.3 + 경쟁점수 * 0.35 + 임대료점수 * 0.35,
  );

  // 톤
  let 톤: ScoreResult["톤"];
  if (input.수요.인구 == null && !f1?.임대료_천원_m2) 톤 = "데이터부족";
  else if (종합 >= 65) 톤 = "양호";
  else if (종합 >= 40) 톤 = "보통";
  else 톤 = "우려";

  // 설명
  const 수요설명parts: string[] = [];
  if (input.수요.인구 != null) 수요설명parts.push(`인구 ${input.수요.인구.toLocaleString()}명`);
  if (age3040 != null) 수요설명parts.push(`30~40대 ${age3040.toFixed(0)}%`);
  const 수요설명 = 수요설명parts.join(", ");

  const yoyText =
    input.경쟁.시군구_YoY_pct == null
      ? ""
      : input.경쟁.시군구_YoY_pct > 1
        ? ", 시군구 증가 추세"
        : input.경쟁.시군구_YoY_pct < -1
          ? ", 시군구 감소 추세"
          : ", 시군구 안정";
  const 경쟁설명 = `반경 500m 에 ${input.경쟁.반경500m_동일업종}개${yoyText}`;

  return {
    수요: 수요점수,
    경쟁: 경쟁점수,
    임대료: 임대료점수,
    종합,
    톤,
    설명: { 수요: 수요설명, 경쟁: 경쟁설명, 임대료: 임대료설명 },
  };
}
