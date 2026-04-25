/**
 * 한국부동산원 R-ONE OpenAPI — 상업용부동산 임대동향조사 층별임대료 다운로드.
 *
 * 실행법:
 *   npx tsx scripts/fetch-reb.ts             # 최신 분기
 *   npx tsx scripts/fetch-reb.ts 202503      # 분기 명시 (2025년 3분기)
 *
 * 환경변수 (web/.env.local): REB_API_KEY
 *
 * 통계표 (활용신청 승인 후 호출 가능, 모두 분기 단위):
 *   T241873134863890  중대형상가 층별임대료 및 층별효용비율 (★ 우리 MVP 의 메인)
 *   T246233134891629  소규모상가 층별임대료 및 층별효용비율
 *   T249023134703697  집합상가 층별임대료 및 층별효용비율
 *   TT242293134242089 오피스 층별임대료 및 층별효용비율
 *
 * 호출 패턴:
 *   GET https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do
 *     ?KEY=...&Type=json&pIndex=N&pSize=1000
 *     &STATBL_ID=...&DTACYCLE_CD=QY
 *     &WRTTIME_IDTFR_ID=YYYY0Q   # 예: 202503 = 2025년 3분기
 *
 * 응답 한도: 한 페이지 1,000 row (그 이상은 ERROR-336). 분기당 ~4,270 row → 5 페이지.
 *
 * row 필드:
 *   GRP_ID/GRP_NM/GRP_FULLNM  — 상권 (예: "서울>강남대로")
 *   CLS_ID/CLS_NM             — 층 분류 (지하1층/1층/2층/3층/4층/5층/6층이상)
 *   ITM_ID/ITM_NM             — 지표 (임대료 / 층별효용비율)
 *   DTA_VAL                   — 값
 *   UI_NM                     — 단위 (천원/㎡ 또는 %)
 *   WRTTIME_DESC              — "2025년 3분기" 등
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { requireEnv } from "./lib/env";

const SAMPLE_DIR = resolve(process.cwd(), "docs/phase0/samples");
const REB_KEY = requireEnv("REB_API_KEY");

const STATBL = {
  중대형: "T241873134863890",
  소규모: "T246233134891629",
  집합: "T249023134703697",
  오피스: "TT242293134242089",
} as const;

interface Row {
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

interface ApiResp {
  SttsApiTblData?: [
    { head: [{ list_total_count: number }, { RESULT: { CODE: string; MESSAGE: string } }] },
    { row: Row[] },
  ];
  RESULT?: { CODE: string; MESSAGE: string };
}

async function fetchOnePage(statblId: string, period: string, page: number): Promise<{
  total: number;
  rows: Row[];
}> {
  const url = new URL("https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do");
  url.searchParams.set("KEY", REB_KEY);
  url.searchParams.set("Type", "json");
  url.searchParams.set("pIndex", String(page));
  url.searchParams.set("pSize", "1000");
  url.searchParams.set("STATBL_ID", statblId);
  url.searchParams.set("DTACYCLE_CD", "QY");
  url.searchParams.set("WRTTIME_IDTFR_ID", period);
  const res = await fetch(url);
  const json = (await res.json()) as ApiResp;
  if (json.RESULT?.CODE && json.RESULT.CODE !== "INFO-000") {
    throw new Error(`R-ONE ${json.RESULT.CODE}: ${json.RESULT.MESSAGE}`);
  }
  const data = json.SttsApiTblData;
  if (!data) throw new Error("SttsApiTblData 누락");
  const total = data[0].head[0].list_total_count;
  const rows = data[1]?.row ?? [];
  return { total, rows };
}

async function fetchAll(statblId: string, period: string): Promise<Row[]> {
  const all: Row[] = [];
  let total = Infinity;
  for (let p = 1; all.length < total; p++) {
    const { total: t, rows } = await fetchOnePage(statblId, period, p);
    total = t;
    all.push(...rows);
    if (rows.length === 0) break;
  }
  return all;
}

/** 가장 최신 분기 자동 탐색 (현재 분기부터 역순). */
function defaultPeriod(): string {
  const now = new Date();
  const y = now.getFullYear();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  // 분기 데이터는 분기 다음 분기 중반에 공개되므로 "직전 분기" 가 안전
  const prev = q === 1 ? { y: y - 1, q: 4 } : { y, q: q - 1 };
  return `${prev.y}${String(prev.q).padStart(2, "0")}`;
}

