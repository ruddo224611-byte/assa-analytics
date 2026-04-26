# Phase 2 Day 1 — 역삼1동 × 카페 리포트 페이지 e2e

**날짜:** 2026-04-26
**작업:** Phase 1 의 결과 (`data/build/.../강남구.json`) 를 사용자가 보는 첫 화면으로. 역삼1동 × 카페 1 페이지 완성 → 그 후 일반화 (Phase 0/1 패턴 동일).

---

## 결과

🟢 **역삼1동 × 카페 리포트 페이지 1개 완성. 로컬 + production build 통과.**

URL 패턴: `/report/{시도}/{시군구}/{행정동}/{업종}` (한글 그대로)

예시:
```
http://localhost:3000/report/서울특별시/강남구/역삼1동/커피음료점
```

7섹션 모두 데이터 표시:

| # | 섹션 | 내용 |
|---|---|---|
| 1 | 헤더 | 시도·시군구·행정동 칩 + 업종 H1 + 4개 기준일 카드 |
| 2 | 거주 수요 | 인구 / 세대 / 세대당 (1인가구·가족 자동 라벨) / 성비 + 연령대 막대 차트 |
| 3 | 경쟁 | 반경 500m / 1km / 시군구 / YoY (증가·감소 라벨) |
| 4 | 임대료 | 상권 매핑 + 매핑신뢰도 명시 + 층별 표 (천원/㎡, 평당 월세 환산, 효용비율) |
| 5 | 시뮬레이터 | placeholder ("Day 2 이상 구현") |
| 6 | 지원사업 | data 의 `지원사업_links` → assasup.com 외부 링크 카드 |
| 7 | 체크리스트 | "데이터에 안 잡히는 거" 6가지 (현장 가서 확인) |
| (푸터) | | "참고용입니다 · 실제 창업 전 현장 확인 필수" + 캐시 시각 + 매핑신뢰도 |

---

## 발견 — 4가지

### 1. ⚠️ Next.js 동적 segment 명에 한글 못 씀
처음 `[시도]/[시군구]/[행정동]/[업종]` 으로 했더니 빌드 에러:
```
Error: You cannot have the slug names "시도" and "시군구" differ only by non-word symbols
```
한글이 \w 매칭 안 돼서 segment 이름 충돌로 인식.

→ **영어 segment 명** `[sido]/[signgu]/[adong]/[upjong]`. **URL 값은 여전히 한글** (Next.js 가 인코딩 자동 처리).

### 2. data/build → web/public/data 복사 동작
`web/scripts/copy-data.mjs` 가 prebuild step.
- 로컬: `../data/build` 자동 탐색 → `web/public/data` 로 cp -R (169MB)
- Vercel: build context 가 repo root 이므로 동일 path 작동 예상
- ⚠️ **Vercel 검증 필요** — Root Directory = `web` 설정에서 `..` 접근 가능한지. 안 되면 `outputFileTracingIncludes` 또는 다른 방식 fix

### 3. SSR (server-rendered on demand) 로 동작
`generateStaticParams` 안 써서 첫 요청마다 SSR. 우리 데이터 정적이니 ISR 적용하면 더 빠름. Day 2 이상에서 최적화.

### 4. ⚠️ Phase 2 인계 사항 (Phase 1 Week 2 docs) 부분만 반영
**현재 페이지에 반영됨:**
- ✅ R-ONE 매핑 신뢰도 명시 (`매핑신뢰도: high/medium/low` 라벨 카드 + 푸터)
- ✅ 외곽동 표본 작음 자동 표시 (Stat 컴포넌트가 0/null 처리)

**아직 미반영 — Day 2 이상:**
- 행정동명 퍼지 매칭 (사용자가 "역삼1동" 입력 시 "역삼제1동" 같은 변형도 매칭). 지금은 정확 일치만 → 404
- 카카오맵 임베드 (경쟁점 핀)
- 시뮬레이터 (BEP 3시나리오)

---

## 영향

- Phase 2 골격 잡힘. **운영자가 직접 URL 클릭해서 데이터 검증 가능** (Vercel deploy 후)
- Day 2 부터 일반화 가능 (홈 UI · 다른 시군구 · 시뮬레이터 · 카카오맵)
- 디자인 시스템 (chip-brand, card 등) Phase 0 Day 1 의 globals.css 그대로 활용

---

## 제안 — Day 2 우선순위

| 옵션 | 작업 | 운영자 가시 효과 |
|---|---|---|
| A | 홈 페이지 — 지역/업종 선택 UI | 사용자가 입구 부터 시작 가능 |
| B | 시뮬레이터 (BEP 3시나리오) — 리포트 안 채우기 | 페이지 더 풍성 |
| C | 카카오맵 임베드 (경쟁점 핀) | 시각적 임팩트 |
| D | 행정동명 퍼지 매칭 + 동 자동완성 | UX 매끄러워짐 |

**추천: A.** 사용자 entry point 부터 빨리 만들면 friend·가족 한테 데모 가능.

---

## 결정 갈림길

**Day 2 옵션 A/B/C/D 중 하나, 또는 다른 것**?

또: **Vercel deploy 검증 결과 공유 부탁** — main 머지 후 Vercel 자동 빌드 + 위 URL 클릭. 작동하면 OK, 404 나면 알려주시면 fix.
