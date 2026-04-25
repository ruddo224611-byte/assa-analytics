/**
 * 단일 (지역, 업종) 셀의 raw 데이터들을 빌드 산출물 스키마로 머지.
 *
 * 입력: region, upjong taxonomy, raw 파일 경로들 (jumin/sbiz/nts/reb)
 * 출력: docs/phase0/day5-taxonomy-and-design.md 의 빌드 산출물 JSON 스키마
 */

import { readFileSync } from "node:fs";
import type { RegionRow } from "../lib/region";
import type { TaxonomyEntry } from "../lib/taxonomy";
import { parseNtsCsv, indexNtsRows } from "../lib/nts";
import { distMeters, type SbizStore } from "../lib/sbiz";
import { pivotByZoneAndFloor, type RebRow } from "../lib/reb";
import { findZoneForAdong, loadRebZoneMapping } from "./normalize-region";

// jumin CSV 의 "행정구역(코드)" → row 매핑 헬퍼
function pickJuminRow(csvText: string, adong_jumin_10: string): string[] | null {
  const lines = csvText.trim().split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].includes(`(${adong_jumin_10})`)) {
      return parseQuotedCsv(lines[i]);
    }
  }
  return null;
}

function parseQuotedCsv(line: string): string[] {
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
  return out.map((s) => s.replace(/^"|"$/g, ""));
}

function num(s: string | undefined): number | null {
  if (s === undefined || s === "") return null;
  const n = Number(s.replace(/,/g, "").trim());
  return isFinite(n) ? n : null;
}

export interface MergeInputs {
  region: RegionRow;
  upjong: TaxonomyEntry;
  centerLng: number;
  centerLat: number;
  juminHouseholdCsv: string;
  juminAgeCsv: string;
  ntsCsv: string;
  sbizStoresFiles: string[]; // raw json 경로들 (해당 동 + 인접 동)
  rebRowsFile: string; // raw reb json 경로
  ntsBaseLabel: string; // 예: "2025-08"
  rebBaseLabel: string; // 예: "2025-Q1"
  juminBaseLabel: string; // 예: "2026-03"
  sbizFetchedAt: string; // ISO
}

export interface MergedReport {
  meta: {
    지역: { 시도: string; 시군구: string; 행정동: string; 행정동코드_jumin: string; 행정동코드_sbiz: string };
    업종: { name: string; nts: string; sbiz_codes: string[]; sbiz_names: string[]; 매핑유형: string };
    기준일: { 인구: string; 업종: string; 임대료: string; 상가: string };
    신뢰도: { 인구: string; 업종: string; 임대료: string; 상가: string; 캐시업데이트: string };
  };
  수요: {
    인구: number | null;
    세대: number | null;
    세대당인구: number | null;
    성비: number | null;
    연령대_10: Record<string, number | null>;
  };
  경쟁: {
    반경500m_동일업종: number;
    반경1km_동일업종: number;
    시군구내_업소수: number | null;
    시군구_YoY_pct: number | null;
    상가데이터_총수: number;
  };
  임대료: {
    상권: string | null;
    상권_full: string | null;
    매핑신뢰도: string | null;
    분기: string;
    층별: Record<string, { 임대료_천원_m2: number | null; 효용비율_pct: number | null }>;
    단위: { 임대료: string; 효용비율: string };
    참고: string;
  };
  지원사업_links: { label: string; url: string }[];
}

const AGE_BUCKETS_10 = [
  "0~9세",
  "10~19세",
  "20~29세",
  "30~39세",
  "40~49세",
  "50~59세",
  "60~69세",
  "70~79세",
  "80~89세",
  "90~99세",
  "100세 이상",
];

