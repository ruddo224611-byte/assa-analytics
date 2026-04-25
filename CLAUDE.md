# 아싸 상권분석 — 프로젝트 가이드

이 파일은 Claude Code 가 이 레포에 들어올 때 자동으로 읽는 영구 기록이다.
운영자가 별도 대화에서 합의한 맥락을 모아둔 단일 진입점이며, 매일 "Day N 시작" 한 줄로 자율 진행이 가능하도록 스스로 완결되도록 작성한다.

---

## 1. 프로젝트 개요

- **이름:** 아싸 상권분석
- **도메인:** `analytics.assasup.com` (서브도메인, 런칭 직전 연결)
- **현재 Vercel URL:** https://assa-analytics.vercel.app
- **목적:** 자영업 창업 예정자가 "이 자리에 카페 차려도 될까?" 를 데이터로 판단할 수 있게 돕기
- **자매 사이트:** https://assasup.com — 기존 운영 중인 지원사업 사이트. 같은 톤·같은 스택
- **수익 모델:** 구글 애드센스 + 추후 유료 리포트 가능성
- **운영자:** 네이버 카페 '아프니까 사장이다' 운영자 / 개발 초보 카페 사장

---

## 2. 제품 방향

**쿼리형 (지역 + 업종 입력 → 리포트 1장)** 을 선택.

이유:
- 롱테일 SEO (지역×업종 조합 수만 가지 페이지)
- assasup.com 과 동일 DNA (사용자 입력 → 맞춤 결과)
- 공단 상권분석 지도 사이트와 차별화 (우리는 "판단 돕기" 에 집중)

---

## 3. 기술 스택

- **프론트:** Next.js 14 App Router + Tailwind + TypeScript
- **폰트:** Pretendard (본문) + Gmarket Sans (헤더) via jsdelivr CDN
- **배포:** Vercel Hobby (Next.js Framework Preset, Root Directory = `web/`)
- **LLM:** Claude Haiku 4.5 (한 줄 요약·상권 별명 생성)
- **지도:** 카카오맵 JS SDK (리포트 페이지 임베드만)
- **라이트모드 전용:** `color-scheme: light` 로 다크 차단

---

## 4. MVP 기능 10개 (GPT 검증 반영 축소판)

| # | 기능 | 우선순위 |
|---|---|---|
| 1 | 쿼리형 리포트 페이지 (7섹션) | ⭐ |
| 2 | 반경 500m/1km 경쟁 업체 분석 | ⭐ |
| 3 | 거주 수요 (주민등록 인구·연령·세대) | ⭐ |
| 4 | 상권 벤치마크 임대료 (표본 기준 명시) |  |
| 5 | 창업 시뮬레이터 (낙관/기준/보수 3시나리오 BEP) | ⭐ |
| 6 | 지원사업 연동 (assasup 데이터 연계) | ⭐ |
| 7 | 카카오맵 작은 임베드 (경쟁점 핀) |  |
| 8 | 상권 비교 모드 (2개까지) |  |
| 9 | AI 한 줄 요약 (룰 엔진 판정 + LLM 설명, 녹/황/적 톤다운) | ⭐ |
| 10 | 상권 별명 한 줄 (리포트 내부) |  |

### 신뢰도 레이어 (필수)

모든 섹션에 **항상** 함께 노출:
- 데이터 기준일 카드
- 신뢰도 / 커버리지 표시 (예: "서울 한정", "시군구 단위")
- 현장 체크리스트 (데이터 밖 요소)
- 오류 신고 버튼
- 푸터 고정문: "참고용입니다 · 실제 창업 전 현장 확인 필수"

### Phase 2 (런칭 후) 로 미룬 기능

- 시간대별 유동인구 (서울 베타)
- 시군구 월간 개폐업 랭킹
- 시군구 뜨는/지는 월간 랭킹
- 커뮤니티 후기 연동

### 완전 드롭

- ❌ 업종 역추천 점수 로직 → "후보 업종 3개 + 이유" 설명으로 대체
- ❌ 수만 개 정적 URL 사전 생성 → on-demand ISR
- ❌ 녹/황/적 판정 → "데이터 요약" 톤다운

---

## 5. 데이터 소스 현황 (Day 4 종료 기준 · 2026-04-25)

