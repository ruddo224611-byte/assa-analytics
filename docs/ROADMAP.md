# 아싸 상권분석 — 로드맵

Phase 0 부터 런칭(Phase 5) 까지 전체 일정. 이 파일은 매일 "Day N 시작" 한 줄로 자율 진행하기 위한 **진행 지시서** 겸 **체크리스트** 다.

진행 원칙은 [CLAUDE.md](../CLAUDE.md) 의 "협업 규칙" 참고.

---

## Phase 0 — 셋업 + 데이터 검증 (1주)

기본 인프라 세우고, 필요한 공공데이터 6종의 실제 가용성을 하나씩 확인.

- [x] **Day 1:** Next.js 초기 셋업, Vercel 배포 ([PR #1](https://github.com/ruddo224611-byte/assa-analytics/pull/1))
- [x] **Day 2:** 상가업소 API (odcloud 15083033 + B553077) + 주민등록 인구 CSV 검증 ([PR #2](https://github.com/ruddo224611-byte/assa-analytics/pull/2))
- [x] **Day 3:** 국세청 100대 생활업종 + 부동산원 임대동향조사 검증 + 프로젝트 문서화(CLAUDE.md / ROADMAP.md / encoding 공용 유틸)
- [x] **Day 4:** 주민등록 세대현황 검증 완료 / 누적 종합 판정 / **B553077 활용신청 승인·실호출 (역삼역 500m 카페 177건, 2026-04-25)** / **R-ONE OpenAPI 활용신청 승인·실호출 (강남구 14개 상권 층별임대료, 2026-04-25 — 강남대로 1층 126.1 천원/㎡ 등)**
- [x] **Day 5:** NTS↔SBIZ 매핑 99% 커버 + Phase 1 디렉터리·스키마·스케줄 확정 (assasup 은 업종 축 X → URL 빌더로 우회)

---

## Phase 1 — ETL 파이프라인 (2~3주)

검증된 소스들을 주기적으로 수집·정제·빌드 산출물로 떨어뜨리는 워크플로 구축. 디렉터리·스키마는 [docs/phase0/day5-taxonomy-and-design.md](phase0/day5-taxonomy-and-design.md) 참고.

- [x] **Week 1:** ingest/transform/build-data 골격 + 강남구 22개 reference 매핑 + 역삼1동×커피음료점 e2e 산출 (`data/build/서울특별시/강남구/역삼1동/cafe.json`). Phase 0 발견사항 5건 모두 반영 (10↔8 자릿수, 60초 재시도, REB 분기 fallback, 페이지네이션, 호출 카운터)
- [ ] **Week 2:** 전국 22,000+ 행정동 × 100업종 풀스케일 빌드. NTS↔SBIZ 매핑 1% 운영자 검증 (Week 끝). reference 매핑(region-codes / reb-zone-mapping) 전국 확장
- [ ] **Week 3:** `.github/workflows/etl.yml` 월/분기 cron + B553077 일한도(10,000) 고려한 시도별 3일 분할 + 자동 PR 생성 워크플로 + 데이터 변경 PR 머지 → Vercel 자동 재배포 검증

---

## Phase 2 — 리포트 페이지 MVP (2~3주)

쿼리형 리포트 페이지를 실제로 볼 수 있는 형태로.

- [ ] 지역 · 업종 선택 UI
- [ ] 리포트 템플릿 (7섹션: 요약 · 수요 · 경쟁 · 임대료 · 시뮬레이터 · 지원사업 · 체크리스트)
- [ ] 창업 시뮬레이터 (낙관 / 기준 / 보수 3시나리오 BEP)
- [ ] 지원사업 연동 (assasup 데이터 참조)
- [ ] 카카오맵 임베드 (경쟁점 핀)

---

## Phase 3 — AI + 특색 (1~2주)

LLM 으로 리포트에 "개성" 부여.

- [ ] 룰 엔진 점수 (숫자 기반 판정)
- [ ] LLM (Claude Haiku 4.5) 한 줄 요약 + 상권 별명
- [ ] 후보 업종 3개 설명 (업종 역추천 점수 로직 대체)

---

## Phase 4 — 신뢰도 UI + 비교 모드 (1주)

"참고용이지 맹신하지 말 것" 이 디폴트로 보이도록.

- [ ] 데이터 기준일 카드 (각 섹션)
- [ ] 현장 체크리스트 (데이터 밖 요소)
- [ ] 오류 신고 버튼
- [ ] 상권 비교 모드 (최대 2개 병행)
- [ ] PDF / 공유 링크 기능
- [ ] on-demand ISR 설정 (SEO + 캐시)

---

## Phase 5 — 런칭

- [ ] `analytics.assasup.com` 서브도메인 Vercel 연결
- [ ] SEO 메타 / OG 이미지 / sitemap.xml
- [ ] Google Analytics 4 연결
- [ ] 애드센스 심사 신청

---

## 런칭 후 (Phase 2 로 기록했던 확장 기능들 ≠ 여기서는 Phase 5+)

- 시간대별 유동인구 (서울 베타)
- 시군구 월간 개폐업 랭킹
- 시군구 뜨는/지는 월간 랭킹
- 커뮤니티 후기 연동

---

## 진행 상태 한눈에

| Phase | 기간 | 완료 | 진행 |
|---|---|:---:|:---:|
| 0 — 셋업·검증 | 1주 | **5 / 5 Day ✅** | Phase 1 진입 |
| 1 — ETL | 2~3주 | — | 대기 |
| 2 — 리포트 MVP | 2~3주 | — | 대기 |
| 3 — AI 특색 | 1~2주 | — | 대기 |
| 4 — 신뢰도 UI | 1주 | — | 대기 |
| 5 — 런칭 | — | — | 대기 |