export function mergeArea(inputs: MergeInputs): MergedReport {
  const { region, upjong } = inputs;

  // 1) 수요 (인구·세대·연령)
  const hh = pickJuminRow(inputs.juminHouseholdCsv, region.adong_jumin_10);
  const ag = pickJuminRow(inputs.juminAgeCsv, region.adong_jumin_10);

  const 수요 = {
    인구: hh ? num(hh[1]) : null,
    세대: hh ? num(hh[2]) : null,
    세대당인구: hh ? num(hh[3]) : null,
    성비: hh ? num(hh[6]) : null,
    연령대_10: {} as Record<string, number | null>,
  };
  if (ag) {
    // age csv 헤더에서 "_계_0~9세" 등 매칭. 데이터 row 와 1:1
    // Day 4 검증 결과 컬럼 순서: 행정구역, 계_총인구, 계_연령구간, 계_0~9, 계_10~19, ... 계_100세이상, 남_총... 등
    AGE_BUCKETS_10.forEach((b, i) => {
      // 계 섹션의 0~9세부터 = column index 3 부터
      수요.연령대_10[b] = num(ag[3 + i]);
    });
  }

  // 2) 업종 NTS 시군구내 업소수 + YoY
  const ntsRows = parseNtsCsv(inputs.ntsCsv);
  const ntsIdx = indexNtsRows(ntsRows);
  const ntsKey = `${upjong.nts}|${region.시도}|${region.시군구}`;
  const ntsRow = ntsIdx.get(ntsKey);
  const yoy = ntsRow && ntsRow.전년동월 > 0
    ? (ntsRow.당월 - ntsRow.전년동월) / ntsRow.전년동월
    : null;

  // 3) 경쟁 (반경별 sbiz 카운트)
  const allStores: SbizStore[] = [];
  for (const f of inputs.sbizStoresFiles) {
    allStores.push(...(JSON.parse(readFileSync(f, "utf8")) as SbizStore[]));
  }
  const sbizCodeSet = new Set(upjong.sbiz_소분류.map((s) => s.code));
  const matched = allStores.filter((s) => sbizCodeSet.has(s.indsSclsCd));
  const within = (r: number) =>
    matched.filter(
      (s) => distMeters(inputs.centerLng, inputs.centerLat, s.lon, s.lat) <= r,
    ).length;

  const 경쟁 = {
    반경500m_동일업종: within(500),
    반경1km_동일업종: within(1000),
    시군구내_업소수: ntsRow?.당월 ?? null,
    시군구_YoY_pct: yoy !== null ? Math.round(yoy * 1000) / 10 : null,
    상가데이터_총수: matched.length,
  };

  // 4) 임대료 — REB pivot + zone 매핑
  const rebRows = JSON.parse(readFileSync(inputs.rebRowsFile, "utf8")) as RebRow[];
  const pivot = pivotByZoneAndFloor(rebRows);
  const zoneMap = findZoneForAdong(loadRebZoneMapping(), region.adong_jumin_10);
  const zoneRows = zoneMap
    ? pivot.filter((p) => p.상권_full === zoneMap.reb_zone_full)
    : [];

  const 층별: Record<string, { 임대료_천원_m2: number | null; 효용비율_pct: number | null }> = {};
  for (const p of zoneRows) {
    층별[p.층] = { 임대료_천원_m2: p.임대료_천원_m2, 효용비율_pct: p.효용비율_pct };
  }

  // 5) 지원사업 URL 빌더
  const supportLinks = [
    {
      label: `${region.시군구} · 자금·대출`,
      url: `https://assasup.com/?region=${encodeURIComponent(region.시군구)}&category=${encodeURIComponent("자금·대출")}`,
    },
    {
      label: `${region.시군구} · 교육`,
      url: `https://assasup.com/?region=${encodeURIComponent(region.시군구)}&category=${encodeURIComponent("교육")}`,
    },
    {
      label: `${region.시군구} · 시설개선`,
      url: `https://assasup.com/?region=${encodeURIComponent(region.시군구)}&category=${encodeURIComponent("시설개선")}`,
    },
  ];

  return {
    meta: {
      지역: {
        시도: region.시도,
        시군구: region.시군구,
        행정동: region.행정동,
        행정동코드_jumin: region.adong_jumin_10,
        행정동코드_sbiz: region.adong_sbiz_8,
      },
      업종: {
        name: upjong.nts,
        nts: upjong.nts,
        sbiz_codes: upjong.sbiz_소분류.map((s) => s.code),
        sbiz_names: upjong.sbiz_소분류.map((s) => s.name),
        매핑유형: upjong.type,
      },
      기준일: {
        인구: inputs.juminBaseLabel,
        업종: inputs.ntsBaseLabel,
        임대료: inputs.rebBaseLabel,
        상가: inputs.sbizFetchedAt,
      },
      신뢰도: {
        인구: "행정동",
        업종: "시군구 단위 (NTS) — 행정동 단위는 SBIZ 카운트로 보완",
        임대료: zoneMap
          ? `상권 기준 (${zoneMap.reb_zone}, 매핑신뢰도 ${zoneMap.confidence})`
          : "매핑 없음 — 임대료 미제공",
        상가: "B553077 행정동 단위 + 클라이언트 거리 필터",
        캐시업데이트: new Date().toISOString(),
      },
    },
    수요,
    경쟁,
    임대료: {
      상권: zoneMap?.reb_zone ?? null,
      상권_full: zoneMap?.reb_zone_full ?? null,
      매핑신뢰도: zoneMap?.confidence ?? null,
      분기: inputs.rebBaseLabel,
      층별,
      단위: { 임대료: "천원/㎡", 효용비율: "%" },
      참고: "참고용입니다 · 실제 창업 전 현장 확인 필수",
    },
    지원사업_links: supportLinks,
  };
}
