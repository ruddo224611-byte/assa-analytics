/**
 * 국세청 100대 생활업종 사업자 현황 CSV 다운로드.
 *
 * 실행:
 *   npx tsx scripts/ingest/ingest-nts.ts
 *   npx tsx scripts/ingest/ingest-nts.ts --dry-run
 *
 * 산출:
 *   data/raw/{현재YYYYMM}/nts-life100.csv
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { downloadNtsCsv } from "../lib/nts";
import { RAW, monthId } from "../lib/paths";

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const periodArg = args.find((a) => /^\d{6}$/.test(a));
  // 기본: 직전 월 (jumin 과 동일 캐시 디렉터리 사용)
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  const period = periodArg ?? monthId(d.getFullYear(), d.getMonth() + 1);
  const out = resolve(RAW(period), "nts-life100.csv");

  console.log(`[ingest-nts] period=${period}  dry-run=${dryRun}`);
  console.log(`  → ${out}`);
  if (dryRun) return;

  mkdirSync(RAW(period), { recursive: true });
  if (existsSync(out)) {
    console.log("  [캐시 사용]");
    return;
  }
  const csv = await downloadNtsCsv();
  writeFileSync(out, csv, "utf8");
  console.log(`  → ${csv.length.toLocaleString()} bytes 저장`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
