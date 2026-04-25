/**
 * 행정동·시군구 정규화 + R-ONE 상권 매핑.
 * lib/region (코드 변환) 위에 reb-zone-mapping.csv 를 얹은 transform 단계.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { REFERENCE } from "../lib/paths";
export { toAdongSbiz, toAdongJumin, toSignguCode, loadRegions, findByAdongJumin, findByAdongName } from "../lib/region";
export type { RegionRow, AdongCodeJumin, AdongCodeSbiz, SignguCode } from "../lib/region";

export interface RebZoneMapping {
  adong_jumin_10: string;
  행정동: string;
  reb_zone: string;
  reb_zone_full: string;
  confidence: "high" | "medium" | "low";
  근거: string;
}

export function loadRebZoneMapping(): RebZoneMapping[] {
  const text = readFileSync(resolve(REFERENCE, "reb-zone-mapping.csv"), "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l && !l.startsWith("#"));
  const [headerLine, ...dataLines] = lines;
  const headers = headerLine.split(",");
  return dataLines.map((line) => {
    const cells = line.split(",");
    const r = {} as Record<string, string>;
    headers.forEach((h, i) => (r[h] = cells[i]));
    return r as unknown as RebZoneMapping;
  });
}

export function findZoneForAdong(
  mappings: RebZoneMapping[],
  adong_jumin_10: string,
): RebZoneMapping | undefined {
  return mappings.find((m) => m.adong_jumin_10 === adong_jumin_10);
}
