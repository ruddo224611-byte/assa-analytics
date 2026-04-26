/**
 * 창업 시뮬레이터 — BEP (손익분기점) 계산.
 *
 * Phase 3 Day 2 변경: 3시나리오 (낙관/기준/보수) → 단일 결과 (운영자 피드백).
 * 사용자가 직접 입력한 값 그대로 계산해서 결과 보여줌.
 *
 * 입력:
 *   - rentKrwPerM2K (천원/㎡, 임대료. 1층 기준 자동 적용)
 *   - 평수, 객단가, 일평균 손님 수, 인건비 (사용자 입력)
 *
 * 출력:
 *   - 단일 시나리오: 매출 / 변동비 / 고정비 / 영업이익 / BEP
 *
 * 가정 (참고용 강조):
 *   - 1평 = 3.305785㎡
 *   - 임대료(천원/㎡) × 평수 × 3.305785 × 1000 = 월 임대료(원). R-ONE 중대형 평균 기준
 *   - 고정비 = 월세 + 인건비 + 기타 (= (월세 + 인건비) × 0.15)
 *   - 변동비 = 매출 × 재료비율
 *   - 영업이익 = 매출 - 변동비 - 고정비
 *   - BEP 매출 = 고정비 / (1 - 변동비율)
 */

export const PYEONG_TO_M2 = 3.305785;

export interface UpjongDefaults {
  객단가: number;
  재료비율: number; // 0~1
  일평균손님: number;
}

// 업종별 기본값 (카페 사장 직관 + 일반 통념. 정확한 산업 평균은 추후 보강)
export const UPJONG_DEFAULTS: Record<string, UpjongDefaults> = {
  커피음료점: { 객단가: 6000, 재료비율: 0.30, 일평균손님: 50 },
  한식음식점: { 객단가: 12000, 재료비율: 0.35, 일평균손님: 80 },
  중식음식점: { 객단가: 13000, 재료비율: 0.32, 일평균손님: 70 },
  일식음식점: { 객단가: 18000, 재료비율: 0.35, 일평균손님: 60 },
  기타외국식음식점: { 객단가: 20000, 재료비율: 0.32, 일평균손님: 50 },
  분식점: { 객단가: 7000, 재료비율: 0.32, 일평균손님: 80 },
  제과점: { 객단가: 6000, 재료비율: 0.32, 일평균손님: 100 },
  패스트푸드점: { 객단가: 9000, 재료비율: 0.35, 일평균손님: 90 },
  치킨전문점: { 객단가: 22000, 재료비율: 0.40, 일평균손님: 35 },
  간이주점: { 객단가: 18000, 재료비율: 0.30, 일평균손님: 30 },
  호프주점: { 객단가: 22000, 재료비율: 0.30, 일평균손님: 35 },
  편의점: { 객단가: 5000, 재료비율: 0.70, 일평균손님: 250 },
  슈퍼마켓: { 객단가: 12000, 재료비율: 0.75, 일평균손님: 150 },
  미용실: { 객단가: 25000, 재료비율: 0.15, 일평균손님: 15 },
  피부관리업: { 객단가: 60000, 재료비율: 0.15, 일평균손님: 8 },
  pc방: { 객단가: 4000, 재료비율: 0.10, 일평균손님: 80 },
  노래방: { 객단가: 18000, 재료비율: 0.10, 일평균손님: 25 },
  // 일반 fallback
  default: { 객단가: 10000, 재료비율: 0.30, 일평균손님: 50 },
};

export function getUpjongDefaults(upjong: string): UpjongDefaults {
  return UPJONG_DEFAULTS[upjong] ?? UPJONG_DEFAULTS.default;
}

export interface SimulatorInput {
  rentKrwPerM2K: number | null; // 천원/㎡ (1층 기준)
  평수: number;
  객단가: number;
  일평균손님: number; // 사용자 입력값 그대로
  인건비: number; // 월 (원). 직원 1인 기준
  재료비율: number; // 0~1
}

export interface SimulatorResult {
  월세: number;
  고정비_breakdown: { 월세: number; 인건비: number; 기타: number };
  일평균손님: number;
  월매출: number;
  월변동비: number;
  월고정비: number;
  월영업이익: number;
  BEP_매출: number;
  BEP_손님: number;
  달성률_pct: number; // 매출 / BEP * 100
}

export function calculate(input: SimulatorInput): SimulatorResult {
  const { rentKrwPerM2K, 평수, 객단가, 일평균손님, 인건비, 재료비율 } = input;

  // 월 임대료 (원)
  const 월세 = rentKrwPerM2K
    ? Math.round(rentKrwPerM2K * 1000 * 평수 * PYEONG_TO_M2)
    : 0;
  const 기타고정비 = Math.round((월세 + 인건비) * 0.15); // 관리비·공과금·소모품 등 추정
  const 월고정비 = 월세 + 인건비 + 기타고정비;

  const 월매출 = 일평균손님 * 객단가 * 30;
  const 월변동비 = Math.round(월매출 * 재료비율);
  const 월영업이익 = 월매출 - 월변동비 - 월고정비;
  const BEP_매출 = Math.round(월고정비 / (1 - 재료비율));
  const BEP_손님 = Math.round(BEP_매출 / (객단가 * 30));
  const 달성률_pct = 월매출 > 0 ? (월매출 / BEP_매출) * 100 : 0;

  return {
    월세,
    고정비_breakdown: { 월세, 인건비, 기타: 기타고정비 },
    일평균손님,
    월매출,
    월변동비,
    월고정비,
    월영업이익,
    BEP_매출,
    BEP_손님,
    달성률_pct,
  };
}

export function fmtKrw(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000_000) return `${Math.round(n / 10_000)}만`;
  if (n >= 10_000) return `${Math.round(n / 10_000)}만`;
  return n.toLocaleString("ko-KR");
}
