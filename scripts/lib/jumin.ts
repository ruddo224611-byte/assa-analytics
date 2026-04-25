/**
 * 행안부 jumin.mois.go.kr CSV 다운로드 래퍼.
 *
 * 두 데이터셋:
 *   downloadCsvAge.do  — 행정동별 연령별 인구 (10세 단위, 성별)
 *   downloadCsv.do     — 행정동별 인구·세대수·세대당 인구·성비
 *
 * 두 응답 모두 EUC-KR (lib/encoding 사용).
 */

import { decodeEucKrResponse } from "./encoding";

const HEADERS = {
  "User-Agent": "Mozilla/5.0",
  "Content-Type": "application/x-www-form-urlencoded",
  Origin: "https://jumin.mois.go.kr",
};

function buildForm(year: string, month: string, withGeneration: boolean): string {
  const start = `${year}${month}01`;
  const end = `${year}${month}31`;
  const fields: Record<string, string> = {
    sltOrgType: "1",
    sltOrgLvl1: "A",
    sltOrgLvl2: "",
    gender: "gender",
    sum: "sum",
    sltUndefType: "",
    searchYearStart: year,
    searchMonthStart: month,
    searchYearEnd: year,
    searchMonthEnd: month,
    sltOrderType: "1",
    sltOrderValue: "ASC",
    category: "month",
    state: "3", // 전체 읍면동
    nowYear: year,
    startOrtnDe: start,
    endOrtnDe: end,
  };
  if (withGeneration) {
    fields.genderPer = "genderPer";
    fields.generation = "generation";
  } else {
    fields.sltArgTypes = "10";
    fields.sltArgTypeA = "0";
    fields.sltArgTypeB = "100";
  }
  return new URLSearchParams(fields).toString();
}

/** 인구·세대현황 (downloadCsv.do — statMonth 페이지). */
export async function downloadHouseholdCsv(
  year: number | string,
  month: number | string,
): Promise<string> {
  const yy = String(year);
  const mm = String(month).padStart(2, "0");
  const url = "https://jumin.mois.go.kr/downloadCsv.do?searchYearMonth=month&xlsStats=3";
  const res = await fetch(url, {
    method: "POST",
    headers: { ...HEADERS, Referer: "https://jumin.mois.go.kr/statMonth.do" },
    body: buildForm(yy, mm, true),
  });
  if (!res.ok) throw new Error(`jumin household HTTP ${res.status}`);
  return decodeEucKrResponse(res);
}

/** 연령별 인구 (downloadCsvAge.do — ageStatMonth 페이지). */
export async function downloadAgeCsv(
  year: number | string,
  month: number | string,
): Promise<string> {
  const yy = String(year);
  const mm = String(month).padStart(2, "0");
  const url =
    "https://jumin.mois.go.kr/downloadCsvAge.do?searchYearMonth=month&xlsStats=3";
  const res = await fetch(url, {
    method: "POST",
    headers: { ...HEADERS, Referer: "https://jumin.mois.go.kr/ageStatMonth.do" },
    body: buildForm(yy, mm, false),
  });
  if (!res.ok) throw new Error(`jumin age HTTP ${res.status}`);
  return decodeEucKrResponse(res);
}

/** "서울특별시 강남구 역삼1동(1168064000)" → { jumin: "1168064000", 행정동: "역삼1동", ... } */
export function parseRegionLabel(label: string): {
  시도: string;
  시군구: string;
  행정동: string;
  adong_jumin_10: string;
} | null {
  const m = label.trim().match(/^(\S+)\s+(\S+)\s+(\S+)\((\d{10})\)$/);
  if (!m) return null;
  return { 시도: m[1], 시군구: m[2], 행정동: m[3], adong_jumin_10: m[4] };
}
