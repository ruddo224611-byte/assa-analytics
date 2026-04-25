/**
 * 국세청 100대 생활업종 사업자 현황 CSV 다운로드.
 *
 * 출처: data.go.kr 15061118 — atchFileId=FILE_000000003620844
 *   컬럼: 업종, 시도, 시군구, 당월, 전월, 전년동월
 *   인코딩: EUC-KR
 */

import { decodeEucKrResponse } from "./encoding";

const URL_LATEST =
  "https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId=FILE_000000003620844&fileDetailSn=1&insertDataPrcus=N";

export interface NtsRow {
  업종: string;
  시도: string;
  시군구: string;
  당월: number;
  전월: number;
  전년동월: number;
}

export async function downloadNtsCsv(): Promise<string> {
  const res = await fetch(URL_LATEST);
  if (!res.ok) throw new Error(`NTS HTTP ${res.status}`);
  return decodeEucKrResponse(res);
}

export function parseNtsCsv(text: string): NtsRow[] {
  const lines = text.trim().split(/\r?\n/);
  const out: NtsRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(",");
    out.push({
      업종: c[0],
      시도: c[1],
      시군구: c[2],
      당월: Number(c[3]),
      전월: Number(c[4]),
      전년동월: Number(c[5]),
    });
  }
  return out;
}

/** (업종, 시군구) → row. 시도+시군구 조합으로 unique. */
export function indexNtsRows(
  rows: NtsRow[],
): Map<string, NtsRow> {
  const m = new Map<string, NtsRow>();
  for (const r of rows) m.set(`${r.업종}|${r.시도}|${r.시군구}`, r);
  return m;
}
