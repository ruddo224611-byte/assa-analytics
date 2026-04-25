/**
 * 한국부동산원 R-ONE OpenAPI 래퍼.
 *
 * 환경변수: REB_API_KEY
 *
 * 핵심 특징:
 *   - SttsApiTblData.do  pSize 한도 1,000 (ERROR-336)
 *   - 페이지네이션 자동
 *   - 분기 인자: WRTTIME_IDTFR_ID = `YYYY0Q` (예: "202503" = 2025년 3분기)
 *
 * 통계표 (활용신청 승인 후 호출 가능):
 *   T241873134863890  중대형상가 층별임대료 및 층별효용비율 (★ MVP 메인)
 *   T246233134891629  소규모상가
 *   T249023134703697  집합상가
 *   TT242293134242089 오피스
 */

import { requireEnv } from "./env";

const KEY = requireEnv("REB_API_KEY");
const BASE = "https://www.reb.or.kr/r-one/openapi";

export const STATBL = {
  중대형: "T241873134863890",
  소규모: "T246233134891629",
  집합: "T249023134703697",
  오피스: "TT242293134242089",
} as const;

export type StatblId = (typeof STATBL)[keyof typeof STATBL];

export interface RebRow {
  STATBL_ID: string;
  WRTTIME_IDTFR_ID: string;
  GRP_ID: number;
  GRP_NM: string;
  GRP_FULLNM: string;
  CLS_ID: number;
  CLS_NM: string;
  ITM_ID: number;
  ITM_NM: string;
  DTA_VAL: number | null;
  UI_NM: string;
  WRTTIME_DESC: string;
}

interface RebResponse {
  SttsApiTblData?: [
    { head: [{ list_total_count: number }, { RESULT: { CODE: string; MESSAGE: string } }] },
    { row: RebRow[] },
  ];
  RESULT?: { CODE: string; MESSAGE: string };
}

export const rebMetrics = { callCount: 0 };

async function callOnePage(
  statblId: string,
  period: string,
  page: number,
  pSize = 1000,
): Promise<{ total: number; rows: RebRow[] }> {
  const url = new URL(`${BASE}/SttsApiTblData.do`);
  url.searchParams.set("KEY", KEY);
  url.searchParams.set("Type", "json");
  url.searchParams.set("pIndex", String(page));
  url.searchParams.set("pSize", String(pSize));
  url.searchParams.set("STATBL_ID", statblId);
  url.searchParams.set("DTACYCLE_CD", "QY");
  url.searchParams.set("WRTTIME_IDTFR_ID", period);
  rebMetrics.callCount++;
  const res = await fetch(url);
  const json = (await res.json()) as RebResponse;
  if (json.RESULT?.CODE && json.RESULT.CODE !== "INFO-000") {
    throw new Error(`REB ${json.RESULT.CODE}: ${json.RESULT.MESSAGE}`);
  }
  const data = json.SttsApiTblData;
  if (!data) throw new Error("SttsApiTblData 누락");
  return {
    total: data[0].head[0].list_total_count,
    rows: data[1]?.row ?? [],
  };
}

/** 통계표 + 분기 → 전체 row (페이지네이션 자동). */
export async function fetchAllRows(
  statblId: string,
  period: string,
): Promise<RebRow[]> {
  const all: RebRow[] = [];
  let total = Infinity;
  for (let p = 1; all.length < total; p++) {
    const { total: t, rows } = await callOnePage(statblId, period, p);
    total = t;
    all.push(...rows);
    if (rows.length === 0) break;
  }
  return all;
}

/**
 * 가장 최신 분기 자동 탐색 + fallback.
 * 분기 데이터는 분기 종료 후 발표까지 ~2달 걸려서 직전 분기가 비어있을 수 있음.
 * 직전 → 직전직전 → ... 최대 4분기 이전까지 시도.
 */
export function defaultPeriod(): string {
  const now = new Date();
  const y = now.getFullYear();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  const prev = q === 1 ? { y: y - 1, q: 4 } : { y, q: q - 1 };
  return `${prev.y}${String(prev.q).padStart(2, "0")}`;
}

export function previousPeriods(period: string, n: number): string[] {
  const y0 = Number(period.slice(0, 4));
  const q0 = Number(period.slice(-2));
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    let y = y0;
    let q = q0 - i;
    while (q <= 0) {
      q += 4;
      y -= 1;
    }
    out.push(`${y}${String(q).padStart(2, "0")}`);
  }
  return out;
}

/** period → 데이터 있으면 사용, NODATA 면 직전 분기로 자동 fallback (최대 4단계). */
export async function fetchAllRowsWithFallback(
  statblId: string,
  period: string,
): Promise<{ rows: RebRow[]; usedPeriod: string }> {
  for (const p of previousPeriods(period, 4)) {
    try {
      const rows = await fetchAllRows(statblId, p);
      if (rows.length > 0) return { rows, usedPeriod: p };
    } catch (e) {
      const m = (e as Error).message;
      if (m.includes("INFO-200") || m.includes("해당하는 데이터")) {
        console.warn(`  [reb] ${p} NODATA → 한 분기 과거로 fallback`);
        continue;
      }
      throw e;
    }
  }
  throw new Error(`REB: ${period} 부터 4분기 fallback 모두 NODATA`);
}

/** (상권, 층) 으로 피벗 — 임대료 + 효용비율 같은 객체에 머지. */
export interface RebPivot {
  분기: string;
  상권_full: string;
  층: string;
  층_정렬: number;
  임대료_천원_m2: number | null;
  효용비율_pct: number | null;
}

export function pivotByZoneAndFloor(rows: RebRow[]): RebPivot[] {
  const map = new Map<string, RebPivot>();
  for (const r of rows) {
    const key = `${r.GRP_FULLNM}|${r.CLS_NM}`;
    const e =
      map.get(key) ??
      ({
        분기: r.WRTTIME_DESC,
        상권_full: r.GRP_FULLNM,
        층: r.CLS_NM,
        층_정렬: r.CLS_ID,
        임대료_천원_m2: null,
        효용비율_pct: null,
      } as RebPivot);
    if (r.ITM_NM === "임대료") e.임대료_천원_m2 = r.DTA_VAL;
    else if (r.ITM_NM.includes("효용")) e.효용비율_pct = r.DTA_VAL;
    map.set(key, e);
  }
  return Array.from(map.values()).sort((a, b) =>
    (a.상권_full + String(a.층_정렬).padStart(5, "0")).localeCompare(
      b.상권_full + String(b.층_정렬).padStart(5, "0"),
    ),
  );
}
