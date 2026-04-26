# Phase 2 Day 4 — 카카오맵 임베드 (경쟁점 핀)

**날짜:** 2026-04-27
**작업:** 리포트 #3 경쟁 섹션에 카카오맵. 마지막 placeholder 채움. **리포트 7섹션 모두 실 데이터.**

---

## 결과

🟢 **카카오맵 임베드 동작 (강남구 시범).**

- 핀: 현재 업종의 SBIZ store (lng/lat)
- 중심: 행정동 평균 좌표
- 반경: 500m / 1km 토글
- 핀 클릭: 상호명 (브라우저 기본 tooltip)
- SDK: 카카오맵 JS v2 (lazy load)

리포트 페이지 7섹션 모두 채워짐 (placeholder 0).

---

## 발견 — 3가지 (큰 거 1건 포함)

### 1. ⚠️⚠️ Stores 파일 사이즈 폭발 — 디스크 전략 재결정 필요
강남구 -stores.json = **14.6 MB** (모든 업종 64,123 stores). 시군구당 평균 ~10MB. **전국 = ~3.6 GB**.

Phase 1 Week 2 의 디스크 H 전략 (1.07MB/시군구) 으로 잡아둔 게 stores 추가로 다시 폭발.

→ **Day 4 단순화:** 강남구만 commit (시범). 다른 시군구는 .gitignore. PR 본문에 옵션 명시 — Day 5+ 결정.

```
# data/build/.gitignore
*-stores.json
!강남구-stores.json
```

### 2. 카카오맵 SDK lazy load + Server Component 분리
- 카카오맵은 client only — `'use client'` `<CompetitionMap>`
- SDK 는 next/script `afterInteractive` (페이지 첫 로드 가벼움)
- Stores fetch 도 lazy (mount 시 fetch) — 다른 시군구 보면 fetch fail → amber 메시지 fallback

### 3. 운영자 액션 — Vercel 환경변수 등록 필요
`NEXT_PUBLIC_KAKAO_JS_KEY` 가 client bundle 에 들어가야 SDK 로드.
- Phase 1 Week 3 PR #18 의 GitHub Secrets 등록 안내에 포함됐지만, **Vercel Settings → Environment Variables 에도 동일 키 등록 필요** (Vercel 빌드 시 사용)

→ 안 등록하면 페이지에 "지도 표시 안 됨 — NEXT_PUBLIC_KAKAO_JS_KEY 환경변수가 필요해요" 메시지 표시 (graceful fallback).

---

## 신규 파일

| 파일 | 역할 |
|---|---|
| `scripts/transform/build-signgu-h.ts` | `buildStoresFile()` 함수 추가 (stores 분리 출력) |
| `scripts/build-batch.ts` | `-stores.json` 도 저장 |
| `data/build/.gitignore` | `*-stores.json` 무시 + 강남구만 예외 |
| `data/build/서울특별시/강남구-stores.json` | 신규 14.6MB (시범) |
| `web/src/app/report/[...]/CompetitionMap.tsx` | 카카오맵 client 컴포넌트 |
| `web/src/app/report/[...]/page.tsx` | #3 경쟁 섹션에 `<CompetitionMap>` 통합 |

---

## 영향

- 리포트 페이지 거의 완성 (placeholder 0)
- Bundle 2.71kB → 6.74kB (카카오맵 컴포넌트). First Load 90 → 94kB. 합리적
- ⚠️ **Day 5 디스크 전략 결정 필수** (전국 stores 추가 시 3.6GB)

---

## 제안 — Day 5 옵션

### Stores 디스크 전략 (필수 결정)

| 옵션 | 장 | 단 |
|---|---|---|
| **A** | 그대로 git commit (전국) | 단순 / repo 5GB+ — Vercel deploy 느려짐 / PR diff 폭발 |
| **B** | 컬럼 압축 (현재 9 필드 → lng/lat/name/sclsCd 4 필드) | 1/2 사이즈 (~1.8GB). 코드 변경 적음 |
| **C** ★ | Vercel Blob/R2 같은 외부 storage | repo 깨끗 / 새 인프라 1개 |
| **D** | 시군구별로 별도 git repo | 너무 복잡 |
| **E** | API endpoint server-side 필터 (Vercel function) | 작은 응답 / 함수 cold start |

추천: **B (컬럼 압축) → 안 되면 C (외부 storage)**. B 가 단순하고 1.8GB 정도면 git 가능.

### Day 5 작업 옵션

| 옵션 | 작업 |
|---|---|
| **A** ★ | 위 디스크 전략 결정 (B 컬럼 압축 추천) + 전국 stores 빌드 + 모든 시군구 카카오맵 동작 |
| B | 비교 모드 (2개 행정동 동시) |
| C | 업종 검색 select (combobox) |
| D | 시뮬레이터 보강 (다른 층 / 권리금) |

---

## 결정 갈림길

1. **Vercel 환경변수 등록** — `NEXT_PUBLIC_KAKAO_JS_KEY` (값은 .env.local 의 값, Phase 0 Day 1 부터 동일)
2. **Day 5 우선:** A (디스크 전략 + 전국 stores) ★ vs B/C/D
3. **디스크 전략 옵션:** B (컬럼 압축) ★ vs A/C/D/E
