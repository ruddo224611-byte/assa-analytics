# Phase 1 Week 1 — ETL 골격 + 역삼1동×카페 e2e

**기간:** 2026-04-25 (1일에 압축 진행)
**범위:** 풀빌드 X. 골격 + 역삼1동 × 커피음료점 1건 산출물.

---

## 한 줄 요약

🟢 **end-to-end 통과.** 명령 한 줄로 raw 다운→정규화→머지→`cafe.json` 까지 자동.
운영자 직접 확인 섹션은 PR 본문에 별도 첨부.

```bash
npx tsx scripts/build-data.ts --adong 1168064000 --upjong 커피음료점
# → data/build/서울특별시/강남구/역삼1동/cafe.json
```

---

## Phase 0 발견사항 → Week 1 반영

| Phase 0 발견 | 반영 위치 |
|---|---|
| 행정동코드 자릿수 차이 (10↔8↔5) | `scripts/lib/region.ts` 의 `toAdongSbiz` / `toAdongJumin` / `toSignguCode` |
| API 키 활성화 60초 딜레이 (B553077) | `scripts/lib/sbiz.ts` 의 `callWithRetry` (403 시 60초 대기 후 1회 재시도) |
| R-ONE 상권 ≠ 행정동 1:1 | `data/reference/reb-zone-mapping.csv` (강남구 22개 best-match) + 산출물 `meta.신뢰도.임대료` 에 "상권 기준 + 매핑신뢰도" 명기 |
| R-ONE 페이지 한도 1,000 row | `scripts/lib/reb.ts` 의 `fetchAllRows` 자동 페이지네이션 |
| R-ONE 분기 데이터 발표 지연 (직전 분기 NODATA) | `fetchAllRowsWithFallback` — 4분기까지 자동 fallback |
| B553077 일 한도 10,000회 | `sbizMetrics.callCount` 로 누적 호출 모니터링 (Week 3 cron 분할 설계 시 활용) |

---

## 디렉터리 구조

```
data/
├── .gitignore                  # raw/ 무시
├── raw/{YYYYMM 또는 YYYY0Q}/   # 원본 캐시 (gitignored)
│   ├── jumin-household.csv
│   ├── jumin-age.csv
│   ├── nts-life100.csv
│   ├── sbiz-{adong8}-{indsScls}.json
│   └── reb-{statbl}.json
├── reference/                  # 매핑·taxonomy (committed)
│   ├── sbiz-upjong-codes.csv         # 공단 SBIZ 247
│   ├── taxonomy-nts-to-sbiz.csv      # NTS↔SBIZ 매핑
│   ├── region-codes.csv              # 행정동 표준 코드 (Week 1: 강남구 22개)
│   └── reb-zone-mapping.csv          # 행정동 → R-ONE 상권 (Week 1: 강남구 22개)
└── build/                      # 빌드 산출물 (committed)
    └── 서울특별시/강남구/역삼1동/cafe.json    # ★ Week 1 e2e 결과

scripts/
├── lib/                        # 공통 라이브러리
│   ├── encoding.ts
│   ├── env.ts
│   ├── paths.ts                # data/ 경로 + slugify
│   ├── region.ts               # 행정동 코드 변환 + region-codes 로딩
│   ├── sbiz.ts                 # B553077 fetcher (60초 재시도, 페이지네이션)
│   ├── reb.ts                  # R-ONE fetcher (페이지네이션, 분기 fallback)
│   ├── jumin.ts                # 행안부 CSV 다운 (인구·세대 + 연령)
│   ├── nts.ts                  # 국세청 100대 업종 CSV 다운
│   └── taxonomy.ts             # NTS↔SBIZ 매핑 로더
├── ingest/                     # 외부 → raw (CLI 진입점)
│   ├── ingest-jumin.ts
│   ├── ingest-sbiz.ts
│   ├── ingest-nts.ts
│   └── ingest-reb.ts
├── transform/                  # raw → 정규화
│   ├── normalize-region.ts     # region + reb-zone 매핑
│   ├── normalize-upjong.ts     # NTS↔SBIZ 정규화
│   └── merge-area.ts           # (지역, 업종) → 단일 산출물 객체
└── build-data.ts               # 진입점 (ingest 자동 호출 + transform + 저장)
```

기존 `scripts/fetch-*.ts` 4개는 Phase 0 검증 기록 / sample 갱신용으로 유지.

---

## 빌드 산출물 스키마 (실측)

`data/build/서울특별시/강남구/역삼1동/cafe.json` 핵심 필드:

| 섹션 | 필드 | 값 |
|---|---|---|
| meta.지역 | 행정동코드_jumin / sbiz | 1168064000 / 11680640 |
| meta.업종 | nts → sbiz_codes | 커피음료점 → ["I21201"] (카페) |
| meta.기준일 | 인구 / 업종 / 임대료 / 상가 | 2026-03 / 2025-08 / 2025-Q4 / 2026-04-25 |
| meta.신뢰도 | 임대료 | "상권 기준 (테헤란로, 매핑신뢰도 high)" |
| 수요 | 인구 / 세대 / 세대당 / 성비 | 34,113 / 23,824 / 1.43 / 0.96 |
| 수요 | 연령대 30대 / 20대 | 9,720 / 6,029 (오피스 1인가구 시그널) |
| 경쟁 | 반경500m / 반경1km / 강남구전체 / YoY | 177 / 495 / 1,375 / -1.7% |
| 임대료 | 1층 / 2층 / 지하1층 (테헤란로) | 51.8 / 33.2 / 18.9 천원/㎡ |
| 임대료 | 효용비율 (1층=100%) | 1층 100 / 2층 64 / 지하1층 36.7 % |
| 지원사업_links | 강남구 × 자금/교육/시설개선 | 3개 URL 빌더 (assasup) |

→ MVP 7섹션 리포트 (요약·수요·경쟁·임대료·시뮬레이터·지원사업·체크리스트) 의 **시뮬레이터 제외 6섹션** 에 그대로 mount 가능한 형태.

---

## 운영자 결정 사항 반영

| 결정 | 반영 |
|---|---|
| A. 풀스케일 (전국 × 100업종) | Week 1 은 골격만 — 전국 확장은 Week 2~3. 디렉터리·스키마는 풀스케일 가능하도록 구성 |
| B. NTS↔SBIZ 매핑 1% 검증 Week 2 끝 | Week 1 산출물에 매핑 결과 노출 (`meta.업종.sbiz_codes/sbiz_names/매핑유형`) — Week 2 끝에 운영자 검토 |
| C. R-ONE 상권 라벨링 Phase 2 | Week 1 은 임시 매핑 + `매핑신뢰도` 메타 — Phase 2 UI 라벨링 시 교체 |

---

## 다음 (Week 2) 진입 전 운영자 확인 필요

**PR 본문의 "운영자 직접 확인 필요" 섹션 참조.**

1. cafe.json 핵심 수치 확인
2. NTS↔SBIZ 매핑이 의미상 적절한지 샘플 검증
3. reb-zone-mapping 의 강남구 22개 best-match 가 합리적인지 (low confidence 행은 Phase 2 에서 운영자 직접 라벨링)

OK 받으면 Week 2 진입 — `scripts/transform/build-area.ts` 를 전국 22,000+ 행정동 × 100업종 매트릭스로 확장.
