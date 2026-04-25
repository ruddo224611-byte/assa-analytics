/**
 * NTS↔SBIZ taxonomy 매핑 로더.
 *
 * 마스터: data/reference/taxonomy-nts-to-sbiz.csv
 *   nts_업종, 매핑유형(1:1/1:N/NTS_only/TODO), sbiz_대분류코드, sbiz_대분류명,
 *   sbiz_소분류코드(;), sbiz_소분류명(;), 비고
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { REFERENCE } from "./paths";

export interface TaxonomyEntry {
  nts: string;
  type: "1:1" | "1:N" | "NTS_only" | "TODO";
  sbiz_대분류: { code: string; name: string };
  sbiz_소분류: { code: string; name: string }[];
  비고: string;
}

export function loadTaxonomy(): TaxonomyEntry[] {
  const text = readFileSync(
    resolve(REFERENCE, "taxonomy-nts-to-sbiz.csv"),
    "utf8",
  );
  const lines = text.trim().split(/\r?\n/);
  // 헤더 한 줄
  const out: TaxonomyEntry[] = [];
  for (let i = 1; i < lines.length; i++) {
    // CSV 안에 따옴표 처리된 셀이 있을 수 있음 (예: "전문, 과학 및 기술 서비스업")
    const cells = parseCsvLine(lines[i]);
    const codes = (cells[4] ?? "").split(";").filter(Boolean);
    const names = (cells[5] ?? "").split(";").filter(Boolean);
    out.push({
      nts: cells[0],
      type: cells[1] as TaxonomyEntry["type"],
      sbiz_대분류: { code: cells[2] ?? "", name: cells[3] ?? "" },
      sbiz_소분류: codes.map((code, i) => ({ code, name: names[i] ?? "" })),
      비고: cells[6] ?? "",
    });
  }
  return out;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQ = !inQ;
    else if (c === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/** NTS 업종명 → SBIZ 매핑 entry. */
export function findByNts(
  taxonomy: TaxonomyEntry[],
  nts: string,
): TaxonomyEntry | undefined {
  return taxonomy.find((t) => t.nts === nts);
}

/** SBIZ 소분류 코드 → NTS 업종명. (역방향 lookup, 1:N 의 경우 nts 가 같은 카테고리 묶어줌) */
export function findByCode(
  taxonomy: TaxonomyEntry[],
  sbizCode: string,
): TaxonomyEntry | undefined {
  return taxonomy.find((t) =>
    t.sbiz_소분류.some((s) => s.code === sbizCode),
  );
}
