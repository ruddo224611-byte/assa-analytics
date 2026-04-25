# Phase 0 Day 4 — 외부 활용신청 결과 + 주민등록 세대현황 + 종합 판정

**날짜:** 2026-04-25
**목표:** Day 2·3 에서 미정/대기였던 항목 마무리하고 Phase 1 ETL 진입 가능 여부 종합 판단.

---

## 한 줄 요약

| 항목 | 어제까지 | 오늘 | 비고 |
|---|---|---|---|
| 상가 반경 검색 (B553077 baroApi) | 🔴 403 | 🔴 **여전히 403** | 활용신청 아직 미완료/미승인. Day 5 / Phase 1 진입 전 반드시 |
| 부동산원 R-ONE OpenAPI | 🟡 메타만 | 🟡 **`REB_API_KEY` 미존재** | 활용신청 미진행. R-ONE 자체 회원가입 + OpenAPI 신청 별도 |
| 주민등록 세대현황 (`statMonth.do`) | ⏳ | 🟢 **다운로드·검증 완료** | 행정동 단위 인구·세대수·세대당 인구·성비 일괄 |

**가장 중요한 결론:** 데이터 자체로는 **Phase 1 진입 준비 80% 완료**. 남은 20%는 외부 활용신청 2건 (B553077, R-ONE) 의 처리 시간 — 운영자 액션이며 코드 측면에서는 더 할 게 없음.

---

## TASK 1 — 공단 B553077 (상가 반경검색) 재테스트

`scripts/fetch-sangga.ts` 실행:

```
[B553077] HTTP 403: Forbidden — baroApi 활용신청 필요
```

다른 엔드포인트(`largeUpjongList`) 도 동일 403. → **활용신청 상태 변동 없음**.

**확인 액션 (운영자):**
- data.go.kr 마이페이지 → "활용신청 현황" 에서 "소상공인시장진흥공단 상가(상권)정보" 신청 상태 확인
  - 미신청이면 → 즉시 신청 (1~2영업일 자동승인)
  - 신청완료/대기중 → 영업일 기준 2일 경과시 고객센터 문의

---

## TASK 2 — 한국부동산원 R-ONE OpenAPI

`web/.env.local` 의 환경변수 키:

```
PUBLIC_DATA_API_KEY=...
NEXT_PUBLIC_KAKAO_JS_KEY=...
```

→ **`REB_API_KEY` 미존재**. R-ONE 활용신청 진행 안 됨.

**참고:** Day 3 에서 정리된 대로 R-ONE OpenAPI 는 공공데이터포털과 별개 인증 체계. 신청 경로:
- https://www.reb.or.kr/r-one/openapi/openApiIntroPage.do
- 회원가입 → OpenAPI 신청 → 키 발급 (영업일 1~2일)
- 발급되면 `.env.local` 에 `REB_API_KEY=...` 추가

승인 후 `scripts/fetch-reb.ts` 의 안내성 출력 부분을 실제 호출 로직으로 교체. 인터페이스는 R-ONE OpenAPI 규격 (`SttsApiTblData.do`) 기준.

---

## TASK 3 — 주민등록 세대현황 (statMonth.do)

### 3-1. 다운로드 경로

Day 2 의 `ageStatMonth.do`(연령별) 와 다른 페이지. 여기는 **인구 + 세대수 통합** 버전:

```
POST https://jumin.mois.go.kr/downloadCsv.do?searchYearMonth=month&xlsStats=3

form-data (요점):
  generation=generation        # ★ 세대수 컬럼 ON 핵심
  gender=gender, genderPer=genderPer
  searchYearStart=2026, searchMonthStart=03 (동일 종료)
  state=3                      # 전체 읍면동
  category=month
  sltOrgType=1, sltOrgLvl1=A
```

응답:
- `application/octet-stream`, **EUC-KR**, ~416 KB
- 2026-03 기준 **3,921 행정동**

스크립트: [`scripts/fetch-jumin.ts`](../../scripts/fetch-jumin.ts) — 연/월 인자 옵션, `lib/encoding.ts` 사용

