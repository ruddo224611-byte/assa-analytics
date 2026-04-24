/**
 * 국세청 "100대 생활업종" 사업자 현황 CSV 다운로드 + 샘플 추출.
 *
 * 실행법:
 *   npx tsx scripts/fetch-ntax.ts
 *
 * 데이터셋: data.go.kr 15061118 — 국세청_사업자현황_100대 생활업종
 *   최신 기준: 2025-08-31, 월 단위 갱신, CSV (EUC-KR)
 *   컬럼: 업종, 시도, 시군구, 당월, 전월, 전년동월
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { decodeEucKrResponse } from "./lib/encoding";

const SAMPLE_DIR = resolve(process.cwd(), "docs/phase0/samples");

// data.go.kr 파일 다운로드 (atchFileId 는 페이지 HTML 에서 스크레이핑한 값)
const FILE_DOWNLOAD_URL =
  "https://www.data.go.kr/cmm/cmm/fileDownload.do" +
  "?atchFileId=FILE_000000003620844&fileDetailSn=1&insertDataPrcus=N";

// 샘플로 뽑을 조합 (강남구 주요 업종 + 시군구 비교용)
const SAMPLE_ROWS: Array<{ 업종: string; 시군구: string }> = [
  { 업종: "커피음료점", 시군구: "강남구" },
  { 업종: "한식음식점", 시군구: "강남구" },
  { 업종: "제과점", 시군구: "강남구" },
  { 업종: "간이주점", 시군구: "강남구" },
  { 업종: "미용실", 시군구: "강남구" },
  { 업종: "부동산중개업", 시군구: "강남구" },
  { 업종: "편의점", 시군구: "강남구" },
  { 업종: "노래방", 시군구: "강남구" },
  { 업종: "pc방", 시군구: "강남구" },
  { 업종: "커피음료점", 시군구: "서초구" },
  { 업종: "커피음료점", 시군구: "마포구" },
];

function parseCsv(text: string): string[][] {
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(","));
}

function formatCsv(rows: string[][]): string {
  return rows.map((r) => r.join(",")).join("\n") + "\n";
}

async function main() {
  mkdirSync(SAMPLE_DIR, { recursive: true });

  console.log("[1/1] 국세청 100대 생활업종 CSV 다운로드 중...");
  const res = await fetch(FILE_DOWNLOAD_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const csv = await decodeEucKrResponse(res);
  const rows = parseCsv(csv);
  const [header, ...data] = rows;
  console.log(`  → ${data.length.toLocaleString()} 행, ${header.length} 컬럼`);
  console.log(`    헤더: ${header.join(" | ")}`);

  // 샘플 뽑기 (업종 × 시군구 매칭, 서울특별시 기준)
  const seoul = data.filter((r) => r[1] === "서울특별시");
  const sample: string[][] = [header];
  for (const sel of SAMPLE_ROWS) {
    const row = seoul.find(
      (r) => r[0] === sel.업종 && r[2] === sel.시군구,
    );
    if (row) sample.push(row);
  }

  const outPath = resolve(SAMPLE_DIR, "ntax-life100-sample.csv");
  writeFileSync(outPath, formatCsv(sample), "utf8");
  console.log(
    `  → 샘플 ${sample.length - 1}행 저장: docs/phase0/samples/ntax-life100-sample.csv`,
  );

  // 100개 업종 개수·지역 단위 검증 로그
  const upjong = new Set(data.map((r) => r[0]));
  const regions = new Set(data.map((r) => `${r[1]}|${r[2]}`));
  console.log(
    `\n  검증: 업종 ${upjong.size}개, (시도,시군구) 조합 ${regions.size}개`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
