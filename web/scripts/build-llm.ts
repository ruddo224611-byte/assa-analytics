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
import { calculateScore, type ScoreInput } from "../src/lib/score";
import { generateReport, type LLMOutput } from "../src/lib/llm-client";

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

    for (const u of upjongs) {
      const uData = aData.업종별[u];
      if (!uData) continue;

      // 캐시 확인
      if (cache.행정동[a].업종별[u] && !skipCache) {
        cachedSkips++;
        continue;
      }

      // 점수 계산
      const score = calculateScore({
        수요: aData.수요,
        경쟁: uData.경쟁,
        임대료: aData.임대료,
      });

      if (dryRun) {
        console.log(`    [dry-run] ${u}: 종합 ${score.종합} (${score.톤})`);
        continue;
      }

      // LLM 호출
      try {
        const llm = await generateReport({
          시도: sido,
          시군구: signgu,
          행정동: a,
          업종: u,
          점수: { ...score },
          수요요약: score.설명.수요,
          경쟁요약: score.설명.경쟁,
          임대료요약: score.설명.임대료,
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
        // 추정 비용: input ~150t, output ~120t 평균
        cache.meta.호출수++;
        cache.meta.추정비용USD += 150e-6 * 1 + 120e-6 * 5; // = $0.00075
        console.log(`    ✓ ${u}: ${llm.summary.slice(0, 50)}...`);
      } catch (e) {
        console.error(`    ✗ ${u}: ${String(e).slice(0, 200)}`);
      }

      // rate limit 보호: 호출 사이 약간 휴식 (Haiku 는 분당 한도 높지만 안전하게)
      await new Promise((r) => setTimeout(r, 100));
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
