/**
 * 홈 페이지 — Phase 2 Day 2 에서 placeholder → 입력 UI 로 교체.
 *
 * Server component: region-index.json 을 fs 로 읽어서 client form 에 props 전달.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import HomeForm, { type RegionIndex } from "./HomeForm";

function loadRegionIndex(): RegionIndex {
  const path = resolve(process.cwd(), "public", "region-index.json");
  try {
    return JSON.parse(readFileSync(path, "utf8")) as RegionIndex;
  } catch {
    return { 시도: [], 업종: [] };
  }
}

export default function Home() {
  const index = loadRegionIndex();
  return (
    <section className="mx-auto max-w-2xl px-4 py-12 sm:py-16">
      {/* 히어로 */}
      <div className="text-center mb-8 sm:mb-10">
        <div className="mb-4 flex justify-center">
          <span className="chip-brand">베타 · 무료</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 text-balance">
          이 자리, <span className="text-brand-600">차려도 될까?</span>
        </h1>
        <p className="mt-4 text-base sm:text-lg text-slate-600 text-balance">
          행정동 + 업종 입력하면 인구·경쟁·임대료까지<br className="hidden sm:inline" />
          한 페이지로 보여드려요.
        </p>
      </div>

      {/* 입력 폼 */}
      <HomeForm index={index} />

      {/* 데이터 출처 */}
      <div className="mt-10 text-center text-xs text-slate-400">
        <p className="mb-1">데이터 출처</p>
        <p>
          행안부 주민등록 · 국세청 100대 생활업종 · 공단 상가업소정보(B553077) · 한국부동산원 R-ONE
        </p>
        <p className="mt-3 text-slate-300">
          참고용입니다 · 실제 창업 전 현장 확인 필수
        </p>
      </div>
    </section>
  );
}