| 소스 | 상태 | 비고 |
|---|---|---|
| 공공데이터포털 일반 인증키 | 🟡 | `.env.local` 의 `PUBLIC_DATA_API_KEY` — 15083033 네임스페이스만 활성 |
| 상가업소 통계 (odcloud 15083033) | 🟢 제한 | 작동하지만 집계만. POI·좌표 없음 |
| 상가 반경 검색 (B553077 baroApi) | 🟢 | **활용신청 승인·키 활성화 완료 (2026-04-25)**. `SBIZ_API_KEY` 사용. 역삼역 500m 카페 177건 실측 (역삼1동 152 + 역삼2동 25). 행정동코드는 jumin 의 10자리 → B553077 의 **8자리 (앞 8자리)** 변환 필요 |
| 행안부 주민등록 인구 (연령별) | 🟢 | `jumin.mois.go.kr/downloadCsvAge.do`, EUC-KR, 행정동 단위 |
| 행안부 주민등록 세대현황 | 🟢 | `jumin.mois.go.kr/downloadCsv.do` (statMonth), 인구·세대수·세대당 인구·성비 일괄 (Day 4 검증 완료) |
| NTS 100대 생활업종 (15061118) | 🟢 | EUC-KR CSV 직접 다운로드 OK. 100업종 × 256시군구 × 3시점 |
| NTS 신규사업자 월별 (15048949) | ⏳ | 개업 시계열용, 활용신청 후보 (선택) |
| REB 층별 임대료 (R-ONE OpenAPI) | 🟢 | **활용신청 승인·실호출 검증 완료 (2026-04-25)**. `REB_API_KEY` 사용. STATBL_ID `T241873134863890` (중대형상가). 분기당 ~4,270 row × 5 페이지(1,000 한도). 강남대로 1층 126.1 천원/㎡ 등 강남구 14개 상권 실측 |

### 환경변수 (`.env.local`)

- `PUBLIC_DATA_API_KEY` — 공공데이터포털 일반 인증키 (15083033 odcloud / NTS / 등)
- `SBIZ_API_KEY` — apis.data.go.kr B553077 baroApi 전용 (값은 PUBLIC_DATA_API_KEY 와 동일하지만 의미 분리)
- `REB_API_KEY` — reb.or.kr R-ONE OpenAPI (부동산원 임대동향 등) 전용
- `NEXT_PUBLIC_KAKAO_JS_KEY` — 카카오맵 JS 키 (클라이언트 노출 OK)
- `ANTHROPIC_API_KEY` (추후) — Claude Haiku 4.5 호출용

---

## 6. 레포 구조

```
.
├── web/                         # Next.js 앱 (Vercel 루트)
│   ├── src/app/
│   │   ├── layout.tsx           # 한국어, Gmarket Sans 헤더, 푸터
│   │   └── page.tsx             # 현재 placeholder 히어로
│   ├── tailwind.config.ts       # brand 팔레트 50~700, Pretendard fontFamily
│   └── .env.local               # gitignored
├── data/                        # Phase 1 ETL 디렉터리
│   ├── .gitignore               # raw/ 무시
│   ├── raw/{period}/            # 원본 캐시 (gitignored)
│   ├── reference/               # 매핑·taxonomy (committed)
│   │   ├── sbiz-upjong-codes.csv         # 공단 SBIZ 247 소분류
│   │   ├── taxonomy-nts-to-sbiz.csv      # NTS↔SBIZ 매핑
│   │   ├── region-codes.csv              # 행정동 표준 코드 (Week 1: 강남구 22개)
│   │   └── reb-zone-mapping.csv          # 행정동 → R-ONE 상권
│   └── build/                   # 빌드 산출물 (committed)
│       └── {시도slug}/{시군구slug}/{행정동slug}/{업종slug}.json
├── scripts/                     # 데이터 검증·ETL (npx tsx)
│   ├── lib/                     # 공통 라이브러리
│   │   ├── encoding.ts          # EUC-KR(CP949) → UTF-8
│   │   ├── env.ts               # .env.local 파서
│   │   ├── paths.ts             # data/ 경로 + slugify
│   │   ├── region.ts            # 행정동 코드 변환 (10↔8↔5)
│   │   ├── sbiz.ts              # B553077 (60초 재시도, 페이지네이션)
│   │   ├── reb.ts               # R-ONE (페이지네이션, 분기 fallback)
│   │   ├── jumin.ts             # 행안부 CSV (인구·세대·연령)
│   │   ├── nts.ts               # 국세청 100대 업종 CSV
│   │   └── taxonomy.ts          # NTS↔SBIZ 매핑 로더
│   ├── ingest/                  # 외부 → raw (CLI 진입점)
│   │   ├── ingest-jumin.ts
│   │   ├── ingest-sbiz.ts
│   │   ├── ingest-nts.ts
│   │   └── ingest-reb.ts
│   ├── transform/               # raw → 정규화
│   │   ├── normalize-region.ts
│   │   ├── normalize-upjong.ts
│   │   └── merge-area.ts        # (지역, 업종) → 단일 산출물
│   ├── build-data.ts            # ★ Phase 1 진입점 (ingest 자동 호출 + transform + 저장)
│   └── fetch-{sangga,ntax,jumin,reb}.ts   # (Phase 0 ad-hoc 검증 스크립트, 유지)
├── docs/
│   ├── ROADMAP.md               # Phase 0~5 전체 일정
│   ├── phase0/
│   │   ├── day{1..5}-*.md       # Phase 0 Day 별 기록
│   │   └── samples/             # Phase 0 검증 샘플
│   └── phase1/
│       └── week{1..3}.md        # Phase 1 Week 별 기록
├── CLAUDE.md                    # ← 이 파일
└── README.md
```

