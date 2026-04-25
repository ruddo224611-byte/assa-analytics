/**
 * data/ 디렉터리 경로 헬퍼 + slugify.
 *
 * 디렉터리 정책:
 *   data/raw/{period}/      — gitignored, 원본 캐시
 *   data/reference/         — 매핑 / taxonomy 등 정적 참조
 *   data/build/{시도}/{시군구}/{행정동}/{업종}.json  — 최종 산출물
 */

import { resolve } from "node:path";

export const ROOT = process.cwd();
export const DATA = resolve(ROOT, "data");
export const REFERENCE = resolve(DATA, "reference");
export const RAW = (period: string) => resolve(DATA, "raw", period);
export const BUILD = resolve(DATA, "build");

/** 한국어/특수문자를 URL-safe slug 로. 한글은 그대로 유지하되 공백/슬래시만 처리. */
export function slugify(s: string): string {
  return s
    .trim()
    .replace(/[\/\\]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}\-_]/gu, "")
    .toLowerCase();
}

/** 빌드 산출물 경로. */
export function buildPath(opts: {
  시도: string;
  시군구: string;
  행정동: string;
  업종: string;
}): string {
  return resolve(
    BUILD,
    slugify(opts.시도),
    slugify(opts.시군구),
    slugify(opts.행정동),
    `${slugify(opts.업종)}.json`,
  );
}

/** 기준 분기 → "YYYY0Q" 포맷 (R-ONE) 또는 "YYYYMM" (NTS/jumin). */
export function quarterId(year: number, q: 1 | 2 | 3 | 4): string {
  return `${year}${String(q).padStart(2, "0")}`;
}

export function monthId(year: number, month: number): string {
  return `${year}${String(month).padStart(2, "0")}`;
}
