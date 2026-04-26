/**
 * region-index.json 생성 — 홈 페이지 cascade dropdown 용.
 *
 * 입력: ../data/reference/region-codes.csv + taxonomy-nts-to-sbiz.csv
 * 출력: public/region-index.json
 *
 * 구조:
 *   { 시도: [{ name, 시군구: [{ name, 행정동: [...] }] }], 업종: [...] }
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(__dirname, "..");

const candidateRefDirs = [
  resolve(WEB_ROOT, "..", "data", "reference"),
  resolve(process.cwd(), "data", "reference"),
  resolve(process.cwd(), "..", "data", "reference"),
];

function findRefDir() {
  for (const d of candidateRefDirs) {
    if (existsSync(resolve(d, "region-codes.csv"))) return d;
  }
  return null;
}

function main() {
  const refDir = findRefDir();
  if (!refDir) {
    console.warn("[region-index] data/reference 못 찾음. 빈 인덱스 생성.");
    writeFileSync(resolve(WEB_ROOT, "public", "region-index.json"), JSON.stringify({ 시도: [], 업종: [] }));
    return;
  }
  console.log(`[region-index] refDir = ${refDir}`);

  // region-codes.csv → 시도 → 시군구 → 행정동
  const regionCsv = readFileSync(resolve(refDir, "region-codes.csv"), "utf8");
  const sidoMap = new Map(); // sido → Map<signgu, adong[]>
  for (const line of regionCsv.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const c = line.split(",");
    if (c.length < 7) continue;
    if (c[0] === "시도코드") continue; // header
    const [, , , , sido, signgu, adong] = c;
    if (!sido || !signgu || !adong) continue;
    if (!sidoMap.has(sido)) sidoMap.set(sido, new Map());
    const signguMap = sidoMap.get(sido);
    if (!signguMap.has(signgu)) signguMap.set(signgu, []);
    signguMap.get(signgu).push(adong);
  }

  // 시도/시군구 정렬 우선순위 (서울 → 광역시 → 도)
  const SIDO_ORDER = [
    "서울특별시", "부산광역시", "대구광역시", "인천광역시", "광주광역시", "대전광역시", "울산광역시", "세종특별자치시",
    "경기도", "강원특별자치도", "충청북도", "충청남도", "전북특별자치도", "전라남도", "경상북도", "경상남도", "제주특별자치도",
  ];

  const sidos = Array.from(sidoMap.entries())
    .sort(([a], [b]) => {
      const ai = SIDO_ORDER.indexOf(a); const bi = SIDO_ORDER.indexOf(b);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    })
    .map(([sido, signguMap]) => ({
      name: sido,
      시군구: Array.from(signguMap.entries())
        .sort(([a], [b]) => a.localeCompare(b, "ko"))
        .map(([signgu, adongs]) => ({
          name: signgu,
          행정동: adongs.sort((a, b) => a.localeCompare(b, "ko")),
        })),
    }));

  // 업종
  const taxoCsv = readFileSync(resolve(refDir, "taxonomy-nts-to-sbiz.csv"), "utf8");
  const upjongs = [];
  const lines = taxoCsv.split("\n");
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    // CSV 안에 quoted comma 있을 수 있어 수동 파싱
    const cells = parseCsvLine(line);
    if (cells.length < 2) continue;
    if (cells[1] === "NTS_only") continue; // 통신판매업 등 제외
    if (cells[0]) upjongs.push(cells[0]);
  }

  const out = { 시도: sidos, 업종: upjongs.sort((a, b) => a.localeCompare(b, "ko")) };
  const outPath = resolve(WEB_ROOT, "public", "region-index.json");
  writeFileSync(outPath, JSON.stringify(out));
  console.log(`[region-index] 시도 ${sidos.length} / 시군구 ${sidos.reduce((a, s) => a + s.시군구.length, 0)} / 행정동 ${sidos.reduce((a, s) => a + s.시군구.reduce((b, g) => b + g.행정동.length, 0), 0)} / 업종 ${upjongs.length}`);
  console.log(`[region-index] 저장: ${outPath} (${(JSON.stringify(out).length / 1024).toFixed(1)} KB)`);
}

function parseCsvLine(line) {
  const out = [];
  let cur = ""; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQ = !inQ;
    else if (ch === "," && !inQ) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

main();
