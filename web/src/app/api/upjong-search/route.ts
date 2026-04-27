/**
 * LLM 기반 업종 검색 API — Phase 3 Day 5b.
 *
 * 사용자가 자유 텍스트로 검색 ("필라테스", "요가원", "키즈카페" 등) →
 * Claude Haiku 가 NTS 100대 생활업종 중 가장 가까운 1~3개 반환.
 *
 * 캐시:
 *   - Redis (REDIS_URL 환경변수)
 *   - key: upjong-search:{query}
 *   - TTL: 90일 (검색어는 안정적)
 *
 * 비용:
 *   - LLM 호출 1번 ≈ $0.0003 (작은 prompt)
 *   - 캐시 hit (90일) → 0원
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, type RedisClientType } from "redis";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 10;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let redisClient: RedisClientType<any, any, any> | null = null;
async function getRedis() {
  if (!process.env.REDIS_URL) return null;
  if (redisClient?.isReady) return redisClient;
  try {
    redisClient = createClient({ url: process.env.REDIS_URL });
    redisClient.on("error", (e) => console.error("[redis]", e));
    await redisClient.connect();
    return redisClient;
  } catch {
    redisClient = null;
    return null;
  }
}

let llmClient: Anthropic | null = null;
function getLLM() {
  if (llmClient) return llmClient;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  llmClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return llmClient;
}

interface Match {
  name: string;
  reason: string;
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ matches: [] });
  }

  // 길이 제한 (악용 방지)
  const queryNormalized = q.slice(0, 30).toLowerCase();
  const cacheKey = `upjong-search:${queryNormalized}`;

  // 1. Redis 캐시 확인
  const redis = await getRedis();
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return NextResponse.json({
          matches: JSON.parse(cached) as Match[],
          source: "cache",
        });
      }
    } catch (e) {
      console.error("[redis get]", e);
    }
  }

  // 2. 업종 리스트 fetch (region-index.json)
  const host = request.headers.get("host") ?? "localhost:3000";
  const proto =
    request.headers.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  let upjongList: string[];
  try {
    const r = await fetch(`${proto}://${host}/region-index.json`, {
      next: { revalidate: 86400 },
    });
    const d = await r.json();
    upjongList = d.업종 ?? [];
  } catch {
    return NextResponse.json({ matches: [], error: "업종 리스트 로드 실패" });
  }

  // 3. LLM 호출
  const llm = getLLM();
  if (!llm) {
    return NextResponse.json({ matches: [], error: "LLM 미설정" });
  }

  const prompt = `사용자가 자영업 창업 업종을 검색 중입니다. 입력과 가장 가까운 NTS 100대 생활업종 1~3개를 골라주세요.

사용자 입력: "${q}"

NTS 100대 업종 리스트:
${upjongList.join(", ")}

규칙:
- 위 리스트에 있는 정확한 이름만 사용 (다른 이름 X)
- 1~3개. 정확 매칭 1개 있으면 그것만
- 비슷한 게 여러 카테고리 가능 (예: "필라테스" → 헬스클럽, 예체능학원)
- 전혀 매칭 안 되면 빈 배열
- reason 은 짧게 한 문장 ("필라테스는 운동 시설이라 헬스클럽 카테고리에 가장 가까워요")

JSON 만 출력 (마크다운 코드 펜스 없이):
{"matches": [{"name": "...", "reason": "..."}]}`;

  try {
    const r = await llm.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });
    const text = r.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("");
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("JSON 못 찾음");
    const parsed = JSON.parse(jsonMatch[0]) as { matches: Match[] };

    // 검증: 리스트에 있는 이름만 통과
    const validMatches = (parsed.matches || []).filter((m) =>
      upjongList.includes(m.name),
    );

    // Redis 캐시 (90일)
    if (redis) {
      try {
        await redis.set(cacheKey, JSON.stringify(validMatches), {
          EX: 60 * 60 * 24 * 90,
        });
      } catch (e) {
        console.error("[redis set]", e);
      }
    }

    return NextResponse.json({ matches: validMatches, source: "llm" });
  } catch (e) {
    console.error("[llm]", e);
    return NextResponse.json({
      matches: [],
      error: `LLM 호출 실패: ${String(e).slice(0, 100)}`,
    });
  }
}
