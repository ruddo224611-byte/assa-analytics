/**
 * 룰 엔진 점수 시스템 — Phase 3 Day 1.
 *
 * 입력: 행정동 데이터 + 업종 데이터 (build-signgu-h.ts 산출물 일부).
 * 출력: 4가지 점수 (0~100) + 톤 ("양호"/"보통"/"우려").
 *
 * 톤다운 정책:
 *   - 빨강·초록 같은 단정적 색상 X
 *   - "양호 / 보통 / 우려" 처럼 데이터 표현
 *   - 점수는 LLM prompt 의 input 으로도 사용
 */
export interface ScoreInput {
  수요: {
    인구: number | null;
    세대: number | null;
    세대당인구: number | null;
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

export interface ScoreResult {
  수요: number; // 0~100
  경쟁: number;
  임대료: number;
  종합: number;
  톤: "양호" | "보통" | "우려" | "데이터부족";
  설명: { 수요: string; 경쟁: string; 임대료: string };
}

// 0~100 사이로 자르기
const clamp = (n: number) => Math.max(0, Math.min(100, n));

/**
 * 수요 점수: 인구 + 30~49세 비율 + 세대당 인구 균형.
 *
 *   - 인구 (10000명 = 100, 0명 = 0): 가중치 0.4
 *   - 30~49세 비율 (40% = 100, 10% = 0): 가중치 0.3
 *   - 세대당 인구 (2.0 가까울수록 100, 1.0/3.5 양극단 = 0): 가중치 0.3
 */
function scoreDemand(d: ScoreInput["수요"]): { score: number; 설명: string } {
  if (d.인구 == null) return { score: 0, 설명: "데이터 부족" };

  const popScore = clamp((d.인구 / 10000) * 100);

  const a30 = d.연령대_10["30~39세"] ?? 0;
  const a40 = d.연령대_10["40~49세"] ?? 0;
  const ageRatio = (a30 + a40) / Math.max(d.인구, 1);
  const ageScore = clamp(((ageRatio - 0.1) / 0.3) * 100); // 10% → 0, 40% → 100

  let hhScore = 50;
  if (d.세대당인구 != null) {
    const dist = Math.abs(d.세대당인구 - 2.0);
    hhScore = clamp(100 - dist * 80);
  }

  const total = clamp(popScore * 0.4 + ageScore * 0.3 + hhScore * 0.3);

  // 설명 생성
  const parts: string[] = [];
  if (d.인구 != null) parts.push(`인구 ${d.인구.toLocaleString()}명`);
  if (ageRatio > 0) parts.push(`30~40대 ${(ageRatio * 100).toFixed(0)}%`);
  return { score: Math.round(total), 설명: parts.join(", ") };
}

/**
 * 경쟁 점수: 반경 500m 의 동일업종 수 + 시군구 YoY.
 *
 *   - 반경 500m: 0개=100, 5개=70, 15개=40, 30+개=0 (지수 감쇠)
 *   - 시군구 YoY: 감소 추세 +, 증가 추세 약간 - (가중치 작음)
 */
function scoreCompetition(c: ScoreInput["경쟁"]): { score: number; 설명: string } {
  const n500 = c.반경500m_동일업종;
  const baseScore = clamp(100 * Math.exp(-n500 / 8));

  let yoyAdjust = 0;
  if (c.시군구_YoY_pct != null) {
    yoyAdjust = clamp(-c.시군구_YoY_pct * 2); // -1% YoY → +2점
    yoyAdjust = Math.max(-20, Math.min(20, yoyAdjust));
  }

  const total = clamp(baseScore + yoyAdjust);

  const yoyText =
    c.시군구_YoY_pct == null
      ? ""
      : c.시군구_YoY_pct > 1
        ? ", 시군구 증가 추세"
        : c.시군구_YoY_pct < -1
          ? ", 시군구 감소 추세"
          : ", 시군구 안정";
  return {
    score: Math.round(total),
    설명: `반경 500m 에 ${n500}개${yoyText}`,
  };
}

/**
 * 임대료 점수: 1층 임대료 (낮을수록 높음).
 *
 *   - 1층 20 천원/㎡ → 100, 50 → 60, 80+ → 0 (linear)
 *   - 1층 데이터 없으면 데이터부족
 */
function scoreRent(r: ScoreInput["임대료"]): { score: number; 설명: string } {
  const f1 = r.층별["1"];
  if (!f1?.임대료_천원_m2) return { score: 0, 설명: "1층 임대료 데이터 없음" };

  const rent = f1.임대료_천원_m2;
  // 20 → 100, 50 → 60, 80 → 20, 100+ → 0
  const score = clamp(100 - ((rent - 20) / 80) * 100);
  const 평당월세 = Math.round(rent * 1000 * 3.305785);
  return {
    score: Math.round(score),
    설명: `1층 ${rent} 천원/㎡ (평당 약 ${평당월세.toLocaleString()}원/월)`,
  };
}

export function calculateScore(input: ScoreInput): ScoreResult {
  const d = scoreDemand(input.수요);
  const c = scoreCompetition(input.경쟁);
  const r = scoreRent(input.임대료);

  // 종합: 수요 30% + 경쟁 35% + 임대료 35%
  const total = clamp(d.score * 0.3 + c.score * 0.35 + r.score * 0.35);

  // 톤: 65+ 양호, 35-64 보통, 35 미만 우려, 데이터 결손 시 데이터부족
  let 톤: ScoreResult["톤"];
  if (input.수요.인구 == null && !input.임대료.층별["1"]) 톤 = "데이터부족";
  else if (total >= 65) 톤 = "양호";
  else if (total >= 35) 톤 = "보통";
  else 톤 = "우려";

  return {
    수요: d.score,
    경쟁: c.score,
    임대료: r.score,
    종합: Math.round(total),
    톤,
    설명: { 수요: d.설명, 경쟁: c.설명, 임대료: r.설명 },
  };
}
