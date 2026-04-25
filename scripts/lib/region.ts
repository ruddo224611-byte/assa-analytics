/**
 * 행정동 코드 변환 + 시도/시군구/행정동 매핑.
 *
 * 자릿수 차이 (Phase 0 검증 결과):
 *   jumin (행안부 인구·세대)  : 10자리 — 시도(2)+시군구(3)+행정동(3)+통반(2). 예: "1168064000"
 *   B553077 (공단 baroApi)   : 8자리  — 시도(2)+시군구(3)+행정동(3).         예: "11680640"
 *   시군구 코드               : 5자리  — 시도(2)+시군구(3).                  예: "11680"
 *
 * data/reference/region-codes.csv 가 마스터.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { REFERENCE } from "./paths";

export type AdongCodeJumin = string; // 10자리
export type AdongCodeSbiz = string; // 8자리
export type SignguCode = string; // 5자리

export function toAdongSbiz(code10: AdongCodeJumin): AdongCodeSbiz {
  if (code10.length !== 10) throw new Error(`jumin 10자리 아님: ${code10}`);
  return code10.slice(0, 8);
}

export function toAdongJumin(code8: AdongCodeSbiz): AdongCodeJumin {
  if (code8.length !== 8) throw new Error(`sbiz 8자리 아님: ${code8}`);
  return code8 + "00"; // 통반 정보 없음 → 0 채우기
}

export function toSignguCode(code: string): SignguCode {
  if (code.length < 5) throw new Error(`5자리 미만: ${code}`);
  return code.slice(0, 5);
}

export interface RegionRow {
  시도코드: string;
  시군구코드: SignguCode;
  adong_jumin_10: AdongCodeJumin;
  adong_sbiz_8: AdongCodeSbiz;
  시도: string;
  시군구: string;
  행정동: string;
}

export function loadRegions(): RegionRow[] {
  const text = readFileSync(resolve(REFERENCE, "region-codes.csv"), "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l && !l.startsWith("#"));
  const [headerLine, ...dataLines] = lines;
  const headers = headerLine.split(",");
  return dataLines.map((line) => {
    const cells = line.split(",");
    const r = {} as Record<string, string>;
    headers.forEach((h, i) => (r[h] = cells[i]));
    return r as unknown as RegionRow;
  });
}

export function findByAdongJumin(
  rows: RegionRow[],
  code: AdongCodeJumin,
): RegionRow | undefined {
  return rows.find((r) => r.adong_jumin_10 === code);
}

export function findByAdongName(
  rows: RegionRow[],
   행정동: string,
  시군구?: string,
): RegionRow | undefined {
  return rows.find(
    (r) => r.행정동 === 행정동 && (시군구 === undefined || r.시군구 === 시군구),
  );
}
