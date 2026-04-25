# Phase 0 Day 5 — Taxonomy 매핑 + Phase 1 설계 확정

**날짜:** 2026-04-25
**목표:** Phase 0 마무리. (1) NTS 100업종 ↔ 공단 SBIZ 247소분류 ↔ assasup.com 의 매핑 체계 정리, (2) Phase 1 ETL 파이프라인 설계 확정.

---

## 한 줄 요약

| 항목 | 결과 |
|---|---|
| NTS 100업종 → SBIZ 매핑 | 🟢 **99% 커버** (75개 1:1, 24개 1:N, 1개 NTS_only) |
| assasup.com 매핑 | 🟡 **업종 축이 직접 없음** — "지역×지원내용" 으로 우회 매핑 설계 |
| Phase 1 ETL 설계 | 🟢 디렉터리·스키마·스케줄 확정. Phase 1 W1 진입 가능 |

**가장 중요한 결론:** Phase 0 정의된 모든 데이터 소스의 **분류 체계 통합 키** 가 결정됐다. Phase 1 Week 1 부터 ETL 가동 가능.

---

## TASK 1 — Taxonomy 매핑

### 1-1. 데이터 표준 출처

세 시스템이 모두 다른 분류 체계 사용:

| 시스템 | 분류 단위 | 코드 예시 | 출처 |
|---|---|---|---|
| **NTS 100대 생활업종** | 단일 평면 100개 | `커피음료점`, `한식음식점` (텍스트) | `15061118` 파일데이터 |
| **공단 SBIZ (B553077)** | 대(10) / 중(75) / 소(247) | `I21201` (카페), `S20701` (미용실) | `15067631` 업종코드 파일 |
| **assasup.com** | **업종 축 없음** | 지원사업 분류는 [지원대상 / 지원내용 / 지역] 3축 | sitemap 분석 |

### 1-2. NTS ↔ SBIZ 매핑 (산출물: [`taxonomy-nts-to-sbiz.csv`](samples/taxonomy-nts-to-sbiz.csv))

총 **100개 NTS 업종 매핑 결과:**

| 매핑유형 | 갯수 | 의미 | 예시 |
|---|---:|---|---|
| `1:1` | **75** | NTS 한 업종 = SBIZ 한 소분류 | 커피음료점 → I21201 (카페) |
| `1:N` | **24** | NTS 한 업종이 SBIZ 여러 소분류 합 | 한식음식점 → I20101~I20199 (14개 합산) |
| `NTS_only` | 1 | SBIZ 분류 체계에 없음 | 통신판매업 (점포 없는 온라인) |
| `TODO` | 0 | — | — |

**커버율 99%** (점포 기반 100% / 통신판매업만 SBIZ 미존재).

대표 매핑:

| NTS 업종 | SBIZ 대분류 | SBIZ 소분류 코드 | SBIZ 소분류명 |
|---|---|---|---|
| 커피음료점 | I2 음식점업 | I21201 | 카페 |
| 한식음식점 | I2 음식점업 | I20101 ~ I20199 (14개) | 백반·국탕·족발…기타 한식 |
| 미용실 | S2 수리/개인 | S20701 | 미용실 |
| 부동산중개업 | L1 부동산업 | L10203 | 부동산 중개/대리업 |
| pc방 | R1 예술/스포츠/여가 | R10406 | PC방 |
| 약국 | G2 소매업 | G21501 | 약국 |
| 주유소 | G2 소매업 | G21401 | 주유소 |
| 편의점 | G2 소매업 | G20405 | 편의점 |
| 종합병원 | Q1 보건의료업 | Q10101 | 종합병원 |
| 치과의원 | Q1 보건의료업 | Q10210 | 치과의원 |

### 1-3. 검증 / 사용 방법

- 매핑 CSV 컬럼: `nts_업종, 매핑유형, sbiz_대분류코드, sbiz_대분류명, sbiz_소분류코드(;), sbiz_소분류명(;), 비고`
- 1:N 행은 코드/이름이 `;` 구분 멀티값. 합산하려면 split 후 sum
- "수기 검증" 표시는 정확 매핑, "1:N 매핑" 은 의미 그룹 매핑 — 추후 운영자 검수 권장 (특히 음식점 1:N 분배 로직)

### 1-4. assasup.com 연계 (별도 처리)

assasup.com 은 **업종 분류 축이 없음** (지원대상/지원내용/지역 3축). 따라서:

