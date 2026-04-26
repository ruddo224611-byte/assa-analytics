/**
 * data/build → web/public/data 복사 (Next.js prebuild step).
 *
 * 이유:
 *   Next.js (web/) 는 Vercel deploy 시 web/ root 이라 부모 디렉터리 (data/) 직접 접근 어려움.
 *   prebuild 단계에서 public/data 로 복사 → Next.js 정적 자산처럼 서빙.
 *
 * 동작:
 *   - 로컬: web/ 부모의 data/build/ 가 있으면 web/public/data/ 로 cp -R
 *   - Vercel: build context 가 repo root 이므로 ../data/build 접근 가능
 *   - 둘 다 실패하면 경고만 (개발 중 데이터 없을 때 빌드 자체는 통과)
 */

import { existsSync, mkdirSync, cpSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(__dirname, "..");
const PUBLIC_DATA = resolve(WEB_ROOT, "public", "data");

// 가능한 source 위치 (로컬 / Vercel 둘 다 시도)
const candidateSources = [
  resolve(WEB_ROOT, "..", "data", "build"),       // 로컬 dev: ../data/build
  resolve(WEB_ROOT, "data", "build"),              // 일부 환경: web/data/build
  resolve(process.cwd(), "data", "build"),         // Vercel build context
  resolve(process.cwd(), "..", "data", "build"),
];

function findSource() {
  for (const s of candidateSources) {
    if (existsSync(s)) return s;
  }
  return null;
}

function main() {
  const src = findSource();
  if (!src) {
    console.warn("[copy-data] data/build 못 찾음. 후보:");
    candidateSources.forEach((s) => console.warn(`  - ${s}`));
    console.warn("[copy-data] 빌드는 계속 진행 (데이터 없는 모드).");
    return;
  }
  console.log(`[copy-data] src = ${src}`);
  console.log(`[copy-data] dst = ${PUBLIC_DATA}`);

  // 기존 public/data 삭제 (stale 방지)
  if (existsSync(PUBLIC_DATA)) {
    rmSync(PUBLIC_DATA, { recursive: true, force: true });
  }
  mkdirSync(dirname(PUBLIC_DATA), { recursive: true });
  cpSync(src, PUBLIC_DATA, { recursive: true });
  console.log("[copy-data] 복사 완료");
}

main();
