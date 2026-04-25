/**
 * 행정동 × 업종 단위 상가 POI 수집.
 *
 * 실행:
 *   npx tsx scripts/ingest/ingest-sbiz.ts --adong 11680640 --indsScls I21201
 *   npx tsx scripts/ingest/ingest-sbiz.ts --region-csv data/reference/region-codes.csv --indsScls I21201
 *   npx tsx scripts/ingest/ingest-sbiz.ts --adong 11680640 --dry-run
 *
 * 산출:
 *   data/raw/{period}/sbiz-{adong8}-{indsScls or all}.json
 *
 * period: 항상 현재 YYYYMM (B553077 데이터는 분기 갱신이지만 우리는 매월 캐시 갱신 가능)
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fetchStoresInDong, sbizMetrics } from "../lib/sbiz";
import { loadRegions } from "../lib/region";
import { RAW, monthId } from "../lib/paths";

function parseArgs() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const get = (k: string) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : undefined;
  };
  return {
    adong: get("--adong"),
    regionCsv: get("--region-csv"),
    indsScls: get("--indsScls"),
    dryRun,
  };
}

async function main() {
  const { adong, regionCsv, indsScls, dryRun } = parseArgs();
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  const period = monthId(d.getFullYear(), d.getMonth() + 1);
  const dir = RAW(period);
  const tag = indsScls ?? "all";

  let adongList: string[];
  if (adong) {
    adongList = [adong];
  } else if (regionCsv) {
    adongList = loadRegions().map((r) => r.adong_sbiz_8);
  } else {
    throw new Error("--adong 또는 --region-csv 중 하나 필요");
  }

  console.log(
    `[ingest-sbiz] adong ${adongList.length}개 / indsScls=${indsScls ?? "(전체)"} / dry-run=${dryRun}`,
  );

  if (dryRun) {
    for (const a of adongList) {
      console.log(`  → ${resolve(dir, `sbiz-${a}-${tag}.json`)}`);
    }
    return;
  }

  mkdirSync(dir, { recursive: true });

  for (const a of adongList) {
    const out = resolve(dir, `sbiz-${a}-${tag}.json`);
    if (existsSync(out)) {
      console.log(`  [캐시] ${a} (${tag})`);
      continue;
    }
    console.log(`  [다운] ${a} (${tag}) ...`);
    const stores = await fetchStoresInDong(a, indsScls ? { indsSclsCd: indsScls } : {});
    writeFileSync(out, JSON.stringify(stores, null, 2), "utf8");
    console.log(`        ${stores.length}건 저장`);
  }
  console.log(
    `  → 호출 횟수 ${sbizMetrics.callCount} (재시도 ${sbizMetrics.retries})`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
