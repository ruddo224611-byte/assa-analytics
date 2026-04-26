/**
 * 시군구 단위 합본 (H 형식) 빌드.
 *
 * 한 시군구의 모든 행정동 × 모든 업종을 하나의 nested JSON 으로.
 * Phase 1 Week 2 Day 1 발견 #4 (디스크 폭발 위험) 대응:
 *   - 22,000 파일 → 250 파일 (시군구당 1개)
 *   - 행정동 단위 공통 데이터(수요/임대료/지원사업)는 한 번만 저장 (중복 제거)
 *   - 업종별로는 경쟁 정보만 (sbiz 코드, 반경 카운트, YoY)
 *
 * 출력 구조:
 *   data/build/{시도}/{시군구}.json
 *   {
 *     "meta": { 시도, 시군구, 기준일, 신뢰도, 행정동수, 업종수, 캐시업데이트 },
 *     "행정동": {
 *       "역삼1동": {
 *         "지역": { 행정동코드_jumin/sbiz, 중심좌표 },
 *         "수요": { 인구, 세대, 세대당, 성비, 연령대_10 },
 *         "임대료": { 상권, 매핑신뢰도, 층별, 단위 },
 *         "지원사업_links": [ ... ],
 *         "업종별": {
 *           "커피음료점": { sbiz_codes, 매핑유형, 경쟁: {...} },
 *           ...
 *         }
 *       }
 *     }
 *   }
 */

import type { RegionRow } from "../lib/region";
import type { TaxonomyEntry } from "../lib/taxonomy";
import { parseNtsCsv, indexNtsRows } from "../lib/nts";
import { distMeters, type SbizStore } from "../lib/sbiz";
import { type RebRow, pivotByZoneAndFloor } from "../lib/reb";
import { findZoneForAdong, loadRebZoneMapping } from "./normalize-region";

interface JuminRow { 인구: number | null; 세대: number | null; 세대당: number | null; 성비: number | null; }

const AGE_BUCKETS_10 = [
  "0~9세","10~19세","20~29세","30~39세","40~49세","50~59세",
  "60~69세","70~79세","80~89세","90~99세","100세 이상",
];

function pickJuminRow(csvText: string, adong_jumin_10: string): string[] | null {
  const lines = csvText.trim().split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].includes(`(${adong_jumin_10})`)) return parseQuotedCsv(lines[i]);
  }
  return null;
}

function parseQuotedCsv(line: string): string[] {
  const out: string[] = []; let cur = ""; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQ = !inQ;
    else if (c === "," && !inQ) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.replace(/^"|"$/g, ""));
}

function num(s: string | undefined): number | null {
  if (s === undefined || s === "") return null;
  const n = Number(s.replace(/,/g, "").trim());
  return isFinite(n) ? n : null;
}

export interface BuildSignguInputs {
  시도: string;
  시군구: string;
  regions: RegionRow[]; // 시군구 안 모든 행정동
  taxonomy: TaxonomyEntry[]; // NTS_only 제외
  juminHouseholdCsv: string;
  juminAgeCsv: string;
  ntsCsv: string;
  sbizByAdong: Map<string, SbizStore[]>; // adong_sbiz_8 → stores
  allCitySbiz: SbizStore[]; // 거리 필터용
  rebRows: RebRow[];
  juminBaseLabel: string;
  ntsBaseLabel: string;
  rebBaseLabel: string;
  sbizFetchedAt: string;
}

export interface SignguHReport {
  meta: {
    시도: string;
    시군구: string;
    기준일: { 인구: string; 업종: string; 임대료: string; 상가: string };
    신뢰도: { 인구: string; 업종: string; 임대료: string; 상가: string; 캐시업데이트: string };
    행정동수: number;
    업종수: number;
  };
  행정동: Record<string, AdongData>;
}

/**
 * 카카오맵 핀용 stores 분리 출력 — 시군구 1 파일 nested 와 별도.
 * 핵심 필드만 (좌표·이름·업종 코드). 1MB 시군구 메인 파일에 추가하면 4배 부담 → 분리.
 */
