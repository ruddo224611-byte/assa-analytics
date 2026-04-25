/**
 * 공공데이터포털 "소상공인시장진흥공단 상가(상권)정보" 계열 API 동작 확인용.
 *
 * 실행법:
 *   npx tsx scripts/fetch-sangga.ts
 *
 * 환경변수 (web/.env.local):
 *   PUBLIC_DATA_API_KEY — odcloud (15083033) 통계 호출용
 *   SBIZ_API_KEY        — apis.data.go.kr B553077 baroApi 호출용 (활용신청 승인 후 활성)
 *
 * B553077 엔드포인트 (활용신청 승인 화면 기준):
 *   /storeListInDong       — 행정동코드/시군구코드로 상가업소 리스트
 *   /storeOne              — 단일 상가업소 (상가업소번호로)
 *   /storeZoneInRadius     — 반경 내 상권 zone (개별 상가 X)
 *   /storeZoneInRectangle  — 사각형 내 상권 zone
 *   /storeZoneInAdmi       — 행정구역 내 상권 zone
 *   /storeZoneOne          — 지정 상권 한 건 조회
 *   /baroApi               — 행정경계조회 (시도/시군구/읍면동 메타)
 *
 * 주의: 활용신청 승인 직후 ~1시간 가량 키 활성화 캐시 지연 가능 (403 일 수 있음).
 *       이 경우 data.go.kr 마이페이지의 "미리보기" 버튼 1회 클릭 또는 대기 후 재시도.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnv, requireEnv } from "./lib/env";

const SAMPLE_DIR = resolve(process.cwd(), "docs/phase0/samples");
const env = loadEnv();
const ODCLOUD_KEY = requireEnv("PUBLIC_DATA_API_KEY", env);
const SBIZ_KEY = env.SBIZ_API_KEY ?? ODCLOUD_KEY; // 미설정 시 동일 키 fallback

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
  url.searchParams.set("serviceKey", ODCLOUD_KEY);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`[15083033] HTTP ${res.status}`);
  return res.json();
}

const BARO_BASE = "https://apis.data.go.kr/B553077/api/open/sdsc2";

async function callBaro(path: string, params: Record<string, string>): Promise<{
  ok: boolean;
  status: number;
  body: string;
}> {
  const url = new URL(`${BARO_BASE}/${path}`);
  url.searchParams.set("serviceKey", SBIZ_KEY);
  url.searchParams.set("type", "json");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

/** 행정동코드 단위 상가업소 리스트 (역삼1동: 1168064000 등). */
async function fetchStoresInDong(adongCd: string, indsSclsCd?: string) {
  const params: Record<string, string> = {
    divId: "adongCd",
    key: adongCd,
    pageNo: "1",
    numOfRows: "1000",
  };
  if (indsSclsCd) params.indsSclsCd = indsSclsCd;
  return callBaro("storeListInDong", params);
}

/** 반경 내 상권(zone) 리스트 — 개별 상가가 아닌 상권 단위. */
async function fetchZonesInRadius(cx: number, cy: number, radius: number) {
  return callBaro("storeZoneInRadius", {
    radius: String(radius),
    cx: String(cx),
    cy: String(cy),
    pageNo: "1",
    numOfRows: "100",
  });
}

// 역삼동 = 역삼1동 + 역삼2동
// jumin 의 10자리 행정동코드(1168064000)는 끝 2자리 통반 정보. B553077 baroApi 의 adongCd 는 앞 8자리만.
// 예: 1168064000 → 11680640
const YEOKSAM_1DONG = "11680640";
const YEOKSAM_2DONG = "11680650";
// 역삼역 EPSG:4326

const YEOKSAM_STN = { cx: 127.03638, cy: 37.50064 };
const SBIZ_CAFE = "I21201"; // 카페 (비알코올 음료점업)

/** 두 좌표(WGS84) 거리, 미터. */
function distMeters(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function main() {
  mkdirSync(SAMPLE_DIR, { recursive: true });

  console.log("[1/3] 15083033 (카페 월별 통계) 호출 중...");
  const stats = (await fetchCafeMonthlyStats()) as {
    totalCount: number;
    currentCount: number;
  };
  writeFileSync(
    resolve(SAMPLE_DIR, "sangga-sample.json"),
    JSON.stringify(stats, null, 2),
  );
  console.log(`  → ${stats.totalCount}건 중 ${stats.currentCount}건 저장`);

  console.log("\n[2/3] B553077 storeListInDong (역삼1동·2동 카페) 호출 중...");
  const allStores: Array<Record<string, unknown>> = [];
  for (const dong of [YEOKSAM_1DONG, YEOKSAM_2DONG]) {
    const res = await fetchStoresInDong(dong, SBIZ_CAFE);
    if (!res.ok) {
      console.log(
        `  ⚠️  ${dong} HTTP ${res.status} — ${res.body.slice(0, 100)}`,
      );
      console.log(
        "      활용신청 직후라면 키 캐시 활성화에 ~1시간 소요. data.go.kr 마이페이지 '미리보기' 1회 클릭 후 재시도.",
      );
      writeFileSync(
        resolve(SAMPLE_DIR, "sangga-yeoksam-cafe-error.json"),
        JSON.stringify(
          { httpStatus: res.status, body: res.body, dong, indsSclsCd: SBIZ_CAFE },
          null,
          2,
        ),
      );
      console.log("      → sangga-yeoksam-cafe-error.json 에 응답 기록");
      return;
    }
    const json = JSON.parse(res.body) as {
      body?: { items?: Array<Record<string, unknown>>; totalCount?: number };
    };
    const items = json.body?.items ?? [];
    console.log(`  → ${dong} : ${items.length}건 (totalCount=${json.body?.totalCount})`);
    allStores.push(...items);
  }

  // 역삼역에서 500m 이내 필터
  const within500 = allStores.filter((s) => {
    const lng = Number(s.lon ?? s.x ?? s.cx);
    const lat = Number(s.lat ?? s.y ?? s.cy);
    if (!isFinite(lng) || !isFinite(lat)) return false;
    return distMeters(YEOKSAM_STN.cx, YEOKSAM_STN.cy, lng, lat) <= 500;
  });
  console.log(
    `\n[3/3] 역삼역 반경 500m 필터: ${within500.length} / ${allStores.length} 건`,
  );

  writeFileSync(
    resolve(SAMPLE_DIR, "sangga-yeoksam-cafe-500m.json"),
    JSON.stringify(
      {
        meta: {
          center: { name: "역삼역", ...YEOKSAM_STN },
          radius_m: 500,
          source: "B553077 baroApi storeListInDong (역삼1동+역삼2동) → 클라이언트 거리 필터",
          indsSclsCd: SBIZ_CAFE,
          fetchedAt: new Date().toISOString(),
        },
        count: within500.length,
        items: within500,
      },
      null,
      2,
    ),
  );
  console.log("  → sangga-yeoksam-cafe-500m.json 저장 완료");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
