/**
 * Phase 3 Day 1 — LLM 캐시 빌드 CLI.
 *
 * 실행:
 *   cd web
 *   npx tsx scripts/build-llm.ts --시도 서울특별시 --signgu 강남구
 *   npx tsx scripts/build-llm.ts --시도 서울특별시 --signgu 강남구 --adong 역삼1동 --upjong 커피음료점  # 1개만 시범
 *   npx tsx scripts/build-llm.ts --시도 서울특별시 --signgu 강남구 --limit 5  # 처음 5 행정동만
 *
 * 입력: ../data/build/{시도}/{시군구}.json
 * 출력: ../data/build/{시도}/{시군구}-llm.json
 *
 * 환경: ANTHROPIC_API_KEY (web/.env.local 자동 로드)
 *
 * 비용 추적:
 *   - 호출 수, 입출력 토큰, 추정 비용 표시
 *   - --dry-run 모드 (호출 없이 prompt 만 출력)
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// .env.local 직접 parse — dotenv 가 일부 변수 (sk-ant-* 같은 hyphen 시작 값) 못 잡는 이슈 우회
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "..", ".env.local");
if (existsSync(envPath)) {
  const txt = readFileSync(envPath, "utf8");
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

// 일반 import — env 가 readFile 로 직접 채워졌으므로 동기 import 도 안전
import { calculateScore, buildSignguContext, type ScoreInput, type SignguContext } from "../src/lib/score";
import { generateReport, type LLMOutput, type CompareContext } from "../src/lib/llm-client";

const DATA_BUILD = resolve(__dirname, "..", "..", "data", "build");

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (k: string) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : undefined;
  };
  return {
    sido: get("--시도"),
    signgu: get("--signgu"),
    adong: get("--adong"), // 단일 행정동만 (옵션)
    upjong: get("--upjong"), // 단일 업종만 (옵션)
    limit: get("--limit") ? Number(get("--limit")) : undefined,
    dryRun: args.includes("--dry-run"),
    skipCache: args.includes("--skip-cache"), // 기존 캐시 무시 + 재생성
  };
}

interface SignguData {
  meta: {
    시도: string;
    시군구: string;
    기준일: { 인구: string; 업종: string; 임대료: string; 상가: string };
  };
  행정동: Record<
    string,
    {
      수요: ScoreInput["수요"];
      경쟁?: ScoreInput["경쟁"]; // 행정동 단위에는 없음
      임대료: ScoreInput["임대료"];
      업종별: Record<
        string,
        {
          sbiz_codes: string[];
          sbiz_names: string[];
          매핑유형: string;
          경쟁: ScoreInput["경쟁"];
        }
      >;
    }
  >;
}

interface LLMCacheFile {
  meta: {
    시도: string;
    시군구: string;
    캐시업데이트: string;
    호출수: number;
    추정비용USD: number;
    model: string;
  };
  행정동: Record<
    string,
    {
      업종별: Record<
        string,
        {
          score: { 수요: number; 경쟁: number; 임대료: number; 종합: number; 톤: string };
          llm: LLMOutput;
        }
      >;
    }
  >;
}

async function main() {
  const T0 = Date.now();
  const { sido, signgu, adong, upjong, limit, dryRun, skipCache } = parseArgs();
  if (!sido || !signgu) throw new Error("--시도 + --signgu 필수");

  const inFile = resolve(DATA_BUILD, sido, `${signgu}.json`);
  if (!existsSync(inFile)) throw new Error(`입력 파일 없음: ${inFile}`);
  const data: SignguData = JSON.parse(readFileSync(inFile, "utf8"));

  const outFile = resolve(DATA_BUILD, sido, `${signgu}-llm.json`);
  // 기존 캐시 로드 (skip-cache 아니면 이어쓰기)
  let cache: LLMCacheFile;
  if (existsSync(outFile) && !skipCache) {
    cache = JSON.parse(readFileSync(outFile, "utf8"));
  } else {
    cache = {
      meta: {
        시도: sido,
        시군구: signgu,
        캐시업데이트: new Date().toISOString(),
        호출수: 0,
        추정비용USD: 0,
        model: "claude-haiku-4-5",
      },
      행정동: {},
    };
  }

  // 대상 행정동·업종 결정
  const adongs = adong ? [adong] : Object.keys(data.행정동).slice(0, limit);
  console.log(`[build-llm] ${sido} ${signgu}: 행정동 ${adongs.length}개 처리 (dry-run=${dryRun}, skip-cache=${skipCache})`);

  // ============ 비교 컨텍스트 사전 계산 (Day 2 강화) ============
  // 시군구 평균 인구 + 30~40대 비율
  const allAdongs = Object.values(data.행정동);
  let popSum = 0, popCount = 0;
  let age3040Sum = 0, age3040PopSum = 0;
  for (const a of allAdongs) {
    if (a.수요?.인구) {
      popSum += a.수요.인구;
      popCount++;
      const a30 = a.수요.연령대_10?.["30~39세"] ?? 0;
      const a40 = a.수요.연령대_10?.["40~49세"] ?? 0;
      age3040Sum += a30 + a40;
      age3040PopSum += a.수요.인구;
    }
  }
  const signguAvgPop = popCount > 0 ? Math.round(popSum / popCount) : null;
  const signguAvgAge3040 = age3040PopSum > 0 ? (age3040Sum / age3040PopSum) * 100 : null;

  // Day 3: 시군구 컨텍스트 (분위 점수 계산용)
  const signguCtx: SignguContext = buildSignguContext(data);

  // 행정동별 모든 업종 score 미리 계산 (순위 산정용 — Day 3 ctx 적용)
  const scoresByAdong: Record<string, Map<string, number>> = {}; // adong → upjong → 종합
  const scoresByUpjong: Record<string, Map<string, number>> = {}; // upjong → adong → 종합
  for (const [aName, aData] of Object.entries(data.행정동)) {
    if (!scoresByAdong[aName]) scoresByAdong[aName] = new Map();
    for (const [uName, uData] of Object.entries(aData.업종별)) {
      const s = calculateScore(
        { 수요: aData.수요, 경쟁: uData.경쟁, 임대료: aData.임대료 },
        signguCtx,
        uName,
      );
      scoresByAdong[aName].set(uName, s.종합);
      if (!scoresByUpjong[uName]) scoresByUpjong[uName] = new Map();
      scoresByUpjong[uName].set(aName, s.종합);
    }
  }

  function buildCompareContext(adongName: string, upjongName: string, aData: SignguData["행정동"][string]): CompareContext {
    const a30 = aData.수요?.연령대_10?.["30~39세"] ?? 0;
    const a40 = aData.수요?.연령대_10?.["40~49세"] ?? 0;
    const thisAge3040 = aData.수요?.인구 ? ((a30 + a40) / aData.수요.인구) * 100 : null;

    // 이 행정동 안에서 이 업종 순위
    const aMap = scoresByAdong[adongName];
    let upjongRank = null;
    if (aMap) {
      const sorted = Array.from(aMap.entries()).sort((a, b) => b[1] - a[1]);
      const idx = sorted.findIndex(([k]) => k === upjongName);
      if (idx >= 0) upjongRank = idx + 1;
    }

    // 시군구 안 같은 업종 행정동 순위
    const uMap = scoresByUpjong[upjongName];
    let adongRank = null;
    if (uMap) {
      const sorted = Array.from(uMap.entries()).sort((a, b) => b[1] - a[1]);
      const idx = sorted.findIndex(([k]) => k === adongName);
      if (idx >= 0) adongRank = idx + 1;
    }

    return {
      signgu_avg_pop: signguAvgPop,
      signgu_avg_age3040_pct: signguAvgAge3040,
      this_age3040_pct: thisAge3040,
      upjong_rank_in_adong: upjongRank,
      upjong_total_in_adong: aMap?.size ?? null,
      adong_rank_in_signgu: adongRank,
      adong_total_in_signgu: uMap?.size ?? null,
    };
  }

  let newCalls = 0;
  let cachedSkips = 0;
  for (const a of adongs) {
    const aData = data.행정동[a];
    if (!aData) {
      console.warn(`  [skip] ${a}: 데이터 없음`);
      continue;
    }
    if (!cache.행정동[a]) cache.행정동[a] = { 업종별: {} };

    const upjongs = upjong ? [upjong] : Object.keys(aData.업종별);
    console.log(`  [${a}] 업종 ${upjongs.length}개`);

    // 호출할 업종만 필터 (캐시 있으면 skip)
    const todos: string[] = [];
    for (const u of upjongs) {
      if (!aData.업종별[u]) continue;
      if (cache.행정동[a].업종별[u] && !skipCache) {
        cachedSkips++;
        continue;
      }
      todos.push(u);
    }

    if (dryRun) {
      for (const u of todos) {
        const uData = aData.업종별[u];
        const score = calculateScore(
          { 수요: aData.수요, 경쟁: uData.경쟁, 임대료: aData.임대료 },
          signguCtx,
          u,
        );
        console.log(`    [dry-run] ${u}: 종합 ${score.종합} (${score.톤})`);
      }
      continue;
    }

    // Day 2: 5개 동시 병렬 호출 (Anthropic Haiku 분당 한도 안에서, 5배 빠름)
    const PARALLEL = 5;
    for (let i = 0; i < todos.length; i += PARALLEL) {
      const batch = todos.slice(i, i + PARALLEL);
      await Promise.all(
        batch.map(async (u) => {
          const uData = aData.업종별[u];
          const score = calculateScore(
            { 수요: aData.수요, 경쟁: uData.경쟁, 임대료: aData.임대료 },
            signguCtx,
            u,
          );
          try {
            const compareCtx = buildCompareContext(a, u, aData);
            const llm = await generateReport({
              시도: sido,
              시군구: signgu,
              행정동: a,
              업종: u,
              점수: { ...score },
              수요요약: score.설명.수요,
              경쟁요약: score.설명.경쟁,
              임대료요약: score.설명.임대료,
              비교: compareCtx,
            });
            cache.행정동[a].업종별[u] = {
              score: {
                수요: score.수요,
                경쟁: score.경쟁,
                임대료: score.임대료,
                종합: score.종합,
                톤: score.톤,
              },
              llm,
            };
            newCalls++;
            cache.meta.호출수++;
            cache.meta.추정비용USD += 150e-6 * 1 + 120e-6 * 5;
            console.log(`    ✓ ${u}: ${llm.summary.slice(0, 50)}...`);
          } catch (e) {
            console.error(`    ✗ ${u}: ${String(e).slice(0, 200)}`);
          }
        }),
      );
    }

    // 행정동 끝날 때마다 중간 저장 (비용 보호)
    if (!dryRun) {
      cache.meta.캐시업데이트 = new Date().toISOString();
      writeFileSync(outFile, JSON.stringify(cache, null, 2), "utf8");
    }
  }

  const T = ((Date.now() - T0) / 1000).toFixed(1);
  console.log(`\n=== build-llm 완료 ===`);
  console.log(`  새 호출: ${newCalls}, 캐시 skip: ${cachedSkips}`);
  console.log(`  누적 호출: ${cache.meta.호출수}, 누적 비용 추정: $${cache.meta.추정비용USD.toFixed(3)}`);
  console.log(`  소요 ${T}초 → ${dryRun ? "(dry-run)" : outFile}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