---

## 7. 협업 규칙 (중요)

운영자 특성상 **한 번의 실수가 큰 비용**이 되므로 아래는 예외 없이 준수:

1. **언어:** 모든 설명·주석·커밋 메시지·PR 제목/본문·문서는 **한국어**
2. **브랜치·PR 강제:**
    - 모든 작업은 새 브랜치 (`claude/phase{N}-day{M}-*` 또는 `claude/{topic}`)
    - PR 생성까지만. **머지는 운영자가 직접**
    - `main` 직접 푸시/머지 금지, 강제 푸시 금지
3. **옵션 제시 모드:** 중요 판단 갈림길에서는 **코드 바로 수정 말고 옵션 3가지 + 장단점** 제시 후 승인 대기
4. **파괴적 작업은 사전 확인:** 머지·배포·삭제·환경변수 변경 등은 반드시 먼저 확인
5. **복붙 가능한 한 줄:** 운영자는 코딩 거의 못하므로 터미널·GitHub UI 에서 바로 쓸 수 있는 한 줄 명령 제공

### 운영자 언어 → 의미 매핑

| 표현 | 의미 |
|---|---|
| 고고 / ㅇㅋ / 진행하자 | 승인 — 바로 진행 |
| "설명부터" | 코드 쓰지 말고 옵션 먼저 |
| "전수 검사" | 비슷한 이슈 다른 데도 있는지 모두 확인 |
| "한 줄 단위" | 터미널·UI 복붙 한 번으로 실행 가능하게 |

---

## 8. 매일 진행 방식 ("Day N 시작" 만으로 자율 운영)

운영자가 `Day 4 시작` 같이만 말해도 자율 진행되도록:

1. `docs/ROADMAP.md` 의 해당 Day 항목 읽기
2. 이전 Day 문서(`docs/phase{P}/day{N-1}-*.md`) 앞의 "다음 Day 조정 사항" 섹션 반영
3. 새 브랜치 `claude/phase{P}-day{N}-*` 생성
4. 작업 진행 → 산출물 (`docs/phase{P}/day{N}-*.md` + 샘플 + 스크립트)
5. ROADMAP 의 해당 체크박스 업데이트
6. 한국어 커밋 + PR 생성 → URL 만 알려줌

### 필수 점검 ("막히면 먼저 물어보기")

- 데이터 접근 403/401/인증키 이슈 → 사용자에게 "활용신청 상태" 질문
- 예상치 못한 스펙 변경 (필드·형식) → 옵션 제시 후 선택 받기
- 스코프 확장 유혹 생기면 참고 Phase 표와 ROADMAP 우선순위 확인

---

## 9. 용어집 (이 프로젝트에서 자주 쓰는 말)

- **상권:** 자영업자가 영업하는 지리적 범위. 우리 서비스에서는 "반경 500m~1km" 기본
- **업종(NTS 기준):** 국세청 100대 생활업종 리스트. MVP 의 업종 드롭다운 마스터
- **행정동 / 법정동:** 주민등록 인구는 행정동, 부동산 공적 대장은 법정동. 항상 명시
- **B553077:** 공단 상가 POI 반경검색 API 네임스페이스 (우리 MVP 의 핵심, 현재 블로커)
- **R-ONE:** 한국부동산원 부동산통계정보시스템 (reb.or.kr). 층별임대료의 실제 배포처

---

## 10. 참고 링크

- 자매 사이트 (레퍼런스): https://assasup.com
- Vercel 대시보드: https://vercel.com (프로젝트 `assa-analytics`)
- GitHub 레포: https://github.com/ruddo224611-byte/assa-analytics
- 공공데이터포털: https://www.data.go.kr
- 행안부 주민등록: https://jumin.mois.go.kr
- 부동산원 R-ONE: https://www.reb.or.kr/r-one
