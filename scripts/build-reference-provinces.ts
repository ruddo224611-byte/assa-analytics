/**
 * 도 9개 (경기·강원·충북·충남·전북·전남·경북·경남·제주) reference append.
 *
 * 실행:
 *   npx tsx scripts/build-reference-provinces.ts
 *
 * 도 jumin 패턴 (정규식):
 *   "경기도 수원시 장안구 파장동(4111156000)"  → 시군구="수원시 장안구", 동="파장동"
 *   "경기도 가평군 가평읍(4111025000)"          → 시군구="가평군", 동="가평읍"
 *   "강원특별자치도 춘천시 신북읍(5111025000)"   → 시군구="춘천시", 동="신북읍"
 *
 * NTS 시군구명 일치 사전 검증 (세종 사고 재발 방지):
 *   매핑 후 NTS 시군구 set 과 비교, 불일치 시 경고 출력.
 */

import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { downloadHouseholdCsv } from "./lib/jumin";
import { REFERENCE, RAW, monthId } from "./lib/paths";

// 도별 R-ONE 대표 상권 fallback
const PROVINCE_FALLBACK: Record<string, { reb_zone: string; reb_zone_full: string }> = {
  "경기도": { reb_zone: "고양시청", reb_zone_full: "경기>고양시청" },
  "강원특별자치도": { reb_zone: "강릉중부", reb_zone_full: "강원>강릉중부" },
  "충청북도": { reb_zone: "봉명사거리", reb_zone_full: "충북>봉명사거리" },
  "충청남도": { reb_zone: "공주대", reb_zone_full: "충남>공주대" },
  "전북특별자치도": { reb_zone: "군산원도심", reb_zone_full: "전북>군산원도심" },
  "전라남도": { reb_zone: "광양읍", reb_zone_full: "전남>광양읍" },
  "경상북도": { reb_zone: "경산시청", reb_zone_full: "경북>경산시청" },
  "경상남도": { reb_zone: "거제고현", reb_zone_full: "경남>거제고현" },
  "제주특별자치도": { reb_zone: "노형오거리", reb_zone_full: "제주>노형오거리" },
};

const TARGET_SIDOS = Object.keys(PROVINCE_FALLBACK);

interface ParsedAdong {
  시도: string; 시군구: string; 행정동: string; adong_jumin_10: string;
}

function parseFromJumin(csvText: string): ParsedAdong[] {
  const out: ParsedAdong[] = [];
  const lines = csvText.split(/\r?\n/);
  // 도 패턴: 시도 + (시군구 1~2 segment) + (행정동: 동/읍/면) + 코드
  // 그룹화: 시도 / 중간 (시군구) / 마지막 (행정동) / 코드
  const re = /^"?(\S+?(?:특별자치도|도)) (.+) (\S+?(?:동|읍|면))\((\d{10})\)/;
  for (const line of lines) {
    const m = line.match(re);
    if (m && TARGET_SIDOS.includes(m[1])) {
      out.push({ 시도: m[1], 시군구: m[2].trim(), 행정동: m[3], adong_jumin_10: m[4] });
    }
  }
  return out;
}

function loadNtsSignguSet(): Set<string> {
  // NTS CSV 의 (시도, 시군구) 조합 set
  const ntsFile = resolve(RAW(monthId(new Date(Date.now() - 30*86400*1000).getFullYear(), new Date(Date.now() - 30*86400*1000).getMonth() + 1)), "nts-life100.csv");
  const text = readFileSync(ntsFile, "utf8");
  const set = new Set<string>();
  for (const line of text.split(/\r?\n/).slice(1)) {
    const c = line.split(",");
    if (c.length >= 3) set.add(`${c[1]}|${c[2]}`);
  }
  return set;
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
    const sgs = new Set(list.map((r) => r.시군구));
    console.log(`  ${sido}: ${list.length} 행정동, ${sgs.size} 시군구`);
  }

  // NTS 사전 검증
  console.log("\n=== NTS 시군구명 일치 검증 ===");
  const ntsSet = loadNtsSignguSet();
  const mismatch: { 시도: string; 시군구: string; nts후보: string[] }[] = [];
  const usedSgs = new Set<string>();
  for (const r of records) usedSgs.add(`${r.시도}|${r.시군구}`);
  for (const k of usedSgs) {
    if (!ntsSet.has(k)) {
      const [sido, signgu] = k.split("|");
      const cand = [...ntsSet].filter((x) => x.startsWith(sido + "|")).map((x) => x.split("|")[1]);
      mismatch.push({ 시도: sido, 시군구: signgu, nts후보: cand.slice(0, 3) });
    }
  }
  if (mismatch.length > 0) {
    console.warn(`⚠️  NTS 매칭 실패 ${mismatch.length}건:`);
    for (const m of mismatch.slice(0, 10)) {
      console.warn(`    ${m.시도} / ${m.시군구}  → NTS 후보: ${m.nts후보.join(", ")}`);
    }
    if (mismatch.length > 10) console.warn(`    ... 외 ${mismatch.length-10}건`);
  } else {
    console.log("  ✓ 모든 시군구 NTS 와 일치");
  }

  // append
  const regionPath = resolve(REFERENCE, "region-codes.csv");
  const lines: string[] = ["", "# 도 9개 (Day 4 자동 추가)"];
  for (const r of records) {
    lines.push(`${r.adong_jumin_10.slice(0,2)},${r.adong_jumin_10.slice(0,5)},${r.adong_jumin_10},${r.adong_jumin_10.slice(0,8)},${r.시도},${r.시군구},${r.행정동}`);
  }
  appendFileSync(regionPath, lines.join("\n") + "\n", "utf8");
  console.log(`\n  → region-codes.csv append: ${records.length} 행정동`);

  const mappingPath = resolve(REFERENCE, "reb-zone-mapping.csv");
  const mlines: string[] = ["", "# 도 9개 (Day 4 자동 추가, 모두 low fallback)"];
  for (const r of records) {
    const fb = PROVINCE_FALLBACK[r.시도];
    mlines.push(`${r.adong_jumin_10},${r.행정동},${fb.reb_zone},${fb.reb_zone_full},low,${r.시도} 도 대표 상권 fallback`);
  }
  appendFileSync(mappingPath, mlines.join("\n") + "\n", "utf8");
  console.log(`  → reb-zone-mapping.csv append: ${records.length} 매핑`);
}

main().catch((e) => { console.error(e); process.exit(1); });
