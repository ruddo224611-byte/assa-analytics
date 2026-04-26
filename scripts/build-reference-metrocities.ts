/**
 * 광역시 7개 (부산·대구·인천·광주·대전·울산·세종) reference append.
 *
 * 실행:
 *   npx tsx scripts/build-reference-metrocities.ts
 *
 * 동작 (서울 reference 는 보존, append 만):
 *   1. data/reference/region-codes.csv 끝에 광역시 행정동 추가
 *   2. data/reference/reb-zone-mapping.csv 끝에 광역시 매핑 추가 (모두 low - 광역시별 대표 상권 fallback)
 *
 * 정밀 매핑 (서울처럼 키워드) 은 Phase 2 운영자 라벨링에서. Day 3 은 fallback 으로 시작.
 */

import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { downloadHouseholdCsv } from "./lib/jumin";
import { REFERENCE, RAW, monthId } from "./lib/paths";

// 광역시별 대표 상권 (R-ONE 상권 fallback)
const METROCITY_FALLBACK: Record<string, { reb_zone: string; reb_zone_full: string }> = {
  "부산광역시": { reb_zone: "서면/전포", reb_zone_full: "부산>서면/전포" },
  "대구광역시": { reb_zone: "동성로중심", reb_zone_full: "대구>동성로중심" },
  "인천광역시": { reb_zone: "구월", reb_zone_full: "인천>구월" },
  "광주광역시": { reb_zone: "금남로/충장로", reb_zone_full: "광주>금남로/충장로" },
  "대전광역시": { reb_zone: "둔산", reb_zone_full: "대전>둔산" },
  "울산광역시": { reb_zone: "삼산동", reb_zone_full: "울산>삼산동" },
  "세종특별자치시": { reb_zone: "조치원", reb_zone_full: "세종>조치원" },
};

const TARGET_SIDOS = Object.keys(METROCITY_FALLBACK);

interface ParsedAdong {
  시도: string; 시군구: string; 행정동: string; adong_jumin_10: string;
}

function parseFromJumin(csvText: string): ParsedAdong[] {
  const out: ParsedAdong[] = [];
  const lines = csvText.split(/\r?\n/);
  // 시군구 있는 패턴: "부산광역시 해운대구 우1동(2635050000)"
  const reWithGu = /^"?(\S+?(?:특별시|광역시|특별자치시|특별자치도|도)) (\S+?(?:구|시|군)) (\S+?)\((\d{10})\)/;
  // 시군구 없는 패턴 (세종): "세종특별자치시  조치원읍(3611025000)" — 공백 2개
  const reNoGu = /^"?(세종특별자치시) +(\S+?)\((\d{10})\)/;
  for (const line of lines) {
    let m = line.match(reWithGu);
    if (m && TARGET_SIDOS.includes(m[1])) {
      out.push({ 시도: m[1], 시군구: m[2], 행정동: m[3], adong_jumin_10: m[4] });
      continue;
    }
    m = line.match(reNoGu);
    if (m) {
      // 세종은 시군구 layer 없음 → 시군구 = "세종시" 으로 통일
      out.push({ 시도: m[1], 시군구: "세종시", 행정동: m[2], adong_jumin_10: m[3] });
    }
  }
  return out;
}

async function main() {
  const lastMonth = new Date();
  lastMonth.setMonth(lastMonth.getMonth() - 1);
  const period = monthId(lastMonth.getFullYear(), lastMonth.getMonth() + 1);
  const juminFile = resolve(RAW(period), "jumin-household.csv");
  if (!existsSync(juminFile)) {
    console.log("jumin 캐시 없음 — 다운로드 중...");
    const csv = await downloadHouseholdCsv(lastMonth.getFullYear(), lastMonth.getMonth() + 1);
    writeFileSync(juminFile, csv, "utf8");
  }
  const csv = readFileSync(juminFile, "utf8");
  const records = parseFromJumin(csv);

  // 시도별 집계
  const bySido = new Map<string, ParsedAdong[]>();
  for (const r of records) {
    if (!bySido.has(r.시도)) bySido.set(r.시도, []);
    bySido.get(r.시도)!.push(r);
  }
  for (const sido of TARGET_SIDOS) {
    const list = bySido.get(sido) ?? [];
    console.log(`  ${sido}: ${list.length} 행정동`);
  }

  // region-codes.csv append
  const regionPath = resolve(REFERENCE, "region-codes.csv");
  const regionExisting = readFileSync(regionPath, "utf8");
  const lines: string[] = ["", "# 광역시 7개 (Day 3 자동 추가)"];
  for (const r of records) {
    lines.push(`${r.adong_jumin_10.slice(0, 2)},${r.adong_jumin_10.slice(0, 5)},${r.adong_jumin_10},${r.adong_jumin_10.slice(0, 8)},${r.시도},${r.시군구},${r.행정동}`);
  }
  appendFileSync(regionPath, lines.join("\n") + "\n", "utf8");
  console.log(`  → region-codes.csv append: ${records.length} 행정동`);

  // reb-zone-mapping.csv append (모두 low — 광역시 대표 상권 fallback)
  const mappingPath = resolve(REFERENCE, "reb-zone-mapping.csv");
  const mlines: string[] = ["", "# 광역시 7개 (Day 3 자동 추가, 모두 low fallback)"];
  for (const r of records) {
    const fb = METROCITY_FALLBACK[r.시도];
    mlines.push(`${r.adong_jumin_10},${r.행정동},${fb.reb_zone},${fb.reb_zone_full},low,${r.시도} 광역시 대표 상권 fallback`);
  }
  appendFileSync(mappingPath, mlines.join("\n") + "\n", "utf8");
  console.log(`  → reb-zone-mapping.csv append: ${records.length} 매핑 (모두 low)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