export interface SignguStoresFile {
  meta: {
    시도: string;
    시군구: string;
    캐시업데이트: string;
    총_stores: number;
  };
  stores: {
    name: string;       // bizesNm
    branch?: string;    // brchNm (지점명)
    sclsCd: string;     // indsSclsCd (업종 소분류 — 필터용)
    sclsNm: string;     // indsSclsNm
    adongCd: string;    // 8자리
    adongNm: string;
    addr: string;       // rdnmAdr (도로명) 또는 lnoAdr
    floor?: string;     // flrNo
    lng: number;
    lat: number;
  }[];
}

export function buildStoresFile(
  시도: string,
  시군구: string,
  allCitySbiz: SbizStore[],
): SignguStoresFile {
  return {
    meta: {
      시도,
      시군구,
      캐시업데이트: new Date().toISOString(),
      총_stores: allCitySbiz.length,
    },
    stores: allCitySbiz.map((s) => ({
      name: s.bizesNm,
      branch: s.brchNm || undefined,
      sclsCd: s.indsSclsCd,
      sclsNm: s.indsSclsNm,
      adongCd: s.adongCd,
      adongNm: s.adongNm,
      addr: (s.rdnmAdr as string) || (s.lnoAdr as string) || "",
      floor: (s.flrNo as string) || undefined,
      lng: s.lon,
      lat: s.lat,
    })),
  };
}

interface AdongData {
  지역: {
    행정동: string;
    행정동코드_jumin: string;
    행정동코드_sbiz: string;
    중심좌표: { lng: number; lat: number };
  };
  수요: {
    인구: number | null;
    세대: number | null;
    세대당인구: number | null;
    성비: number | null;
    연령대_10: Record<string, number | null>;
  };
  임대료: {
    상권: string | null;
    상권_full: string | null;
    매핑신뢰도: string | null;
    분기: string;
    층별: Record<string, { 임대료_천원_m2: number | null; 효용비율_pct: number | null }>;
    단위: { 임대료: string; 효용비율: string };
  };
  지원사업_links: { label: string; url: string }[];
  업종별: Record<string, UpjongData>;
}

interface UpjongData {
  sbiz_codes: string[];
  sbiz_names: string[];
  매핑유형: string;
  경쟁: {
    반경500m_동일업종: number;
    반경1km_동일업종: number;
    시군구내_업소수: number | null;
    시군구_YoY_pct: number | null;
    상가데이터_총수: number;
  };
}

