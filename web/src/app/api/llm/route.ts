/**
 * On-demand LLM API route — Phase 3 Day 4 PR3.
 *
 * 동작:
 *   1. (시도, 시군구, 행정동, 업종) 받아서 LLM 결과 반환
 *   2. 캐시 우선순위: Redis → file (-llm.json) → LLM 호출
 *   3. LLM 호출 결과는 Redis 에 저장 (TTL 30일)
 *
 * Day 4 PR3 변경: @vercel/kv → 표준 redis 패키지
 *   (Vercel KV 폐기됨 → Marketplace Redis 인스턴스의 REDIS_URL 사용)
 *
 * 운영자 액션 (Redis 안 셋업하면 매번 LLM 호출 → 비용 ↑):
 *   1. Vercel Marketplace → Redis Integration 설치
 *   2. assa-analytics 프로젝트 연결 (Custom Prefix: REDIS)
 *   3. 환경변수 REDIS_URL 자동 등록
 *   4. ANTHROPIC_API_KEY 도 Vercel 환경변수 등록 (Sensitive 켜기)
 *
 * URL: /api/llm?sido=서울특별시&signgu=강남구&adong=역삼1동&upjong=커피음료점
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient, type RedisClientType } from "redis";
import { calculateScore, buildSignguContext, type ScoreInput } from "@/lib/score";
import { generateReport, type CompareContext, type LLMOutput } from "@/lib/llm-client";

// runtime: nodejs (Anthropic SDK + redis 가 edge runtime 미지원)
export const runtime = "nodejs";
export const maxDuration = 30; // Vercel Pro 함수 최대 30초 (LLM 4-10초 + 여유)

interface ResponseBody {
  score: { 수요: number; 경쟁: number; 임대료: number; 종합: number; 톤: string };
  llm: { alias: string; summary: string };
  source: "redis" | "file" | "llm"; // 캐시 출처 (디버그)
}

// Redis client singleton (모듈 레벨 — Vercel function warm 동안 재사용)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let redisClient: RedisClientType<any, any, any> | null = null;
async function getRedis() {
  if (!process.env.REDIS_URL) return null;
  if (redisClient?.isReady) return redisClient;
  try {
    redisClient = createClient({ url: process.env.REDIS_URL });
    redisClient.on("error", (e) => console.error("[redis] error:", e));
    await redisClient.connect();
    return redisClient;
  } catch (e) {
    console.error("[redis] connect 실패:", e);
    redisClient = null;
    return null;
  }
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const 시도 = sp.get("sido");
  const 시군구 = sp.get("signgu");
  const 행정동 = sp.get("adong");
  const 업종 = sp.get("upjong");

  if (!시도 || !시군구 || !행정동 || !업종) {
    return NextResponse.json({ error: "sido/signgu/adong/upjong 필수" }, { status: 400 });
  }

  const cacheKey = `llm:${시도}:${시군구}:${행정동}:${업종}`;

  // 1. Redis 캐시 확인 (REDIS_URL 환경변수 있으면)
  const redis = await getRedis();
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as ResponseBody;
        return NextResponse.json({ ...parsed, source: "redis" });
      }
    } catch (e) {
      console.error("[redis] get 실패:", e);
    }
  }

  // 2. 시군구 데이터 fetch (file)
  const h = headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const signguUrl = `${proto}://${host}/data/${encodeURIComponent(시도)}/${encodeURIComponent(시군구)}.json`;
  let signguData;
  try {
    const r = await fetch(signguUrl, { next: { revalidate: 3600 } });
    if (!r.ok) {
      return NextResponse.json({ error: "시군구 데이터 없음" }, { status: 404 });
    }
    signguData = await r.json();
  } catch {
    return NextResponse.json({ error: "시군구 데이터 로드 실패" }, { status: 500 });
  }

  const adong = signguData.행정동?.[행정동];
  if (!adong) {
    return NextResponse.json({ error: "행정동 없음" }, { status: 404 });
  }
  const u = adong.업종별?.[업종];
  if (!u) {
    return NextResponse.json({ error: "업종 없음" }, { status: 404 });
  }

  // 3. file cache (-llm.json) 확인 — 강남구처럼 일괄 빌드된 곳
  const llmFileUrl = `${proto}://${host}/data/${encodeURIComponent(시도)}/${encodeURIComponent(시군구)}-llm.json`;
  try {
    const r = await fetch(llmFileUrl, { next: { revalidate: 3600 } });
    if (r.ok) {
      const llmFile = await r.json();
      const fileEntry = llmFile.행정동?.[행정동]?.업종별?.[업종];
      if (fileEntry) {
        const result: ResponseBody = {
          score: fileEntry.score,
          llm: { alias: fileEntry.llm.alias, summary: fileEntry.llm.summary },
          source: "file",
        };
        // Redis 에도 저장 (다음부터 더 빠르게)
        if (redis) {
          try {
            await redis.set(cacheKey, JSON.stringify(result), {
              EX: 60 * 60 * 24 * 30, // 30일
            });
          } catch (e) {
            console.error("[redis] set 실패:", e);
          }
        }
        return NextResponse.json(result);
      }
    }
  } catch {
    // file fetch 실패해도 LLM 호출로
  }

  // 4. LLM 호출
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY 환경변수 미설정 — Vercel Settings 에서 등록" },
      { status: 503 },
    );
  }

  const ctx = buildSignguContext(signguData);
  const score = calculateScore(
    {
      수요: adong.수요,
      경쟁: u.경쟁,
      임대료: adong.임대료,
    } as ScoreInput,
    ctx,
    업종,
  );

  // 비교 컨텍스트 (build-llm.ts 와 동일 로직)
  const popSum = ctx.populations.reduce((a, b) => a + b, 0);
  const signguAvgPop = ctx.populations.length
    ? Math.round(popSum / ctx.populations.length)
    : null;
  const ageSum = ctx.age3040Pcts.reduce((a, b) => a + b, 0);
  const signguAvgAge3040 = ctx.age3040Pcts.length
    ? ageSum / ctx.age3040Pcts.length
    : null;
  const a30 = adong.수요?.연령대_10?.["30~39세"] ?? 0;
  const a40 = adong.수요?.연령대_10?.["40~49세"] ?? 0;
  const thisAge3040 = adong.수요?.인구
    ? ((a30 + a40) / adong.수요.인구) * 100
    : null;

  // 행정동 안 업종 순위 + 시군구 안 행정동 순위 — 모든 score 미리 계산
  const allScores: { adong: string; upjong: string; 종합: number }[] = [];
  for (const [aName, aData] of Object.entries(signguData.행정동) as [string, { 수요: ScoreInput["수요"]; 임대료: ScoreInput["임대료"]; 업종별: Record<string, { 경쟁: ScoreInput["경쟁"] }> }][]) {
    for (const [uName, uData] of Object.entries(aData.업종별)) {
      const s = calculateScore(
        { 수요: aData.수요, 경쟁: uData.경쟁, 임대료: aData.임대료 },
        ctx,
        uName,
      );
      allScores.push({ adong: aName, upjong: uName, 종합: s.종합 });
    }
  }
  const inAdong = allScores
    .filter((s) => s.adong === 행정동)
    .sort((a, b) => b.종합 - a.종합);
  const upjongRank = inAdong.findIndex((s) => s.upjong === 업종) + 1 || null;
  const upjongTotal = inAdong.length || null;
  const inSignguSameUpjong = allScores
    .filter((s) => s.upjong === 업종)
    .sort((a, b) => b.종합 - a.종합);
  const adongRank = inSignguSameUpjong.findIndex((s) => s.adong === 행정동) + 1 || null;
  const adongTotal = inSignguSameUpjong.length || null;

  const compareCtx: CompareContext = {
    signgu_avg_pop: signguAvgPop,
    signgu_avg_age3040_pct: signguAvgAge3040,
    this_age3040_pct: thisAge3040,
    upjong_rank_in_adong: upjongRank,
    upjong_total_in_adong: upjongTotal,
    adong_rank_in_signgu: adongRank,
    adong_total_in_signgu: adongTotal,
  };

  let llm: LLMOutput;
  try {
    llm = await generateReport({
      시도,
      시군구,
      행정동,
      업종,
      점수: { ...score },
      수요요약: score.설명.수요,
      경쟁요약: score.설명.경쟁,
      임대료요약: score.설명.임대료,
      비교: compareCtx,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `LLM 호출 실패: ${String(e)}` },
      { status: 502 },
    );
  }

  const result: ResponseBody = {
    score: {
      수요: score.수요,
      경쟁: score.경쟁,
      임대료: score.임대료,
      종합: score.종합,
      톤: score.톤,
    },
    llm,
    source: "llm",
  };

  // Redis 에 저장 (다음 호출부터 cache hit)
  if (redis) {
    try {
      await redis.set(cacheKey, JSON.stringify(result), {
        EX: 60 * 60 * 24 * 30, // 30일
      });
    } catch (e) {
      console.error("[redis] set 실패:", e);
    }
  }

  return NextResponse.json(result);
}
