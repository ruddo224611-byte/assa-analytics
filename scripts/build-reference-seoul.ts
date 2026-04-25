/**
 * 서울 25구 reference 데이터 자동 생성.
 *
 * 실행:
 *   npx tsx scripts/build-reference-seoul.ts
 *
 * 출력 (덮어쓰기):
 *   data/reference/region-codes.csv     (425+ 행정동)
 *   data/reference/reb-zone-mapping.csv (425+ 매핑, 휴리스틱)
 *
 * 휴리스틱 매핑 규칙:
 *   1. 동명에 R-ONE 상권 키워드 포함 시 직접 매핑 (high)
 *   2. 같은 구의 대표 상권으로 fallback (low)
 *
 * Phase 2 에서 운영자 직접 라벨링으로 정확도 보강 예정.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { decodeEucKrResponse } from "./lib/encoding";
import { downloadHouseholdCsv } from "./lib/jumin";
import { REFERENCE, RAW, monthId } from "./lib/paths";

// 서울 R-ONE 상권 (Day 6 rent-sample.csv 에서 추출).
// gu: 이 상권이 속한/덮는 구 (false positive 방지 — 같은 구 동만 매칭)
// gu가 여러 개면 모두 나열 (예: 이태원은 용산구만, 잠실/송파는 송파구)
const SEOUL_ZONES: { full: string; name: string; gu: string[]; keywords: string[] }[] = [
  // 강남구 (Week 1 의 정밀 매핑 보존하기 위해 여기서는 강남구 fallback 만 사용)
  { full: "서울>강남>강남대로", name: "강남대로", gu: ["강남구"], keywords: ["강남대로"] },
  { full: "서울>강남>교대역", name: "교대역", gu: ["서초구"], keywords: ["교대"] },
  { full: "서울>강남>남부터미널", name: "남부터미널", gu: ["서초구"], keywords: ["남부터미널"] },
  { full: "서울>강남>논현역", name: "논현역", gu: ["강남구"], keywords: ["논현"] },
  { full: "서울>강남>도산대로", name: "도산대로", gu: ["강남구"], keywords: ["도산"] },
  { full: "서울>강남>방배역/내방역", name: "방배역/내방역", gu: ["서초구"], keywords: ["방배", "내방"] },
  { full: "서울>강남>서래마을", name: "서래마을", gu: ["서초구"], keywords: ["서래"] },
  { full: "서울>강남>신사역", name: "신사역", gu: ["강남구"], keywords: ["신사"] },
  { full: "서울>강남>압구정", name: "압구정", gu: ["강남구"], keywords: ["압구정"] },
  { full: "서울>강남>양재말죽거리", name: "양재말죽거리", gu: ["서초구"], keywords: ["양재"] },
  { full: "서울>강남>양재역", name: "양재역", gu: ["서초구"], keywords: ["양재"] },
  { full: "서울>강남>청담", name: "청담", gu: ["강남구"], keywords: ["청담"] },
  { full: "서울>강남>테헤란로", name: "테헤란로", gu: ["강남구"], keywords: ["테헤란", "역삼"] },
  { full: "서울>강남>학동/강남구청역", name: "학동/강남구청역", gu: ["강남구"], keywords: ["학동", "강남구청"] },
  // 도심 (종로구·중구)
  { full: "서울>도심>광화문", name: "광화문", gu: ["종로구"], keywords: ["광화문", "사직", "청운"] },
  { full: "서울>도심>남대문", name: "남대문", gu: ["중구"], keywords: ["남대문", "회현"] },
  { full: "서울>도심>동대문", name: "동대문", gu: ["중구"], keywords: ["광희"] },
  { full: "서울>도심>명동", name: "명동", gu: ["중구"], keywords: ["명동"] },
  { full: "서울>도심>방산시장", name: "방산시장", gu: ["중구"], keywords: ["방산"] },
  { full: "서울>도심>북촌", name: "북촌", gu: ["종로구"], keywords: ["북촌", "삼청", "가회"] },
  { full: "서울>도심>서촌", name: "서촌", gu: ["종로구"], keywords: ["서촌", "통인", "효자"] },
  { full: "서울>도심>시청", name: "시청", gu: ["중구"], keywords: ["시청", "정동", "태평"] },
  { full: "서울>도심>을지로", name: "을지로", gu: ["중구"], keywords: ["을지로"] },
  { full: "서울>도심>종로", name: "종로", gu: ["종로구"], keywords: ["종로", "종교", "관철"] },
  { full: "서울>도심>충무로", name: "충무로", gu: ["중구"], keywords: ["충무로", "필동"] },
  // 영등포신촌 (마포구·서대문구·영등포구)
  { full: "서울>영등포신촌>공덕역", name: "공덕역", gu: ["마포구"], keywords: ["공덕"] },
  { full: "서울>영등포신촌>당산역", name: "당산역", gu: ["영등포구"], keywords: ["당산"] },
  { full: "서울>영등포신촌>동교/연남", name: "동교/연남", gu: ["마포구"], keywords: ["동교", "연남"] },
  { full: "서울>영등포신촌>망원역", name: "망원역", gu: ["마포구"], keywords: ["망원"] },
  { full: "서울>영등포신촌>신촌/이대", name: "신촌/이대", gu: ["서대문구", "마포구"], keywords: ["신촌", "대흥", "북아현"] },
  { full: "서울>영등포신촌>영등포역", name: "영등포역", gu: ["영등포구"], keywords: ["영등포"] },
  { full: "서울>영등포신촌>홍대/합정", name: "홍대/합정", gu: ["마포구"], keywords: ["서교", "합정", "상수"] },
  // 기타
  { full: "서울>기타>가락시장", name: "가락시장", gu: ["송파구"], keywords: ["가락"] },
  { full: "서울>기타>건대입구", name: "건대입구", gu: ["광진구"], keywords: ["화양", "능동"] },
  { full: "서울>기타>경희대", name: "경희대", gu: ["동대문구"], keywords: ["회기", "휘경"] },
  { full: "서울>기타>구로디지털단지역", name: "구로디지털단지역", gu: ["구로구", "금천구"], keywords: ["구로", "가산"] },
  { full: "서울>기타>구의역", name: "구의역", gu: ["광진구"], keywords: ["구의"] },
  { full: "서울>기타>군자", name: "군자", gu: ["광진구", "중랑구"], keywords: ["군자", "중곡"] },
  { full: "서울>기타>까치산역", name: "까치산역", gu: ["강서구", "양천구"], keywords: [] },
  { full: "서울>기타>낙성대", name: "낙성대", gu: ["관악구"], keywords: ["낙성대", "인헌"] },
  { full: "서울>기타>노량진", name: "노량진", gu: ["동작구"], keywords: ["노량진"] },
  { full: "서울>기타>독산/시흥", name: "독산/시흥", gu: ["금천구"], keywords: ["독산", "시흥"] },
  { full: "서울>기타>뚝섬", name: "뚝섬", gu: ["성동구"], keywords: ["성수"] },
  { full: "서울>기타>목동", name: "목동", gu: ["양천구"], keywords: ["목동", "신정"] },
  { full: "서울>기타>미아사거리", name: "미아사거리", gu: ["강북구"], keywords: ["미아"] },
  { full: "서울>기타>불광역", name: "불광역", gu: ["은평구"], keywords: ["불광"] },
  { full: "서울>기타>사당", name: "사당", gu: ["동작구"], keywords: ["사당"] },
  { full: "서울>기타>상계역", name: "상계역", gu: ["노원구"], keywords: ["상계"] },
  { full: "서울>기타>상봉역", name: "상봉역", gu: ["중랑구"], keywords: ["상봉", "망우", "면목"] },
  { full: "서울>기타>서울대입구역", name: "서울대입구역", gu: ["관악구"], keywords: ["대학동", "행운", "서림"] },
  { full: "서울>기타>성신여대", name: "성신여대", gu: ["성북구"], keywords: ["돈암", "정릉"] },
  { full: "서울>기타>수유", name: "수유", gu: ["강북구"], keywords: ["수유"] },
  { full: "서울>기타>숙명여대", name: "숙명여대", gu: ["용산구"], keywords: ["청파", "갈월"] },
  { full: "서울>기타>신림역", name: "신림역", gu: ["관악구"], keywords: ["신림"] },
  { full: "서울>기타>쌍문역", name: "쌍문역", gu: ["도봉구"], keywords: ["쌍문"] },
  { full: "서울>기타>약수역", name: "약수역", gu: ["중구"], keywords: ["약수", "신당"] },
  { full: "서울>기타>연신내", name: "연신내", gu: ["은평구"], keywords: ["연신내", "갈현"] },
  { full: "서울>기타>오류동역", name: "오류동역", gu: ["구로구"], keywords: ["오류"] },
  { full: "서울>기타>왕십리", name: "왕십리", gu: ["성동구"], keywords: ["왕십리", "행당", "마장"] },
  { full: "서울>기타>용산역", name: "용산역", gu: ["용산구"], keywords: ["한강로", "용문"] },
  { full: "서울>기타>이태원", name: "이태원", gu: ["용산구"], keywords: ["이태원", "한남", "보광"] },
  { full: "서울>기타>잠실/송파", name: "잠실/송파", gu: ["송파구"], keywords: ["잠실"] },
  { full: "서울>기타>잠실새내역", name: "잠실새내역", gu: ["송파구"], keywords: [] },
  { full: "서울>기타>장안동", name: "장안동", gu: ["동대문구"], keywords: ["장안", "전농", "답십리"] },
  { full: "서울>기타>천호", name: "천호", gu: ["강동구"], keywords: ["천호", "성내"] },
  { full: "서울>기타>청량리", name: "청량리", gu: ["동대문구"], keywords: ["청량리", "이문"] },
  { full: "서울>기타>혜화동", name: "혜화동", gu: ["종로구"], keywords: ["혜화", "이화", "명륜", "동숭"] },
  { full: "서울>기타>화곡", name: "화곡", gu: ["강서구"], keywords: ["화곡"] },
];

// 구 단위 fallback
const GU_FALLBACK: Record<string, string> = {
  "강남구": "서울>강남>강남대로",
  "강동구": "서울>기타>천호",
  "강북구": "서울>기타>미아사거리",
  "강서구": "서울>기타>화곡",
  "관악구": "서울>기타>서울대입구역",
  "광진구": "서울>기타>건대입구",
  "구로구": "서울>기타>구로디지털단지역",
  "금천구": "서울>기타>독산/시흥",
  "노원구": "서울>기타>상계역",
  "도봉구": "서울>기타>쌍문역",
  "동대문구": "서울>기타>청량리",
  "동작구": "서울>기타>노량진",
  "마포구": "서울>영등포신촌>홍대/합정",
  "서대문구": "서울>영등포신촌>신촌/이대",
  "서초구": "서울>강남>강남대로",
  "성동구": "서울>기타>왕십리",
  "성북구": "서울>기타>성신여대",
  "송파구": "서울>기타>잠실/송파",
  "양천구": "서울>기타>목동",
  "영등포구": "서울>영등포신촌>영등포역",
  "용산구": "서울>기타>용산역",
  "은평구": "서울>기타>연신내",
  "종로구": "서울>도심>종로",
  "중구": "서울>도심>명동",
  "중랑구": "서울>기타>상봉역",
};

interface ParsedAdong {
  시도: string; 시군구: string; 행정동: string; adong_jumin_10: string;
}

function parseSeoulFromJumin(csvText: string): ParsedAdong[] {
  const out: ParsedAdong[] = [];
  const lines = csvText.split(/\r?\n/);
  const re = /^"?서울특별시 (\S+구) (\S+?)\((\d{10})\)/;
  for (const line of lines) {
    const m = line.match(re);
    if (m) out.push({
      시도: "서울특별시",
      시군구: m[1],
      행정동: m[2],
      adong_jumin_10: m[3],
    });
  }
  return out;
}

function findZoneFor(가구: string, 동: string): { zone: typeof SEOUL_ZONES[0]; confidence: "high" | "medium" | "low" } | null {
  // 1. 같은 구 안 zone 의 키워드 매칭만 high (다른 구는 false positive 방지)
  for (const z of SEOUL_ZONES) {
    if (!z.gu.includes(가구)) continue;
    for (const kw of z.keywords) {
      if (동.includes(kw)) return { zone: z, confidence: "high" };
    }
  }
  // 2. 구 fallback (low)
  const fb = GU_FALLBACK[가구];
  if (fb) {
    const z = SEOUL_ZONES.find((s) => s.full === fb);
    if (z) return { zone: z, confidence: "low" };
  }
  return null;
}

async function main() {
  // jumin 데이터 (캐시 사용)
  const lastMonth = new Date();
  lastMonth.setMonth(lastMonth.getMonth() - 1);
  const period = monthId(lastMonth.getFullYear(), lastMonth.getMonth() + 1);
  const juminFile = resolve(RAW(period), "jumin-household.csv");
  if (!existsSync(juminFile)) {
    console.log("jumin 캐시 없음 — 다운로드 중...");
    const csv = await downloadHouseholdCsv(lastMonth.getFullYear(), lastMonth.getMonth() + 1);
    writeFileSync(juminFile, csv, "utf8");
  }
  const csvText = readFileSync(juminFile, "utf8");
  const seoul = parseSeoulFromJumin(csvText);
  console.log(`서울 행정동 ${seoul.length} 개 파싱`);

  // region-codes.csv 작성
  const regionLines: string[] = [
    "# 행정동 표준 코드 매핑 (서울특별시 25구 전체)",
    "# 출처: jumin.mois.go.kr/statMonth.do (10자리 코드 → 8자리 sbiz 변환)",
    "# Phase 1 Week 2 Day 2 — 서울 자동 생성 (다른 시도는 추후 확장)",
    "시도코드,시군구코드,adong_jumin_10,adong_sbiz_8,시도,시군구,행정동",
  ];
  for (const a of seoul) {
    regionLines.push(`11,${a.adong_jumin_10.slice(0, 5)},${a.adong_jumin_10},${a.adong_jumin_10.slice(0, 8)},${a.시도},${a.시군구},${a.행정동}`);
  }
  writeFileSync(resolve(REFERENCE, "region-codes.csv"), regionLines.join("\n") + "\n", "utf8");
  console.log(`  → region-codes.csv 갱신: ${seoul.length} 행`);

  // reb-zone-mapping.csv 작성
  const zoneLines: string[] = [
    "# 행정동 → R-ONE 임대료 상권 매핑 (서울 25구 자동 휴리스틱)",
    "# 신뢰도: high(키워드 매칭) / low(구 단위 fallback)",
    "# Phase 2 에서 운영자 직접 라벨링으로 정확도 보강 예정",
    "adong_jumin_10,행정동,reb_zone,reb_zone_full,confidence,근거",
  ];
  let highCount = 0; let lowCount = 0; let noneCount = 0;
  for (const a of seoul) {
    const f = findZoneFor(a.시군구, a.행정동);
    if (!f) {
      zoneLines.push(`${a.adong_jumin_10},${a.행정동},,,none,매핑 실패`);
      noneCount++; continue;
    }
    const reason = f.confidence === "high" ? `'${a.행정동}' 에 키워드 포함` : `${a.시군구} fallback`;
    zoneLines.push(`${a.adong_jumin_10},${a.행정동},${f.zone.name},${f.zone.full},${f.confidence},${reason}`);
    if (f.confidence === "high") highCount++; else lowCount++;
  }
  writeFileSync(resolve(REFERENCE, "reb-zone-mapping.csv"), zoneLines.join("\n") + "\n", "utf8");
  console.log(`  → reb-zone-mapping.csv 갱신: high ${highCount} / low ${lowCount} / 없음 ${noneCount}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