export function buildSignguH(input: BuildSignguInputs): SignguHReport {
  const ntsRows = parseNtsCsv(input.ntsCsv);
  const ntsIdx = indexNtsRows(ntsRows);
  const rebPivot = pivotByZoneAndFloor(input.rebRows);
  const zoneMappings = loadRebZoneMapping();

  const 행정동: Record<string, AdongData> = {};

  for (const r of input.regions) {
    const myStores = input.sbizByAdong.get(r.adong_sbiz_8) ?? [];
    let cLng: number, cLat: number;
    if (myStores.length > 0) {
      cLng = myStores.reduce((a, s) => a + s.lon, 0) / myStores.length;
      cLat = myStores.reduce((a, s) => a + s.lat, 0) / myStores.length;
    } else {
      cLng = input.allCitySbiz.reduce((a, s) => a + s.lon, 0) / input.allCitySbiz.length;
      cLat = input.allCitySbiz.reduce((a, s) => a + s.lat, 0) / input.allCitySbiz.length;
    }

    // 수요
    const hh = pickJuminRow(input.juminHouseholdCsv, r.adong_jumin_10);
    const ag = pickJuminRow(input.juminAgeCsv, r.adong_jumin_10);
    const 수요 = {
      인구: hh ? num(hh[1]) : null,
      세대: hh ? num(hh[2]) : null,
      세대당인구: hh ? num(hh[3]) : null,
      성비: hh ? num(hh[6]) : null,
      연령대_10: {} as Record<string, number | null>,
    };
    if (ag) AGE_BUCKETS_10.forEach((b, i) => { 수요.연령대_10[b] = num(ag[3 + i]); });

    // 임대료 (행정동 1번)
    const zoneMap = findZoneForAdong(zoneMappings, r.adong_jumin_10);
    const zoneRows = zoneMap ? rebPivot.filter((p) => p.상권_full === zoneMap.reb_zone_full) : [];
    const 층별: Record<string, { 임대료_천원_m2: number | null; 효용비율_pct: number | null }> = {};
    for (const p of zoneRows) {
      층별[p.층] = { 임대료_천원_m2: p.임대료_천원_m2, 효용비율_pct: p.효용비율_pct };
    }

    // 지원사업
    const supportLinks = [
      {
        label: `${r.시군구} · 자금·대출`,
        url: `https://assasup.com/?region=${encodeURIComponent(r.시군구)}&category=${encodeURIComponent("자금·대출")}`,
      },
      {
        label: `${r.시군구} · 교육`,
        url: `https://assasup.com/?region=${encodeURIComponent(r.시군구)}&category=${encodeURIComponent("교육")}`,
      },
      {
        label: `${r.시군구} · 시설개선`,
        url: `https://assasup.com/?region=${encodeURIComponent(r.시군구)}&category=${encodeURIComponent("시설개선")}`,
      },
    ];

    // 업종별 (각 업종의 경쟁)
    const 업종별: Record<string, UpjongData> = {};
    for (const u of input.taxonomy) {
      const sbizCodeSet = new Set(u.sbiz_소분류.map((s) => s.code));
      const matched = input.allCitySbiz.filter((s) => sbizCodeSet.has(s.indsSclsCd));
      const within = (radius: number) => matched.filter(
        (s) => distMeters(cLng, cLat, s.lon, s.lat) <= radius,
      ).length;

      const ntsRow = ntsIdx.get(`${u.nts}|${r.시도}|${r.시군구}`);
      const yoy = ntsRow && ntsRow.전년동월 > 0
        ? (ntsRow.당월 - ntsRow.전년동월) / ntsRow.전년동월
        : null;

      업종별[u.nts] = {
        sbiz_codes: u.sbiz_소분류.map((s) => s.code),
        sbiz_names: u.sbiz_소분류.map((s) => s.name),
        매핑유형: u.type,
        경쟁: {
          반경500m_동일업종: within(500),
          반경1km_동일업종: within(1000),
          시군구내_업소수: ntsRow?.당월 ?? null,
          시군구_YoY_pct: yoy !== null ? Math.round(yoy * 1000) / 10 : null,
          상가데이터_총수: matched.length,
        },
      };
    }

    행정동[r.행정동] = {
      지역: {
        행정동: r.행정동,
        행정동코드_jumin: r.adong_jumin_10,
        행정동코드_sbiz: r.adong_sbiz_8,
        중심좌표: { lng: Number(cLng.toFixed(6)), lat: Number(cLat.toFixed(6)) },
      },
      수요,
      임대료: {
        상권: zoneMap?.reb_zone ?? null,
        상권_full: zoneMap?.reb_zone_full ?? null,
        매핑신뢰도: zoneMap?.confidence ?? null,
        분기: input.rebBaseLabel,
        층별,
        단위: { 임대료: "천원/㎡", 효용비율: "%" },
      },
      지원사업_links: supportLinks,
      업종별,
    };
  }

  return {
    meta: {
      시도: input.시도,
      시군구: input.시군구,
      기준일: {
        인구: input.juminBaseLabel,
        업종: input.ntsBaseLabel,
        임대료: input.rebBaseLabel,
        상가: input.sbizFetchedAt,
      },
      신뢰도: {
        인구: "행정동",
        업종: "시군구 단위 (NTS) — 행정동 단위는 SBIZ 카운트로 보완",
        임대료: "상권 기준 (R-ONE) — 행정동별 매핑신뢰도 표시",
        상가: "B553077 행정동 단위 + 클라이언트 거리 필터",
        캐시업데이트: new Date().toISOString(),
      },
      행정동수: input.regions.length,
      업종수: input.taxonomy.length,
    },
    행정동,
  };
}
