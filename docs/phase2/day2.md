# Phase 2 Day 2 — 홈 페이지 (지역/업종 선택 UI)

**날짜:** 2026-04-27
**작업:** placeholder 였던 홈 (`/`) 을 cascade dropdown 4개로 교체. 사용자 entry point 완성.

---

## 결과

🟢 **홈 페이지 완성. Day 1 의 리포트 페이지로 자연스럽게 연결.**

흐름:
```
/  → 시도 선택 → 시군구 → 행정동 → 업종 → "리포트 보기" 클릭
   → /report/{시도}/{시군구}/{행정동}/{업종} 으로 이동 (Day 1 페이지)
```

데이터:
- **17 시도 / 255 시군구 / 3,569 행정동 / 99 업종** 다 보유
- region-index.json 29.6 KB (한 번 다운로드, client cache)

UX:
- ✅ Cascade — 상위 미선택 시 하위 disabled
- ✅ "예시: 강남 역삼1동 카페" 빠른 선택 버튼 (운영자/사용자 데모 편함)
- ✅ 상태 인디케이터 ("위 4개 모두 선택해주세요")
- ✅ 모바일 친화적 (큰 select, py-3)

---

## 신규 파일

| 파일 | 역할 |
|---|---|
| `web/scripts/build-region-index.mjs` | data/reference 에서 인덱스 JSON 생성 (prebuild) |
| `web/src/app/HomeForm.tsx` | `'use client'` cascade dropdown |
| `web/src/app/page.tsx` | (교체) placeholder → server component + `<HomeForm>` |
| (자동 생성) `web/public/region-index.json` | 29.6 KB, gitignored |

`web/package.json` 의 `predev` / `prebuild` 가 copy-data + build-region-index 둘 다 실행.

---

## 발견 — 2가지

### 1. ESLint unused vars 빌드 차단
처음 `interface Adong { ... } interface Signgu { ... }` 만 정의하고 안 썼더니 production build 실패:
```
Failed to compile.
'Adong' is defined but never used. @typescript-eslint/no-unused-vars
```
→ 제거. **로컬 `npm run build` 항상 돌려서 검증** 습관 필요 (dev 만 돌리면 ESLint 안 돌아감).

### 2. Day 1 인계 사항 (행정동명 퍼지 매칭) 자연스럽게 해결됨
사용자가 직접 "역삼제1동" 입력 못 하게 — **드롭다운에서 jumin 표기 그대로 (정확)** 선택. 자유 입력 X 라 퍼지 매칭 불필요.
→ Day 1 의 인계 사항 #4 "행정동명 퍼지 매칭" 의 **부분 해결**. (URL 직접 입력 시는 여전히 정확 일치 필요)

---

## 영향

- Phase 2 사용자 흐름 완성 (입력 → 리포트). **데모 가능**
- 향후 작업이 부담 줄어듦 — Day 1 페이지를 사용자가 직접 만나게 됨
- region-index.json 작아서 (29.6KB) 첫 페이지 로드 부담 X

---

## 제안 — Day 3 옵션

| 옵션 | 작업 |
|---|---|
| **A** ★ | 시뮬레이터 (BEP 3시나리오) — 리포트 #5 섹션 채우기 |
| B | 카카오맵 임베드 — 리포트 #3 경쟁 섹션에 핀 |
| C | 비교 모드 — 2개 행정동 동시 비교 |
| D | 업종 검색 가능 select (combobox) — UX 개선 |

**추천: A.** 시뮬레이터가 운영자가 가장 강조한 ⭐ 기능 중 하나 (CLAUDE.md MVP #5). 임대료 데이터 이미 있으니 BEP 자동 계산 가능.

---

## 결정 갈림길

1. **Vercel deploy 검증** — 머지 후 https://assa-analytics.vercel.app 접속 → 홈 입력 폼 → 리포트로 이동 흐름 확인
2. **Day 3 옵션** — A/B/C/D 중 하나
