/**
 * 한국부동산원 R-ONE 층별임대료 다운로드 (전체 row).
 *
 * 실행:
 *   npx tsx scripts/ingest/ingest-reb.ts                     # 직전 분기 자동
 *   npx tsx scripts/ingest/ingest-reb.ts --period 202503     # 명시
 *   npx tsx scripts/ingest/ingest-reb.ts --statbl 중대형     # 통계표 변경 (기본 중대형)
 *   npx tsx scripts/ingest/ingest-reb.ts --dry-run
 *
 * 산출:
 *   data/raw/{YYYY0Q}/reb-{key}.json    (예: reb-중대형.json)
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fetchAllRowsWithFallback, defaultPeriod, STATBL, rebMetrics, type StatblId } from "../lib/reb";
import { RAW } from "../lib/paths";

function parseArgs() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const get = (k: string) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const period = get("--period") ?? defaultPeriod();
  const statblKey = (get("--statbl") ?? "중대형") as keyof typeof STATBL;
  if (!(statblKey in STATBL)) throw new Error(`unknown statbl: ${statblKey}`);
  return { period, statblKey, statblId: STATBL[statblKey] as StatblId, dryRun };
}

async function main() {
  const { period, statblKey, statblId, dryRun } = parseArgs();

  console.log(`[ingest-reb] period 시도 시작=${period}  statbl=${statblKey} (${statblId})  dry-run=${dryRun}`);
  if (dryRun) {
    console.log(`  → data/raw/{usedPeriod}/reb-${statblKey}.json (fallback 후 결정)`);
    return;
  }

  const { rows, usedPeriod } = await fetchAllRowsWithFallback(statblId, period);
  const out = resolve(RAW(usedPeriod), `reb-${statblKey}.json`);
  if (existsSync(out)) {
    console.log(`  [캐시 사용] ${usedPeriod}`);
    return;
  }
  mkdirSync(RAW(usedPeriod), { recursive: true });
  writeFileSync(out, JSON.stringify(rows, null, 2), "utf8");
  console.log(
    `  → ${rows.length.toLocaleString()} row 저장 (실제 사용 분기 ${usedPeriod}, 호출 ${rebMetrics.callCount}회)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
