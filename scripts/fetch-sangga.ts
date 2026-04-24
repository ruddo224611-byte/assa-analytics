/**
 * 공공데이터포털 "소상공인시장진흥공단 상가(상권)정보" 계열 API 동작 확인용.
 *
 * 실행법:
 *   npx tsx scripts/fetch-sangga.ts
 *
 * 현재 상태 (2026-04-25 기준):
 *   [OK]  api.odcloud.kr/15083033/*  — 통계 리포트 엔드포인트 정상 호출됨
 *   [403] apis.data.go.kr/B553077/* — Forbidden. 우리가 실제로 원하는
 *                                    "반경 기반 상가 POI 조회 (baroApi)" 는
 *                                    별도 활용신청 필요.
 *
 * 활용신청 완료되면 `fetchStoresInRadius` 가 그대로 동작하도록 작성해두었음.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const ENV_PATH = resolve(ROOT, "web/.env.local");
const SAMPLE_DIR = resolve(ROOT, "docs/phase0/samples");

function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = readFileSync(ENV_PATH, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const env = loadEnv();
const KEY = env.PUBLIC_DATA_API_KEY;
if (!KEY) throw new Error("PUBLIC_DATA_API_KEY 가 web/.env.local 에 없음");

type JsonValue = unknown;

/**
 * 15083033 네임스페이스 — 통계 리포트 전용 (활용신청 완료, 호출 OK).
 * 샘플: 전국 카페 월별 업소수 추이 (2015-12 ~ 2019-09)
 */
async function fetchCafeMonthlyStats(): Promise<JsonValue> {
  const uddi = "uddi:363ece31-09ac-47e2-85b1-bdbd25f19618";
  const url = new URL(`https://api.odcloud.kr/api/15083033/v1/${uddi}`);
  url.searchParams.set("page", "1");
  url.searchParams.set("perPage", "40");
  url.searchParams.set("serviceKey", KEY);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`[15083033] HTTP ${res.status}`);
  return res.json();
}

/**
 * B553077 baroApi — 반경 내 상가업소 POI 조회. 활용신청 완료되면 동작.
 * 현재는 403 Forbidden 예상.
 */
async function fetchStoresInRadius(opts: {
  cx: number; // 경도(lng)
  cy: number; // 위도(lat)
  radius: number; // meters
  indsLclsCd?: string; // 업종 대분류 (선택)
}): Promise<JsonValue> {
  const url = new URL(
    "https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInRadius",
  );
  url.searchParams.set("serviceKey", KEY);
  url.searchParams.set("type", "json");
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "100");
  url.searchParams.set("radius", String(opts.radius));
  url.searchParams.set("cx", String(opts.cx));
  url.searchParams.set("cy", String(opts.cy));
  if (opts.indsLclsCd) url.searchParams.set("indsLclsCd", opts.indsLclsCd);

  const res = await fetch(url);
  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(
      `[B553077] HTTP ${res.status}: ${bodyText.slice(0, 100)} — baroApi 활용신청 필요`,
    );
  }
  return JSON.parse(bodyText);
}

async function main() {
  mkdirSync(SAMPLE_DIR, { recursive: true });

  console.log("[1/2] 15083033 (카페 월별 통계) 호출 중...");
  const stats = (await fetchCafeMonthlyStats()) as {
    totalCount: number;
    currentCount: number;
  };
  writeFileSync(
    resolve(SAMPLE_DIR, "sangga-sample.json"),
    JSON.stringify(stats, null, 2),
  );
  console.log(
    `  → 총 ${stats.totalCount}건 중 ${stats.currentCount}건 — sangga-sample.json 저장 완료`,
  );

  console.log(
    "\n[2/2] B553077 (역삼역 반경 500m 카페) 호출 시도 (403 Forbidden 예상)...",
  );
  try {
    // 역삼역 EPSG:4326 좌표: cx=경도 127.036380, cy=위도 37.500640
    const result = await fetchStoresInRadius({
      cx: 127.03638,
      cy: 37.50064,
      radius: 500,
      indsLclsCd: "Q", // 음식 (가정)
    });
    writeFileSync(
      resolve(SAMPLE_DIR, "sangga-radius-sample.json"),
      JSON.stringify(result, null, 2),
    );
    console.log("  → 성공! sangga-radius-sample.json 저장됨");
  } catch (e) {
    console.log(`  → ${(e as Error).message}`);
    console.log(
      "    활용신청: https://www.data.go.kr — '소상공인시장진흥공단 상가(상권)정보' 검색 후 OpenAPI 신청",
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
