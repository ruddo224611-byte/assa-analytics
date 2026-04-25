/**
 * 행안부 jumin.mois.go.kr — 주민등록 인구 및 세대현황 (월별, 행정동 단위) CSV 다운로드.
 *
 * 실행법:
 *   npx tsx scripts/fetch-jumin.ts            # 기본: 직전 월
 *   npx tsx scripts/fetch-jumin.ts 2026 03    # 연/월 지정
 *
 * 데이터셋: jumin.mois.go.kr/statMonth.do (인구 + 세대수 통합)
 *   컬럼: 행정구역, 총인구수, 세대수, 세대당인구, 남자인구수, 여자인구수, 남여비율
 *   인코딩: EUC-KR (CP949) — scripts/lib/encoding.ts 사용
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { decodeEucKrResponse } from "./lib/encoding";

const SAMPLE_DIR = resolve(process.cwd(), "docs/phase0/samples");
const ENDPOINT =
  "https://jumin.mois.go.kr/downloadCsv.do?searchYearMonth=month&xlsStats=3";

// 샘플로 뽑을 행정구역 (강남구 주요 동 + 비교용)
const SAMPLE_REGIONS = [
  "서울특별시  (1100000000)",
  "서울특별시 강남구 (1168000000)",
  "서울특별시 강남구 신사동",
  "서울특별시 강남구 역삼1동",
  "서울특별시 강남구 역삼2동",
  "서울특별시 강남구 삼성1동",
  "서울특별시 강남구 압구정동",
  "서울특별시 강남구 청담동",
];

function parseCsv(text: string): string[][] {
  // CSV 안에 quoted comma 가 있는 행정구역 컬럼이 있으므로 단순 split 대신 정규식 처리
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const out: string[] = [];
      let cur = "";
      let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
          inQ = !inQ;
        } else if (c === "," && !inQ) {
          out.push(cur);
          cur = "";
        } else {
          cur += c;
        }
      }
      out.push(cur);
      return out;
    });
}

function buildForm(year: string, month: string): URLSearchParams {
  const startDe = `${year}${month}01`;
  // 단순화: 월말 일자 (해당 월의 마지막 일) — 31 / 30 / 28 정밀도는 다운로드 비영향
  const endDe = `${year}${month}31`;
  return new URLSearchParams({
    sltOrgType: "1",
    sltOrgLvl1: "A",
    sltOrgLvl2: "",
    gender: "gender",
    genderPer: "genderPer",
    generation: "generation",
    sltUndefType: "",
    searchYearStart: year,
    searchMonthStart: month,
    searchYearEnd: year,
    searchMonthEnd: month,
    sltOrderType: "1",
    sltOrderValue: "ASC",
    category: "month",
    state: "3", // 전체 읍면동 현황
    nowYear: year,
    startOrtnDe: startDe,
    endOrtnDe: endDe,
  });
}

async function main() {
  mkdirSync(SAMPLE_DIR, { recursive: true });

  const args = process.argv.slice(2);
  const now = new Date();
  // 직전 월 기본값 (이번 달 데이터는 보통 익월 초~중순 공개)
  now.setMonth(now.getMonth() - 1);
  const year = args[0] ?? String(now.getFullYear());
  const month = args[1] ?? String(now.getMonth() + 1).padStart(2, "0");

  console.log(`[1/1] 주민등록 인구·세대현황 ${year}-${month} 다운로드 중...`);
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: "https://jumin.mois.go.kr/statMonth.do",
      Origin: "https://jumin.mois.go.kr",
      "User-Agent": "Mozilla/5.0",
    },
    body: buildForm(year, month).toString(),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const csv = await decodeEucKrResponse(res);
  const rows = parseCsv(csv);
  const [header, ...data] = rows;
  console.log(`  → ${data.length.toLocaleString()} 행, ${header.length} 컬럼`);

  // 샘플 추출 (행정구역 prefix 매칭)
  const sample: string[][] = [header];
  for (const region of SAMPLE_REGIONS) {
    const row = data.find((r) => r[0].startsWith(region));
    if (row) sample.push(row);
  }

  const outPath = resolve(SAMPLE_DIR, "jumin-household-sample.csv");
  writeFileSync(
    outPath,
    sample.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n") + "\n",
    "utf8",
  );
  console.log(
    `  → 샘플 ${sample.length - 1}행 저장: docs/phase0/samples/jumin-household-sample.csv`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
