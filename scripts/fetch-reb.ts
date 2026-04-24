/**
 * 한국부동산원 "상업용부동산 임대동향조사" 층별 임대료 데이터 확인 스크립트.
 *
 * 실행법:
 *   npx tsx scripts/fetch-reb.ts
 *
 * === 현재 상태 (2026-04-25 기준) ===
 *
 * data.go.kr 의 REB 관련 파일데이터(15069843 중대형 층별임대료, 15069838 소규모 층별임대료 등)는
 *   - 메타데이터만 data.go.kr 에 있고 (`atachFileYn: N`)
 *   - 실제 파일은 **R-ONE 부동산통계정보시스템** 으로 리다이렉트됨
 *     dataUrl: https://www.reb.or.kr/r-one/portal/stat/easyStatPage/T241873134863890.do
 *   - R-ONE 은 자체 UI / 자체 OpenAPI 를 가지며, 공공데이터포털 인증키와 별개
 *
 * 따라서 자동화 다운로드를 위해서는 아래 중 하나:
 *   A. R-ONE OpenAPI 활용신청 (www.reb.or.kr/r-one/openapi/openApiIntroPage.do)
 *   B. R-ONE UI 에서 수기 다운로드 후 docs/phase0/samples/rent-sample.csv 갱신
 *
 * 이 스크립트는 현재 B 경로(수기)를 안내만 출력.
 * A 경로 활용신청 완료 시, 이 파일을 실제 API 호출 로직으로 교체.
 */

const REB_DATASETS = [
  {
    id: "15069843",
    name: "중대형상가 층별임대료 및 층별효용비율",
    latestBase: "20250331", // 2025년 1분기
    roneUrl:
      "https://www.reb.or.kr/r-one/portal/stat/easyStatPage/T241873134863890.do",
  },
  {
    id: "15069838",
    name: "소규모상가 층별임대료 및 층별효용비율",
    latestBase: "20250331",
    roneUrl:
      "https://www.reb.or.kr/r-one/portal/stat/easyStatPage/T241873134863890.do",
  },
  {
    id: "15069726",
    name: "소규모상가 공실률",
    latestBase: "20240930",
    roneUrl:
      "https://www.reb.or.kr/r-one/portal/stat/easyStatPage/T241873134863890.do",
  },
];

function main() {
  console.log("한국부동산원 상업용부동산 임대동향조사 — 데이터 접근 안내\n");
  console.log("data.go.kr 에서 파일 직접 다운로드 불가 (메타만 공개).");
  console.log("아래 dataset 은 R-ONE 포털에서 수기 / 또는 OpenAPI 로만 접근 가능:\n");
  for (const d of REB_DATASETS) {
    console.log(
      `  [${d.id}] ${d.name}  (최신: ${d.latestBase})\n    → ${d.roneUrl}`,
    );
  }
  console.log("\n활용신청 / 수기 다운로드 후 docs/phase0/samples/rent-sample.csv 업데이트 권장.");
}

main();
