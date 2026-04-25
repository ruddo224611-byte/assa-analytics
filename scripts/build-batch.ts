/**
 * 시군구 단위 batch 빌드 (H 형식 — 시군구 1 파일 nested).
 *
 * 실행:
 *   npx tsx scripts/build-batch.ts --signgu 강남구
 *   npx tsx scripts/build-batch.ts --signgu 강남구,송파구,서초구
 *   npx tsx scripts/build-batch.ts --시도 서울특별시   # 시도 안 모든 시군구
 *   npx tsx scripts/build-batch.ts --signgu 강남구 --dry-run
 *
 * 출력: data/build/{시도}/{시군구}.json (시군구 1 파일에 모든 행정동 × 업종)
 *
 * 효율:
 *   - 행정동마다 sbiz 1회 (업종 필터 없이)
 *   - reb pivot 한 번만
 *   - 행정동 단위 공통 데이터 (수요/임대료/지원사업) 1번만 저장 (중복 제거)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { loadRegions, type RegionRow } from "./lib/region";
import { loadTaxonomy } from "./lib/taxonomy";
import { fetchStoresInDong, sbizMetrics, type SbizStore } from "./lib/sbiz";
import { defaultPeriod, previousPeriods, type RebRow } from "./lib/reb";
import { RAW, BUILD, monthId, slugify } from "./lib/paths";
import { buildSignguH } from "./transform/build-signgu-h";

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (k: string) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : undefined;
  };
  return {
    signguList: get("--signgu")?.split(",").map((s) => s.trim()),
    sido: get("--시도"),
    dryRun: args.includes("--dry-run"),
    cleanup: args.includes("--cleanup"), // 기존 행정동 폴더 삭제
  };
}

function runIngest(file: string, args: string[] = []) {
  console.log(`  $ npx tsx scripts/ingest/${file} ${args.join(" ")}`);
  const r = spawnSync("npx", ["tsx", `scripts/ingest/${file}`, ...args], {
    stdio: "inherit", encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(`ingest 실패: ${file}`);
}

async function buildOneSigngu(
  sido: string,
  signgu: string,
  allRegions: RegionRow[],
  context: {
    monthPeriod: string;
    juminH: string; juminA: string; ntsCsv: string;
    rebRows: RebRow[]; rebUsedPeriod: string;
    juminBaseLabel: string; ntsBaseLabel: string; rebBaseLabel: string;
    cleanup: boolean;
  },
) {
  // 시도 + 시군구 둘 다 매칭 (같은 시군구명이 여러 시도에 존재 가능 — 부산남구/대구남구 등)
  const regions = allRegions.filter((r) => r.시도 === sido && r.시군구 === signgu);
  if (regions.length === 0) {
    console.warn(`  [skip] ${sido} ${signgu}: region-codes 에 없음`);
    return null;
  }
  const taxonomy = loadTaxonomy().filter(
    (t) => t.type !== "NTS_only" && t.sbiz_소분류.length > 0,
  );

  const t0 = Date.now();
  console.log(`\n--- ${signgu} (행정동 ${regions.length} × 업종 ${taxonomy.length}) ---`);

  // 행정동별 sbiz
  const sbizByAdong = new Map<string, SbizStore[]>();
  for (const r of regions) {
    const f = resolve(RAW(context.monthPeriod), `sbiz-${r.adong_sbiz_8}-all.json`);
    let stores: SbizStore[];
    if (existsSync(f)) {
      stores = JSON.parse(readFileSync(f, "utf8"));
    } else {
      stores = await fetchStoresInDong(r.adong_sbiz_8);
      writeFileSync(f, JSON.stringify(stores), "utf8");
    }
    sbizByAdong.set(r.adong_sbiz_8, stores);
  }
  const allCitySbiz: SbizStore[] = [];
  for (const ss of sbizByAdong.values()) allCitySbiz.push(...ss);

  // 빌드
  const report = buildSignguH({
    시도: regions[0].시도,
    시군구: signgu,
    regions,
    taxonomy,
    juminHouseholdCsv: context.juminH,
    juminAgeCsv: context.juminA,
    ntsCsv: context.ntsCsv,
    sbizByAdong,
    allCitySbiz,
    rebRows: context.rebRows,
    juminBaseLabel: context.juminBaseLabel,
    ntsBaseLabel: context.ntsBaseLabel,
    rebBaseLabel: context.rebBaseLabel,
    sbizFetchedAt: new Date().toISOString(),
  });

  // 출력
  const outDir = resolve(BUILD, slugify(regions[0].시도));
  mkdirSync(outDir, { recursive: true });
  const out = resolve(outDir, `${slugify(signgu)}.json`);
  writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
  const size = (writeFileSync as unknown, // typescript trick to avoid unused
    Buffer.byteLength(JSON.stringify(report, null, 2)) / 1024).toFixed(1);

  // cleanup: 기존 행정동 폴더 삭제 (PR #13 잔재)
  if (context.cleanup) {
    const oldDir = resolve(outDir, slugify(signgu));
    if (existsSync(oldDir)) {
      rmSync(oldDir, { recursive: true, force: true });
      console.log(`  [cleanup] 기존 ${signgu}/ 폴더 삭제`);
    }
  }

  const t = ((Date.now() - t0) / 1000).toFixed(1);
  const adongCount = regions.length;
  const upjongCount = taxonomy.length;
  console.log(`  ✓ ${signgu}: ${adongCount}동 × ${upjongCount}업종 = ${adongCount * upjongCount} 셀 → ${out.split("/").slice(-2).join("/")} (${size}KB, ${t}초)`);
  return out;
}

async function main() {
  const T0 = Date.now();
  const { signguList, sido, dryRun, cleanup } = parseArgs();

  const allRegions = loadRegions();
  // (시도, 시군구) 튜플 list
  let targets: { sido: string; signgu: string }[];
  if (sido) {
    const ss = [...new Set(allRegions.filter((r) => r.시도 === sido).map((r) => r.시군구))];
    targets = ss.map((sg) => ({ sido, signgu: sg }));
  } else if (signguList) {
    // --signgu 는 시도 정보 없으니, 매칭되는 모든 시도/시군구 조합 다 포함
    targets = [];
    for (const sg of signguList) {
      const matches = allRegions
        .filter((r) => r.시군구 === sg)
        .map((r) => ({ sido: r.시도, signgu: sg }));
      const uniq = Array.from(new Set(matches.map((m) => `${m.sido}|${m.signgu}`)))
        .map((k) => { const [s, g] = k.split("|"); return { sido: s, signgu: g }; });
      targets.push(...uniq);
    }
  } else throw new Error("--signgu 또는 --시도 필수");

  console.log(`[batch H] 대상 (시도,시군구): ${targets.length}개`);
  console.log(`  ${targets.map((t) => `${t.sido.replace(/(특별시|광역시|특별자치시|특별자치도|도)$/, '').trim() || t.sido}/${t.signgu}`).join(", ")}`);
  console.log(`  cleanup=${cleanup} dry-run=${dryRun}`);

  if (dryRun) return;

  const lastMonth = new Date();
  lastMonth.setMonth(lastMonth.getMonth() - 1);
  const monthPeriod = monthId(lastMonth.getFullYear(), lastMonth.getMonth() + 1);
  const quarterPeriod = defaultPeriod();

  // 공유 raw 보장
  const juminH = resolve(RAW(monthPeriod), "jumin-household.csv");
  const juminA = resolve(RAW(monthPeriod), "jumin-age.csv");
  if (!existsSync(juminH) || !existsSync(juminA)) {
    runIngest("ingest-jumin.ts", [String(lastMonth.getFullYear()), String(lastMonth.getMonth() + 1)]);
  }
  const ntsCsv = resolve(RAW(monthPeriod), "nts-life100.csv");
  if (!existsSync(ntsCsv)) runIngest("ingest-nts.ts");

  let rebFile: string | null = null; let rebUsedPeriod = quarterPeriod;
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
  }
  if (!rebFile) throw new Error("REB 캐시 생성 실패");

  const ctx = {
    monthPeriod,
    juminH: readFileSync(juminH, "utf8"),
    juminA: readFileSync(juminA, "utf8"),
    ntsCsv: readFileSync(ntsCsv, "utf8"),
    rebRows: JSON.parse(readFileSync(rebFile, "utf8")) as RebRow[],
    rebUsedPeriod,
    juminBaseLabel: `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`,
    ntsBaseLabel: "2025-08",
    rebBaseLabel: `${rebUsedPeriod.slice(0, 4)}-Q${rebUsedPeriod.slice(-1)}`,
    cleanup: cleanup ?? false,
  };

  let okCount = 0;
  for (const t of targets) {
    const out = await buildOneSigngu(t.sido, t.signgu, allRegions, ctx);
    if (out) okCount++;
  }

  const T = ((Date.now() - T0) / 1000).toFixed(1);
  console.log(`\n=== batch H 완료 ===`);
  console.log(`  성공 ${okCount}/${targets.length} 시군구`);
  console.log(`  SBIZ 호출 누적: ${sbizMetrics.callCount}회 (재시도 ${sbizMetrics.retries})`);
  console.log(`  소요 시간: ${T}초`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
