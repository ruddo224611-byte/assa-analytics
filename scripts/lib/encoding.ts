/**
 * 한국 공공기관 CSV/텍스트 파일이 EUC-KR (CP949) 로 인코딩돼 오는 경우가 많아 공용 유틸로 빼둠.
 *
 * 사용 예:
 *   import { readEucKrFile, decodeEucKrResponse } from "./lib/encoding";
 *   const csv = readEucKrFile("/tmp/jumin.csv");
 *   const text = await decodeEucKrResponse(await fetch(url));
 */

import { readFileSync, writeFileSync } from "node:fs";

const EUC_KR = "euc-kr"; // Node.js 의 full-ICU 번들에는 포함됨 (Node 18+)

/** EUC-KR 인코딩 파일을 UTF-8 문자열로 읽어옴. */
export function readEucKrFile(path: string): string {
  return new TextDecoder(EUC_KR).decode(readFileSync(path));
}

/** Response 바디 (ArrayBuffer) 를 EUC-KR 로 디코딩. */
export async function decodeEucKrResponse(res: Response): Promise<string> {
  const buf = await res.arrayBuffer();
  return new TextDecoder(EUC_KR).decode(buf);
}

/** EUC-KR 소스 파일을 UTF-8 CSV 로 변환해 저장. 반환값은 변환된 문자열. */
export function convertEucKrToUtf8(
  srcPath: string,
  destPath: string,
): string {
  const text = readEucKrFile(srcPath);
  writeFileSync(destPath, text, "utf8");
  return text;
}