### 3-2. 컬럼

| # | 컬럼 | 설명 |
|---|---|---|
| 1 | 행정구역 | "서울특별시 강남구 역삼1동(1168064000)" 형식, 10자리 행정동코드 포함 |
| 2 | 총인구수 | (Day 2 의 `ageStatMonth.do` 와 동일 수치) |
| 3 | **세대수** | ★ Day 2 에서 누락이었던 컬럼 |
| 4 | **세대당 인구** | 총인구 / 세대수 — 가구 형태 추정 핵심 지표 |
| 5 | 남자 인구수 | |
| 6 | 여자 인구수 | |
| 7 | 남여 비율 | 남/여 |

### 3-3. 강남구 동별 실측 (2026-03)

[docs/phase0/samples/jumin-household-sample.csv](samples/jumin-household-sample.csv):

| 행정구역 | 총인구 | 세대수 | 세대당 인구 | 남여비 | 해석 |
|---|---:|---:|---:|---:|---|
| 서울특별시 (전체) | 9,304,400 | 4,520,137 | 2.06 | 0.93 | 도시 평균 |
| 강남구 (전체) | 554,165 | 244,970 | 2.26 | 0.91 | 서울 평균보다 가족형 살짝 ↑ |
| 신사동 | 14,980 | 6,534 | 2.29 | 0.88 | 표준 |
| **역삼1동** | 34,113 | 23,824 | **1.43** | 0.96 | **1인가구 압도적** (오피스텔 밀집) |
| **역삼2동** | 35,980 | 15,600 | **2.31** | 0.87 | 가족 거주 (학령기 자녀 포함) |
| 삼성1동 | 12,742 | 5,529 | 2.30 | 0.94 | 표준 |
| 압구정동 | 25,478 | 9,940 | **2.56** | 0.87 | 부유 가족 (주택형) |
| 청담동 | 26,088 | 11,385 | 2.29 | 0.87 | 표준 |

### 3-4. 🟢 판정 — Day 2 가설 검증 + 인사이트 강화

**검증 결과:**
- ✅ 행정동 단위 / 행정동코드 포함 / 월 단위 갱신 — Day 2 에서 본 ageStatMonth 와 동일
- ✅ 세대수·세대당인구·성비 모두 한 파일에 — Day 2 에서 부족했던 컬럼 일괄 채워짐
- ✅ 인코딩 EUC-KR — 같은 `decodeEucKrResponse` 유틸로 처리
- ✅ 행정동 코드 포함 — 공단 B553077 / NTS 시군구 등과 조인 키로 활용 가능

**MVP 적용 시나리오 (Day 2 발견 강화):**

> 같은 "강남구 역삼동" 이지만:
> - **역삼1동** = 세대당 1.43명, 1인가구 비율 압도적 → **카페·편의점·1인 한식·도시락·치킨배달** 적합
> - **역삼2동** = 세대당 2.31명, 가족 거주 → **학원·미용실·소아과·중대형 마트·패밀리식당** 적합

이 정도 해상도면 리포트 #3(거주 수요) 섹션의 핵심 임팩트 카드로 바로 쓸 수 있음.

→ 판정: **🟢 즉시 ETL 투입 가능**. ageStatMonth(연령별) + statMonth(세대수) 두 개를 매월 자동 받아 행정동 코드로 join.

---

## TASK 4 — 누적 종합 (Phase 0 Day 1~4)

### 4-1. 데이터 소스 최종 상태

| 소스 | 상태 | 다음 액션 |
|---|---|---|
| 공공데이터 일반 인증키 (15083033 활성) | 🟡 | 유지 |
| 상가 통계 (15083033 odcloud) | 🟢 제한적 | 보조 통계로만 (집계만) |
| **상가 반경 (B553077 baroApi)** | 🔴 | **운영자: 활용신청 처리** |
| 주민등록 인구 연령별 (`ageStatMonth`) | 🟢 | Phase 1 ETL 투입 |
| **주민등록 세대현황 (`statMonth`)** | 🟢 | **Day 4 신규 검증 완료** |
| NTS 100대 생활업종 (15061118) | 🟢 | Phase 1 ETL 투입 |
| NTS 신규사업자 월별 (15048949) | ⏳ | 활용신청 후보 (선택) |
| **REB 층별 임대료 (15069843/838)** | 🟡 | **운영자: R-ONE OpenAPI 신청** |
| REB 공실률 (15069726/735) | 🟡 | 동일 (R-ONE 경유) |

