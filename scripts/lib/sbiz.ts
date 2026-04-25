/**
 * 공단 B553077 baroApi 래퍼.
 *
 * 환경변수: SBIZ_API_KEY
 *
 * 특징:
 *   - 활용신청 직후 60초 캐시 활성화 지연 → 첫 403 시 1회 자동 재시도
 *   - storeListInDong 페이지네이션 자동 (numOfRows<=1000 권장)
 *   - 일 한도 10,000회 → 호출 횟수 노출 (`callCount`) 해서 ETL 진행률 모니터링
 *
 * 발견된 엔드포인트 (Day 6 검증 완료):
 *   /storeListInDong  divId=adongCd|signguCd|ldongCd  key=...  indsSclsCd?
 *   /storeOne         key=상가업소번호
 *   /storeZoneInRadius / storeZoneInRectangle / storeZoneInAdmi  (상권 zone)
 *   /storeZoneOne, /baroApi
 */

import { requireEnv } from "./env";

const KEY = requireEnv("SBIZ_API_KEY");
const BASE = "https://apis.data.go.kr/B553077/api/open/sdsc2";

export const sbizMetrics = { callCount: 0, retries: 0 };

/** Sleep helper. */
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function callOnce(path: string, params: Record<string, string>) {
  const url = new URL(`${BASE}/${path}`);
  url.searchParams.set("serviceKey", KEY);
  url.searchParams.set("type", "json");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  sbizMetrics.callCount++;
  const res = await fetch(url);
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

/** 60초 캐시 활성화 대기 후 1회 재시도 — 활용신청 직후 흔히 발생. */
async function callWithRetry(path: string, params: Record<string, string>) {
  let r = await callOnce(path, params);
  // 403: 활용신청 직후 캐시 활성화 지연 (60초 대기 후 1회 재시도)
  if (r.status === 403) {
    sbizMetrics.retries++;
    console.warn(`  [sbiz] 403 — 60초 대기 후 재시도 (캐시 활성화)`);
    await sleep(60_000);
    r = await callOnce(path, params);
  }
  // 429: rate limit (분당 또는 시간당 한도 초과). 60초 대기 후 최대 3회 재시도
  let retry429 = 0;
  while (r.status === 429 && retry429 < 3) {
    sbizMetrics.retries++;
    retry429++;
    const wait = 60_000 * retry429;
    console.warn(`  [sbiz] 429 rate limit — ${wait/1000}초 대기 후 재시도 (${retry429}/3)`);
    await sleep(wait);
    r = await callOnce(path, params);
  }
  if (!r.ok) {
    throw new Error(`SBIZ ${path} HTTP ${r.status}: ${r.body.slice(0, 120)}`);
  }
  return JSON.parse(r.body) as SbizResponse;
}

interface SbizResponse {
  header?: { resultCode?: string; resultMsg?: string };
  body?: { items?: SbizStore[]; totalCount?: number; numOfRows?: number; pageNo?: number };
}

export interface SbizStore {
  bizesId: string;
  bizesNm: string;
  brchNm?: string;
  indsLclsCd: string;
  indsLclsNm: string;
  indsMclsCd: string;
  indsMclsNm: string;
  indsSclsCd: string;
  indsSclsNm: string;
  ksicCd?: string;
  ksicNm?: string;
  ctprvnCd: string;
  ctprvnNm: string;
  signguCd: string;
  signguNm: string;
  adongCd: string; // 8자리
  adongNm: string;
  ldongCd?: string;
  ldongNm?: string;
  rdnmAdr?: string;
  lnoAdr?: string;
  bldNm?: string;
  flrNo?: string;
  lon: number;
  lat: number;
  [k: string]: unknown;
}

/** 행정동 단위 상가 리스트 (페이지네이션 포함, 8자리 코드). */
export async function fetchStoresInDong(
  adongCd8: string,
  opts: { indsSclsCd?: string; perPage?: number } = {},
): Promise<SbizStore[]> {
  const perPage = opts.perPage ?? 1000;
  const all: SbizStore[] = [];
  let total = Infinity;
  for (let page = 1; all.length < total; page++) {
    const params: Record<string, string> = {
      divId: "adongCd",
      key: adongCd8,
      pageNo: String(page),
      numOfRows: String(perPage),
    };
    if (opts.indsSclsCd) params.indsSclsCd = opts.indsSclsCd;
    const json = await callWithRetry("storeListInDong", params);
    const items = json.body?.items ?? [];
    if (items.length === 0) break;
    total = json.body?.totalCount ?? items.length;
    all.push(...items);
    if (items.length < perPage) break; // 마지막 페이지
  }
  return all;
}

/** WGS84 거리 (m). 클라이언트 반경 필터에 사용. */
export function distMeters(
  lng1: number,
  lat1: number,
  lng2: number,
  lat2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