- ❌ "NTS 카페 → assasup 업종 코드" 로 매핑 불가
- ✅ 대신 **(지역) + (지원내용 키워드)** 로 외부 링크 만들기:
  - 사용자가 "강남구 카페" 리포트 보면, 리포트의 "지원사업" 섹션에:
    - assasup.com `/?region=강남구&category=자금·대출` 링크 (소상공인 전체)
    - assasup.com `/?region=강남구&category=교육` 링크
  - 즉 **카테고리 매핑이 아니라 URL 파라미터 빌더**로 처리

→ 이 방식은 Phase 2 (리포트 페이지) 에서 컴포넌트화. 별도 매핑 테이블 불필요.

---

## TASK 2 — Phase 1 ETL 설계

### 2-1. 데이터 흐름 (overview)

```
[외부 소스]                  [수집/디코딩]                [정제·통합]                  [빌드 산출물]
─────────────                ──────────────              ───────────────              ───────────────
공공데이터·jumin·NTS·R-ONE  →  scripts/ingest/  →  scripts/transform/  →  data/build/{지역}/{업종}.json
                                (raw EUC-KR)        (UTF-8 normalized)         (Next.js ISR 인풋)
```

### 2-2. 디렉터리 구조 (Phase 1 시작 시 생성)

```
.
├── scripts/
│   ├── lib/                  # 기존 (encoding, env)
│   ├── ingest/               # ★ 신규: 원본 다운로드만 (raw 보관)
│   │   ├── jumin-age.ts      # ageStatMonth.do
│   │   ├── jumin-household.ts # statMonth.do
│   │   ├── ntax-life100.ts   # 15061118
│   │   ├── sangga-radius.ts  # B553077 (승인 후)
│   │   └── reb-rent.ts       # R-ONE OpenAPI (승인 후)
│   ├── transform/            # ★ 신규: 정제·매핑·통합
│   │   ├── normalize-region.ts    # 행정동 코드 통일
│   │   ├── apply-taxonomy.ts      # NTS→SBIZ 매핑 적용
│   │   └── build-region-upjong.ts # (지역, 업종) 별 단일 문서로 머지
│   └── build-data.ts         # ★ 신규: 위 단계 orchestration 진입점
├── data/                     # ★ 신규
│   ├── raw/                  # gitignored — 원본 CSV 캐시
│   │   └── YYYYMM/
│   ├── reference/            # commit — 참조 테이블
│   │   ├── taxonomy-nts-to-sbiz.csv
│   │   ├── sbiz-upjong-codes.csv
│   │   └── region-codes.csv  # 행정동·시군구 표준 코드
│   └── build/                # commit — 페이지 ISR 인풋
│       └── seoul/
│           └── gangnam/
│               └── yeoksam-1-dong/
│                   └── cafe.json
├── web/                      # 기존 Next.js 앱
└── docs/
    └── phase1/               # ★ 신규: Phase 1 진행 기록
```

### 2-3. 빌드 산출물 JSON 스키마 (단일 리포트 인풋)

`data/build/{시도}/{시군구}/{행정동}/{업종_slug}.json`

```jsonc
{
  "meta": {
    "지역": { "시도": "서울특별시", "시군구": "강남구", "행정동": "역삼1동", "행정동코드": "1168064000" },
    "업종": { "name": "커피음료점", "nts": "커피음료점", "sbiz": ["I21201"] },
    "기준일": { "인구": "2026-03", "업종": "2025-08", "임대료": "2025-Q1", "상가": "2025-Q4" },
    "신뢰도": { "coverage": "행정동", "캐시업데이트": "2026-04-25T..." }
  },
  "수요": {
    "인구": 34113,
    "세대": 23824,
    "세대당인구": 1.43,
    "성비": 0.96,
    "연령대": { "20s": 6029, "30s": 9720, "40s": 6153, "전체": [...] }
  },
  "경쟁": {
    "반경500m": { "동일업종": 42, "유사업종": 88 },
    "반경1km": { "동일업종": 153, "유사업종": 312 },
    "시군구내_업소수": 1375,         // NTS 강남구 커피음료점
    "시군구_YoY": -0.017             // 전년동월 대비
  },
  "임대료": {
    "상권": "강남대로",
    "분기": "2025-Q1",
    "층별": { "1층": 0, "2층": 0, "지하1층": 0 }, // R-ONE 활용신청 후 채움
    "단위": "천원/㎡"
  },
  "지원사업_links": [
    { "label": "강남구 + 자금·대출", "url": "https://assasup.com/?region=강남구&category=자금·대출" },
    { "label": "강남구 + 교육", "url": "https://assasup.com/?region=강남구&category=교육" }
  ]
}
```