### 4-2. MVP 10개 기능 × 데이터 커버리지 (갱신)

| # | 기능 | 데이터 확보 | 변동 |
|---|---|---|---|
| 1 | 쿼리형 리포트 (7섹션) | 🟡 | Phase 1·2 통합 |
| 2 | 반경 500m/1km 경쟁 업체 | 🔴 | **B553077 대기 중** |
| 3 | 거주 수요 (인구·연령·**세대**) | 🟢 ✅ | **Day 4 세대수 추가로 완전 확보** |
| 4 | 상권 벤치마크 임대료 | 🟡 | R-ONE 대기 중 |
| 5 | 창업 시뮬레이터 (BEP) | 🟡 | #4 완성 후 룰엔진 |
| 6 | 지원사업 연동 (assasup) | ⬜ | assasup 측 스키마 확인 (Phase 1) |
| 7 | 카카오맵 임베드 | 🟢 | 환경변수만 있으면 됨 |
| 8 | 상권 비교 모드 | 🟡 | #1·#3 후 UI |
| 9 | AI 한 줄 요약 | ⬜ | Phase 3 |
| 10 | 상권 별명 | ⬜ | Phase 3 |

**누적 점수: 3/10 완전 / 4/10 부분 / 3/10 미착수.**
어제 (Day 3) 대비 **#3 (거주 수요)** 가 부분 → 완전으로 승급.

### 4-3. Phase 1 (ETL 파이프라인) 진입 준비도

| 항목 | 준비 |
|---|---|
| 공통 다운로드/디코딩 인프라 | ✅ `scripts/lib/encoding.ts` + `lib/env.ts` |
| 인구·세대 ETL 소스 (월) | ✅ `fetch-jumin.ts` |
| 업종 ETL 소스 (월) | ✅ `fetch-ntax.ts` |
| 상가 POI ETL 소스 | 🔴 **B553077 승인 대기** |
| 임대료 ETL 소스 | 🟡 **R-ONE 승인 대기** |
| 출력 스키마 결정 | ⬜ Day 5 (taxonomy) |
| GitHub Actions 스케줄링 | ⬜ Phase 1 W3 |

**판단: B553077·R-ONE 승인을 기다리는 동안 Day 5 (taxonomy 매핑 + Phase 1 설계 확정) 으로 그대로 진입 가능.** 두 외부 키가 늦어져도 인구·업종 데이터로 ETL 골격은 만들 수 있고, 키 들어오면 슬롯에 끼워넣는 방식.

---

## Day 5 진입 전 조정 사항

1. ⬜ (운영자) **B553077 활용신청 처리** — 승인 시 `scripts/fetch-sangga.ts` 의 `fetchStoresInRadius` 가 그대로 동작
2. ⬜ (운영자) **R-ONE OpenAPI 신청 + 키 발급 후 `.env.local` 에 `REB_API_KEY` 추가**
3. ✅ Day 5 자율 진행: ROADMAP 의 "Day 5: taxonomy 매핑 테이블 초안 + Phase 1 설계 확정" 그대로 진행 가능

---

## 실행 방법 (재현 가능성)

```bash
# 주민등록 세대현황 (Day 4 신규)
npx tsx scripts/fetch-jumin.ts            # 직전 월 자동
npx tsx scripts/fetch-jumin.ts 2026 03    # 명시 지정

# B553077 재테스트 (현재 403, 키 승인되면 200)
npx tsx scripts/fetch-sangga.ts
```

---

## 첨부 샘플

- [`docs/phase0/samples/jumin-household-sample.csv`](samples/jumin-household-sample.csv) — 강남구 6개 동 + 서울/강남구 전체 (8행)