function pivotByZoneAndFloor(rows: Row[]) {
  // (상권, 층) 키로 임대료/효용비율 묶기
  const map = new Map<string, Record<string, unknown>>();
  for (const r of rows) {
    const key = `${r.GRP_FULLNM}|${r.CLS_NM}`;
    const e =
      map.get(key) ??
      ({
        시도_상권: r.GRP_FULLNM,
        층: r.CLS_NM,
        층_정렬: r.CLS_ID,
        분기: r.WRTTIME_DESC,
      } as Record<string, unknown>);
    if (r.ITM_NM === "임대료") {
      e["임대료_천원_m2"] = r.DTA_VAL;
    } else if (r.ITM_NM === "층별효용비율" || r.ITM_NM.includes("효용")) {
      e["효용비율_pct"] = r.DTA_VAL;
    } else {
      e[r.ITM_NM] = r.DTA_VAL;
    }
    map.set(key, e);
  }
  return Array.from(map.values()).sort((a, b) => {
    const ak = String(a["시도_상권"]) + String(a["층_정렬"]).padStart(5, "0");
    const bk = String(b["시도_상권"]) + String(b["층_정렬"]).padStart(5, "0");
    return ak.localeCompare(bk);
  });
}

async function main() {
  mkdirSync(SAMPLE_DIR, { recursive: true });

  const period = process.argv[2] ?? defaultPeriod();
  const tableId = STATBL.중대형;
  console.log(`[1/1] R-ONE 중대형상가 층별임대료 — ${period}, 5 페이지 받기...`);

  const rows = await fetchAll(tableId, period);
  console.log(`  → 받은 행: ${rows.length}`);

  const pivoted = pivotByZoneAndFloor(rows);
  console.log(`  → (상권 × 층) 조합: ${pivoted.length}`);

  // 서울만 추출 (일단 우리 MVP 1차 타겟)
  const seoul = pivoted.filter((p) =>
    String(p["시도_상권"]).startsWith("서울"),
  );
  console.log(`  → 서울 상권 row: ${seoul.length}`);

  // CSV 저장
  const headers = ["분기", "시도_상권", "층", "임대료_천원_m2", "효용비율_pct"];
  const csv = [
    "# 한국부동산원 R-ONE OpenAPI — 임대동향 층별임대료 및 층별효용비율 (중대형상가)",
    `# STATBL_ID=${tableId}, WRTTIME_IDTFR_ID=${period}, 단위: 임대료=천원/㎡, 효용비율=%`,
    `# 다운로드: ${new Date().toISOString()}`,
    headers.join(","),
    ...seoul.map((p) =>
      headers
        .map((h) => {
          const v = p[h];
          if (v == null) return "";
          if (typeof v === "string" && v.includes(",")) return `"${v}"`;
          return String(v);
        })
        .join(","),
    ),
  ].join("\n");

  const outPath = resolve(SAMPLE_DIR, "rent-sample.csv");
  writeFileSync(outPath, csv + "\n", "utf8");
  console.log(`  → 저장: docs/phase0/samples/rent-sample.csv (서울 ${seoul.length}행)`);

  // 강남 관련 콘솔 미리보기
  console.log("\n=== 강남 관련 상권 (콘솔 미리보기) ===");
  const gangnam = seoul.filter((p) =>
    String(p["시도_상권"]).includes("강남"),
  );
  for (const p of gangnam) {
    const rent = p["임대료_천원_m2"];
    const ratio = p["효용비율_pct"];
    console.log(
      `  ${p["시도_상권"]} ${String(p["층"]).padStart(6)} : 임대료 ${
        rent !== undefined && rent !== null ? Number(rent).toFixed(1) : "—"
      } 천원/㎡  /  효용 ${ratio !== undefined && ratio !== null ? Number(ratio).toFixed(1) : "—"}%`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