설계 포인트:
- **신뢰도 메타** 항상 포함 → 리포트 UI 의 "데이터 기준일 카드" 에 그대로 mount
- 임대료 등 미확보 데이터는 **null/0 으로 placeholder** + 메타에 기준일 누락 표시
- assasup 연계는 **URL 빌더만** 저장 (런타임 에서 a tag 렌더)

### 2-4. 실행 스케줄

| 데이터 | 갱신 주기 | Action 트리거 |
|---|---|---|
| 주민등록 인구 (jumin) | 월 1회 (매월 초~중순 익월 데이터) | cron `0 8 5 * *` (매월 5일) |
| 주민등록 세대 (jumin) | 월 1회 | 동일 (위와 같은 워크플로) |
| NTS 100대 업종 (15061118) | 월 1회 | cron `0 9 5 * *` |
| 상가 POI (B553077) | 월 1회 (분기 갱신) | cron `0 10 5 * *` |
| 부동산원 임대료 (R-ONE) | 분기 1회 | cron `0 11 15 1,4,7,10 *` (분기 1·4·7·10월 15일) |

→ `.github/workflows/etl.yml` 1개 파일에 cron 트리거 5개 + `npm run build:data` 가 각각 ingest → transform → build 호출.

### 2-5. 매월 1회의 자동화된 작업 흐름

1. GitHub Actions cron 트리거
2. `scripts/ingest/*` 가 외부 다운로드 → `data/raw/YYYYMM/` 저장
3. `scripts/transform/*` 가 정규화·taxonomy 매핑 적용
4. `scripts/build-data.ts` 가 (지역×업종) 매트릭스로 머지 → `data/build/` 갱신
5. 변경 사항 자동 PR 생성 → 운영자 머지 → Vercel 자동 재배포 (Next.js ISR이 새 JSON 인식)

이 방식의 장점:
- 운영자가 main 직접 푸시할 필요 없음 (CLAUDE.md 협업 규칙 준수)
- 데이터 변경 PR 의 diff 로 갱신 내용 한눈에 확인
- 이상 데이터 발견 시 PR 머지 거부만 하면 롤백 자동

---

## TASK 3 — Phase 0 회고 + Phase 1 진입 점검

### 3-1. Phase 0 5일 누적 결과

| Day | 핵심 산출물 | PR |
|---|---|---|
| 1 | Next.js 셋업 + Vercel 배포 | #1 |
| 2 | 상가 API + 주민등록 인구 검증 | #2 |
| 3 | 국세청 + 부동산원 검증 + CLAUDE.md/ROADMAP/유틸 | #3 |
| 4 | 주민등록 세대현황 + 종합 판정 | #4 |
| 5 | Taxonomy 매핑 + Phase 1 설계 확정 | (이번 PR) |

### 3-2. Phase 1 진입 가능 여부

| 점검 항목 | 상태 |
|---|---|
| 다운로드 스크립트 (NTS/jumin) | ✅ 완성 (Day 3·4) |
| 인코딩 처리 공용 유틸 | ✅ `lib/encoding.ts` |
| 환경변수 관리 | ✅ `lib/env.ts` |
| 분류 체계 통합 매핑 | ✅ `taxonomy-nts-to-sbiz.csv` (Day 5) |
| Phase 1 디렉터리·스키마·스케줄 설계 | ✅ (Day 5) |
| **B553077 활용신청** | 🔴 **운영자 처리 대기 중** |
| **R-ONE OpenAPI 활용신청** | 🟡 **운영자 처리 대기 중** |

→ **Phase 1 Week 1 진입 OK.** B553077·R-ONE 슬롯은 비워둔 채 ETL 골격을 먼저 만들고, 키 들어오면 해당 ingest 스크립트만 실제 호출 코드로 교체하는 방식.

---

## 첨부 산출물

- [`docs/phase0/samples/sbiz-upjong-codes.csv`](samples/sbiz-upjong-codes.csv) — 공단 SBIZ 247 소분류 전체 (10/75/247)
- [`docs/phase0/samples/taxonomy-nts-to-sbiz.csv`](samples/taxonomy-nts-to-sbiz.csv) — NTS 100업종 → SBIZ 매핑 (커버 99%)

## Phase 1 Week 1 시작점

ROADMAP 의 다음 작업:
> Phase 1 Week 1: 상가업소 + 주민등록 인구 수집 스크립트 → 지역·업종별 JSON 산출

→ 새 worktree / 브랜치 `claude/phase1-week1-etl-core` 에서 위 디렉터리 구조대로 `scripts/ingest/`, `scripts/transform/`, `scripts/build-data.ts` 골격 작성하면서 시작.
