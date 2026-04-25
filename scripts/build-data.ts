/**
 * Phase 1 ETL 진입점 — (지역, 업종) 단일 셀 빌드.
 *
 * 실행:
 *   npx tsx scripts/build-data.ts --adong 1168064000 --upjong 커피음료점
 *   npx tsx scripts/build-data.ts --adong 1168064000 --upjong 커피음료점 --dry-run
 *
 * 동작:
 *   1) 필요한 raw 캐시 보장 (없으면 ingest 호출)
 *   2) merge-area 로 단일 산출물 객체 생성
 *   3) data/build/{시도slug}/{시군구slug}/{행정동slug}/{업종slug}.json 저장
 *
 * Week 1 종료 기준: 역삼1동 × 커피음료점 1건 산출.
 *   `npx tsx scripts/build-data.ts --adong 1168064000 --upjong 커피음료점` 한 번으로 e2e 통과.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { loadRegions, findByAdongJumin, toAdongSbiz } from "./lib/region";
import { loadTaxonomy, findByNts } from "./lib/taxonomy";
import { mergeArea } from "./transform/merge-area";
import { defaultPeriod, previousPeriods, STATBL } from "./lib/reb";
import { RAW, BUILD, monthId, slugify, buildPath } from "./lib/paths";

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (k: string) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : undefined;
  };
  return {
    adong: get("--adong"),
    upjong: get("--upjong"),
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
  const { adong, upjong, dryRun } = parseArgs();
  if (!adong || !upjong) {
    throw new Error("--adong <jumin10> --upjong <NTS이름> 필수");
  }

  // 1) 지역 / 업종 lookup
  const regions = loadRegions();
  const region = findByAdongJumin(regions, adong);
  if (!region) throw new Error(`region 매칭 없음: ${adong}`);

  const taxonomy = loadTaxonomy();
  const upjongEntry = findByNts(taxonomy, upjong);
  if (!upjongEntry) throw new Error(`업종 매칭 없음: ${upjong}`);

  console.log(
    `\n[build-data] ${region.시도} ${region.시군구} ${region.행정동} × ${upjong}`,
  );
  console.log(`             SBIZ 매핑: ${upjongEntry.sbiz_소분류.map((s) => s.code + "(" + s.name + ")").join(", ")}`);

  // 2) 기준 시점 결정
  const now = new Date();
  const lastMonth = new Date(now);
  lastMonth.setMonth(lastMonth.getMonth() - 1);
  const monthPeriod = monthId(lastMonth.getFullYear(), lastMonth.getMonth() + 1);
  const quarterPeriod = defaultPeriod();

  const outPath = buildPath({
    시도: region.시도,
    시군구: region.시군구,
    행정동: region.행정동,
    업종: slugify(upjong),
  });
  // 'cafe' alias 처리: 업종 slug 가 한글이면 그대로, 영어 alias 원하면 별도 매핑 가능
  const aliasOut = upjong === "커피음료점" ? outPath.replace(/\/[^/]+\.json$/, "/cafe.json") : outPath;
  console.log(`             출력: ${aliasOut}`);

  if (dryRun) {
    console.log("\n[dry-run] 실제 빌드 안 함. 위 매핑·경로만 검증.");
    return;
  }

  // 3) raw 캐시 보장
  console.log("\n[1/4] raw 캐시 보장...");
  const adong8 = toAdongSbiz(adong);
  const adongDir = RAW(monthPeriod);

  // jumin (월)
  const juminH = resolve(adongDir, "jumin-household.csv");
  const juminA = resolve(adongDir, "jumin-age.csv");
  if (!existsSync(juminH) || !existsSync(juminA)) {
    runIngest("ingest-jumin.ts", [
      String(lastMonth.getFullYear()),
      String(lastMonth.getMonth() + 1),
    ]);
  } else console.log("  jumin: 캐시 ✓");

  // nts (월)
  const ntsCsv = resolve(adongDir, "nts-life100.csv");
  if (!existsSync(ntsCsv)) {
    runIngest("ingest-nts.ts");
  } else console.log("  nts: 캐시 ✓");

  // sbiz (월)
  const sbizCode = upjongEntry.sbiz_소분류[0]?.code;
  if (!sbizCode) throw new Error("upjong → sbiz code 매핑 없음 (NTS_only?)");
  const adong8List = [adong8];
  // 인접 동 추가: 역삼1동(11680640) 이면 역삼2동(11680650) 도 포함하도록 시군구 내 인접 추정
  // (단순 휴리스틱 — Week 2 에서 실제 인접 매핑 테이블로 교체)
  const neighbor =
    region.행정동 === "역삼1동" ? "11680650" :
    region.행정동 === "역삼2동" ? "11680640" : null;
  if (neighbor) adong8List.push(neighbor);

  const sbizFiles: string[] = [];
  for (const a of adong8List) {
    const f = resolve(adongDir, `sbiz-${a}-${sbizCode}.json`);
    if (!existsSync(f)) {
      runIngest("ingest-sbiz.ts", ["--adong", a, "--indsScls", sbizCode]);
    } else console.log(`  sbiz ${a}: 캐시 ✓`);
    sbizFiles.push(f);
  }

  // reb (분기) — fallback 4단계 캐시 탐색
  let rebFile: string | null = null;
  let rebUsedPeriod: string = quarterPeriod;
  for (const p of previousPeriods(quarterPeriod, 4)) {
    const f = resolve(RAW(p), `reb-중대형.json`);
    if (existsSync(f)) {
      rebFile = f;
      rebUsedPeriod = p;
      break;
    }
  }
  if (!rebFile) {
    runIngest("ingest-reb.ts", ["--period", quarterPeriod]);
    // ingest-reb 가 사용한 분기를 다시 탐색
    for (const p of previousPeriods(quarterPeriod, 4)) {
      const f = resolve(RAW(p), `reb-중대형.json`);
      if (existsSync(f)) {
        rebFile = f;
        rebUsedPeriod = p;
        break;
      }
    }
    if (!rebFile) throw new Error("REB 캐시 생성 실패");
  } else console.log(`  reb: 캐시 ✓ (사용 분기 ${rebUsedPeriod})`);

  // 4) 중심 좌표 결정 (역삼동의 경우 역삼역 사용. 다른 동은 행정동 첫 row 의 좌표 평균 사용 — Week 2 에서 정식 centroid)
  console.log("\n[2/4] 중심 좌표 결정...");
  let centerLng = 127.03638;
  let centerLat = 37.50064;
  if (!["역삼1동", "역삼2동"].includes(region.행정동)) {
    // 동 평균 좌표 fallback
    const stores = JSON.parse(readFileSync(sbizFiles[0], "utf8")) as { lon: number; lat: number }[];
    if (stores.length) {
      centerLng = stores.reduce((a, s) => a + s.lon, 0) / stores.length;
      centerLat = stores.reduce((a, s) => a + s.lat, 0) / stores.length;
    }
  }
  console.log(`  → ${centerLng.toFixed(5)}, ${centerLat.toFixed(5)}`);

  // 5) merge
  console.log("\n[3/4] merge-area 실행...");
  const merged = mergeArea({
    region,
    upjong: upjongEntry,
    centerLng,
    centerLat,
    juminHouseholdCsv: readFileSync(juminH, "utf8"),
    juminAgeCsv: readFileSync(juminA, "utf8"),
    ntsCsv: readFileSync(ntsCsv, "utf8"),
    sbizStoresFiles: sbizFiles,
    rebRowsFile: rebFile,
    juminBaseLabel: `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`,
    ntsBaseLabel: "2025-08",
    rebBaseLabel: `${rebUsedPeriod.slice(0, 4)}-Q${rebUsedPeriod.slice(-1)}`,
    sbizFetchedAt: new Date().toISOString(),
  });

  // 6) 출력
  console.log("\n[4/4] 산출물 저장...");
  mkdirSync(dirname(aliasOut), { recursive: true });
  writeFileSync(aliasOut, JSON.stringify(merged, null, 2), "utf8");
  console.log(`  → ${aliasOut}`);

  console.log("\n=== 핵심 필드 미리보기 ===");
  console.log(`  인구              : ${merged.수요.인구?.toLocaleString() ?? "—"}`);
  console.log(`  세대              : ${merged.수요.세대?.toLocaleString() ?? "—"}  (세대당 ${merged.수요.세대당인구})`);
  console.log(`  반경 500m 동일업종 : ${merged.경쟁.반경500m_동일업종}`);
  console.log(`  반경 1km 동일업종  : ${merged.경쟁.반경1km_동일업종}`);
  console.log(`  ${region.시군구} 전체  : ${merged.경쟁.시군구내_업소수} (YoY ${merged.경쟁.시군구_YoY_pct}%)`);
  if (merged.임대료.상권) {
    console.log(`  임대료 상권        : ${merged.임대료.상권} (신뢰도 ${merged.임대료.매핑신뢰도})`);
    const f1 = merged.임대료.층별["1층"];
    if (f1) console.log(`  1층 임대료         : ${f1.임대료_천원_m2?.toFixed(1)} 천원/㎡`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
