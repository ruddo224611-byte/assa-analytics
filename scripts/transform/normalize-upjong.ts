/**
 * NTS↔SBIZ 업종 정규화. taxonomy 로딩 + 자주 쓰는 lookup.
 */

export {
  loadTaxonomy,
  findByNts,
  findByCode,
  type TaxonomyEntry,
} from "../lib/taxonomy";

import type { TaxonomyEntry } from "../lib/taxonomy";

/** NTS 업종명 → SBIZ 소분류 코드 list (1:N 면 여러 개). */
export function ntsToSbizCodes(
  taxonomy: TaxonomyEntry[],
  nts: string,
): string[] {
  const e = taxonomy.find((t) => t.nts === nts);
  return e ? e.sbiz_소분류.map((s) => s.code) : [];
}

/** SBIZ 소분류 코드 list → 매칭되는 NTS 업종 묶음. */
export function sbizCodesToNts(
  taxonomy: TaxonomyEntry[],
  codes: string[],
): string[] {
  const set = new Set<string>();
  for (const c of codes) {
    const e = taxonomy.find((t) => t.sbiz_소분류.some((s) => s.code === c));
    if (e) set.add(e.nts);
  }
  return Array.from(set);
}
