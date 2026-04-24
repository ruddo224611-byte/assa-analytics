/**
 * web/.env.local 을 파싱해 환경변수 객체로 반환.
 * dotenv 패키지 의존을 피하기 위한 간이 파서.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadEnv(
  envPath: string = resolve(process.cwd(), "web/.env.local"),
): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

export function requireEnv(
  key: string,
  env: Record<string, string> = loadEnv(),
): string {
  const v = env[key];
  if (!v) throw new Error(`${key} 가 web/.env.local 에 없음`);
  return v;
}
