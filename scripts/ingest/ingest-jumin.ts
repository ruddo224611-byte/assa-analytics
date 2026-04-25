/**
 * 인구·세대현황 + 연령별 인구 두 CSV 를 받아서 raw 디렉터리에 저장.
 *
 * 실행:
 *   npx tsx scripts/ingest/ingest-jumin.ts                # 직전 월
 *   npx tsx scripts/ingest/ingest-jumin.ts 2026 03        # 명시
 *   npx tsx scripts/ingest/ingest-jumin.ts --dry-run      # 다운로드 X, 캐시 위치만 출력
 *
 * 산출:
 *   data/raw/{YYYYMM}/jumin-household.csv
 *   data/raw/{YYYYMM}/jumin-age.csv
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { downloadHouseholdCsv, downloadAgeCsv } from "../lib/jumin";
import { RAW, monthId } from "../lib/paths";

function parseArgs() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const positional = args.filter((a) => !a.startsWith("--"));
  let year: number;
  let month: number;
  if (positional.length >= 2) {
    year = Number(positional[0]);
    month = Number(positional[1]);
  } else {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    year = d.getFullYear();
    month = d.getMonth() + 1;
  }
  return { year, month, dryRun };
}

async function main() {
  const { year, month, dryRun } = parseArgs();
  const period = monthId(year, month);
  const dir = RAW(period);
  const outHousehold = resolve(dir, "jumin-household.csv");
  const outAge = resolve(dir, "jumin-age.csv");

  console.log(`[ingest-jumin] period=${period}  dry-run=${dryRun}`);
  console.log(`  → ${outHousehold}`);
  console.log(`  → ${outAge}`);

  if (dryRun) return;

  mkdirSync(dir, { recursive: true });

  if (!existsSync(outHousehold)) {
    console.log("  [1/2] 인구·세대현황 다운로드...");
    const csv = await downloadHouseholdCsv(year, month);
    writeFileSync(outHousehold, csv, "utf8");
    console.log(`        ${csv.length.toLocaleString()} bytes 저장`);
  } else {
    console.log("  [1/2] 캐시 사용 (jumin-household.csv)");
  }

  if (!existsSync(outAge)) {
    console.log("  [2/2] 연령별 인구 다운로드...");
    const csv = await downloadAgeCsv(year, month);
    writeFileSync(outAge, csv, "utf8");
    console.log(`        ${csv.length.toLocaleString()} bytes 저장`);
  } else {
    console.log("  [2/2] 캐시 사용 (jumin-age.csv)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
