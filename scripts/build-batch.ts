/**
 * 시군구 단위 batch 빌드 — 행정동 × 모든 업종 매트릭스.
 *
 * 실행:
 *   npx tsx scripts/build-batch.ts --signgu 강남구
 *   npx tsx scripts/build-batch.ts --signgu 강남구 --dry-run
 *
 * 효율 최적화 (단일 build-data 와 차이):
 *   - 행정동마다 업종 필터 없이 모든 상가 1번에 다운로드 (22 × 100 X)
 *   - reb pivot 한 번만 계산 (mergeArea 마다 X)
 *   - jumin / nts / reb raw 캐시 한 번만
 *
 * Week 2 Day 1 — 강남구 22 행정동 × 99 업종 (NTS_only 통신판매업 제외) = 2,178 빌드
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { loadRegions, type RegionRow } from "./lib/region";
import { loadTaxonomy } from "./lib/taxonomy";
import { fetchStoresInDong, sbizMetrics, type SbizStore } from "./lib/sbiz";
import { mergeArea } from "./transform/merge-area";
import { defaultPeriod, previousPeriods, pivotByZoneAndFloor, type RebRow } from "./lib/reb";
import { RAW, BUILD, monthId, slugify, buildPath } from "./lib/paths";

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (k: string) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : undefined;
  };
  return {
    signgu: get("--signgu"),
    dryRun: args.includes("--dry-run"),
  };
}

function runIngest(file: string, args: string[] = []) {
  console.log(`  $ npx tsx scripts/ingest/${file} ${args.join(" ")}`);
  const r = spawnSync("npx", ["tsx", `scripts/ingest/${file}`, ...args], {
    stdio: "inherit",
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(`ingest 실패: ${file}`);
}

async function main() {
  const t0 = Date.now();
  const { signgu, dryRun } = parseArgs();
  if (!signgu) throw new Error("--signgu <시군구이름> 필수");

  // 1) 행정동 로드 + 필터
  const allRegions = loadRegions();
  const regions = allRegions.filter((r) => r.시군구 === signgu);
  if (regions.length === 0) throw new Error(`region-codes.csv 에 ${signgu} 없음`);

  // 2) 업종 로드 (NTS_only 제외)
  const taxonomy = loadTaxonomy().filter(
    (t) => t.type !== "NTS_only" && t.sbiz_소분류.length > 0,
  );

  console.log(`\n[batch] ${signgu} — 행정동 ${regions.length}개 × 업종 ${taxonomy.length}개 = ${regions.length * taxonomy.length}건 빌드 예정`);

  // 3) 기준 시점
  const lastMonth = new Date();
  lastMonth.setMonth(lastMonth.getMonth() - 1);
  const monthPeriod = monthId(lastMonth.getFullYear(), lastMonth.getMonth() + 1);
  const quarterPeriod = defaultPeriod();

  if (dryRun) {
    console.log("\n[dry-run] 실제 빌드 안 함. 첫 5건 경로만:");
    for (let i = 0; i < Math.min(5, regions.length); i++) {
      const r = regions[i];
      for (let j = 0; j < Math.min(2, taxonomy.length); j++) {
        const u = taxonomy[j];
        console.log(`  → ${buildPath({ 시도: r.시도, 시군구: r.시군구, 행정동: r.행정동, 업종: slugify(u.nts) })}`);
      }
    }
    return;
  }

  // 4) 공유 raw 보장 (jumin / nts / reb)
  console.log("\n[1/4] 공유 raw 캐시 보장 (jumin / nts / reb)...");
  const juminH = resolve(RAW(monthPeriod), "jumin-household.csv");
  const juminA = resolve(RAW(monthPeriod), "jumin-age.csv");
  if (!existsSync(juminH) || !existsSync(juminA)) {
    runIngest("ingest-jumin.ts", [
      String(lastMonth.getFullYear()),
      String(lastMonth.getMonth() + 1),
    ]);
  } else console.log("  jumin: 캐시 ✓");

  const ntsCsvFile = resolve(RAW(monthPeriod), "nts-life100.csv");
  if (!existsSync(ntsCsvFile)) runIngest("ingest-nts.ts");
  else console.log("  nts: 캐시 ✓");

  // reb fallback 4단계
  let rebFile: string | null = null;
  let rebUsedPeriod = quarterPeriod;
  for (const p of previousPeriods(quarterPeriod, 4)) {
    const f = resolve(RAW(p), "reb-중대형.json");
    if (existsSync(f)) { rebFile = f; rebUsedPeriod = p; break; }
  }
  if (!rebFile) {
    runIngest("ingest-reb.ts", ["--period", quarterPeriod]);
    for (const p of previousPeriods(quarterPeriod, 4)) {
      const f = resolve(RAW(p), "reb-중대형.json");
      if (existsSync(f)) { rebFile = f; rebUsedPeriod = p; break; }
    }
  } else console.log(`  reb: 캐시 ✓ (사용 분기 ${rebUsedPeriod})`);
  if (!rebFile) throw new Error("REB 캐시 생성 실패");

  // 5) 행정동별 sbiz 모든 상가 (업종 필터 없이) — 가장 큰 시간
  console.log(`\n[2/4] 행정동 ${regions.length}개 sbiz 다운로드 (업종 필터 없이)...`);
  const sbizByAdong = new Map<string, SbizStore[]>(); // adong_sbiz_8 → stores
  for (const r of regions) {
    const f = resolve(RAW(monthPeriod), `sbiz-${r.adong_sbiz_8}-all.json`);
    let stores: SbizStore[];
    if (existsSync(f)) {
      stores = JSON.parse(readFileSync(f, "utf8"));
      console.log(`  [캐시] ${r.행정동} (${r.adong_sbiz_8}): ${stores.length}건`);
    } else {
      console.log(`  [다운] ${r.행정동} (${r.adong_sbiz_8}) ...`);
      stores = await fetchStoresInDong(r.adong_sbiz_8);
      writeFileSync(f, JSON.stringify(stores), "utf8");
      console.log(`        ${stores.length}건 저장`);
    }
    sbizByAdong.set(r.adong_sbiz_8, stores);
  }
  console.log(`  → SBIZ 호출 ${sbizMetrics.callCount}회 (재시도 ${sbizMetrics.retries})`);

  // 6) reb pivot 한 번만
  console.log("\n[3/4] reb pivot 계산 (한 번만)...");
  const rebRows = JSON.parse(readFileSync(rebFile, "utf8")) as RebRow[];
  const rebPivot = pivotByZoneAndFloor(rebRows);
  console.log(`  → ${rebPivot.length} (상권 × 층) 조합`);

  // 7) 시군구 안 모든 stores 합치기 (거리 필터용 — 행정동 1km 외 stores 도 포함될 수 있게)
  const allCitySbiz: SbizStore[] = [];
  for (const stores of sbizByAdong.values()) allCitySbiz.push(...stores);
  console.log(`  → 시군구 전체 stores: ${allCitySbiz.length.toLocaleString()}건`);

  // 8) raw 한 번만 읽기
  const juminHText = readFileSync(juminH, "utf8");
  const juminAText = readFileSync(juminA, "utf8");
  const ntsText = readFileSync(ntsCsvFile, "utf8");

  // 9) 각 (행정동, 업종) 매트릭스 빌드
  console.log(`\n[4/4] ${regions.length} × ${taxonomy.length} = ${regions.length * taxonomy.length}건 빌드...`);

  let success = 0;
  let skipped = 0;
  for (const r of regions) {
    // 행정동 중심 좌표 = 해당 동 stores 평균 (없으면 시군구 평균)
    const myStores = sbizByAdong.get(r.adong_sbiz_8) ?? [];
    let centerLng: number;
    let centerLat: number;
    if (myStores.length > 0) {
      centerLng = myStores.reduce((a, s) => a + s.lon, 0) / myStores.length;
      centerLat = myStores.reduce((a, s) => a + s.lat, 0) / myStores.length;
    } else {
      centerLng = allCitySbiz.reduce((a, s) => a + s.lon, 0) / allCitySbiz.length;
      centerLat = allCitySbiz.reduce((a, s) => a + s.lat, 0) / allCitySbiz.length;
    }

    for (const u of taxonomy) {
      try {
        const merged = mergeArea({
          region: r,
          upjong: u,
          centerLng,
          centerLat,
          juminHouseholdCsv: juminHText,
          juminAgeCsv: juminAText,
          ntsCsv: ntsText,
          sbizStores: allCitySbiz, // 시군구 전체 (거리 필터로 좁힘)
          rebPivot,
          juminBaseLabel: `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`,
          ntsBaseLabel: "2025-08",
          rebBaseLabel: `${rebUsedPeriod.slice(0, 4)}-Q${rebUsedPeriod.slice(-1)}`,
          sbizFetchedAt: new Date().toISOString(),
        });

        const out = buildPath({
          시도: r.시도,
          시군구: r.시군구,
          행정동: r.행정동,
          업종: slugify(u.nts),
        });
        // 커피음료점 alias = cafe
        const aliased = u.nts === "커피음료점"
          ? out.replace(/\/[^/]+\.json$/, "/cafe.json")
          : out;
        mkdirSync(dirname(aliased), { recursive: true });
        writeFileSync(aliased, JSON.stringify(merged, null, 2), "utf8");
        success++;
      } catch (e) {
        console.warn(`  [실패] ${r.행정동} × ${u.nts}: ${(e as Error).message}`);
        skipped++;
      }
    }
    process.stdout.write(`  ${r.행정동} ✓ (누적 ${success}/${regions.length * taxonomy.length})\n`);
  }

  const t = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n=== batch 완료 ===`);
  console.log(`  총 빌드: ${success.toLocaleString()}건 / 실패 ${skipped}`);
  console.log(`  SBIZ 호출 누적: ${sbizMetrics.callCount}회 (일 한도 10,000)`);
  console.log(`  소요 시간: ${t}초`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
