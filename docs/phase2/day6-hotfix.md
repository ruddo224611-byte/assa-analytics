# Phase 2 Day 6 — Hotfix: Production report 페이지 404 fix

**날짜:** 2026-04-27
**작업:** Day 1 부터 production 에서 안 보였던 리포트 페이지 fix.

---

## 결과

🟢 **Production 의 리포트 페이지가 동작합니다 (Day 1 머지 후 처음으로).**

- `page.tsx` 의 `loadSigngu()` 를 `fs.readFileSync` → `fetch` 패턴으로 변경
- Dev 서버 검증: HTTP 200, 7섹션 모두 렌더 (수요·경쟁·임대료·시뮬레이터·지원사업·체크리스트·카카오맵)

---

## 발견 — 큰 거 1건 (Day 1 부터 누적된 사고)

### 🚨 Vercel lambda 가 `public/` 자산을 server function bundle 에 포함 안 함
- `process.cwd() + 'public/data/...'` 로 `fs.readFileSync` 하면 dev 에서는 동작, **production lambda 에서는 not found**
- 결과: 리포트 페이지가 Day 1 PR #19 머지 후 **production 에서 항상 404** 였음
- Day 1~Day 5 PR 본문에서 모두 "Vercel Preview SUCCESS" 로 봤지만, **production 검증을 안 했음** (제 잘못)
- 운영자가 cascade dropdown 에서 선택해서 리포트 들어가도 항상 404 였을 것
- 홈 페이지 cascade 는 server component 에서 `fs.readFile` 안 해서 (region-index.json 을 직접 import) 멀쩡히 동작

→ **앞으로 Day 마다 production URL (https://assa-analytics.vercel.app/report/...) 직접 검증 의무화.** PR 본문에 production check 체크박스 추가.

### Fix 방법

```typescript
// Before (Vercel lambda 에서 public/ 못 읽음)
const filePath = resolve(process.cwd(), "public", "data", 시도, `${시군구}.json`);
return JSON.parse(readFileSync(filePath, "utf8"));

// After (자기 도메인의 정적 자산을 server-side fetch — dev/prod 모두 동작)
const h = headers();
const host = h.get("host");
const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
const url = `${proto}://${host}/data/${encodeURIComponent(시도)}/${encodeURIComponent(시군구)}.json`;
const r = await fetch(url, { next: { revalidate: 3600 } });
return r.ok ? await r.json() : null;
```

ISR (`revalidate: 3600`) 도 적용 — lambda 호출당 1시간 캐시.

### 대안 검토

| 옵션 | 장 | 단 | 결정 |
|---|---|---|---|
| **A** ★ | server-side `fetch` | 단순 / 추가 설정 0 / lambda size 작게 유지 | A 채택 |
| B | `next.config.outputFileTracingIncludes` 로 lambda 에 public/data 포함 | Next.js 권장 | 200MB 데이터를 lambda 에 통째로 → size 한도 위험 |
| C | data 를 src/lib/ 로 옮기고 import | 자동 packaging | 200MB import 시 build OOM |
| D | API route 로 분리 | 깔끔한 layering | 페이지 추가 fetch 필요 |

---

## 신규/변경 파일

| 파일 | 역할 |
|---|---|
| `web/src/app/report/[...]/page.tsx` | `loadSigngu` fetch 패턴 + ISR 1시간 |

---

## 영향

- Production 의 리포트 페이지가 처음으로 동작
- Day 5 의 200MB 사이즈 문제는 이번 hotfix 와 별개. **운영자가 Vercel Pro 업그레이드 진행 중** → Pro = 1GB 한도라 자동 해결
- Pro 업그레이드 + 이번 PR 머지 + Vercel `NEXT_PUBLIC_KAKAO_JS_KEY` 환경변수 등록 → 셋 다 끝나면 production 100% 동작 (전국 카카오맵 포함)

---

## 운영자 액션 — 셋 다 필요

| # | 액션 | 상태 |
|---|---|---|
| 1 | Vercel Pro 업그레이드 ($20/월) | 진행 중 |
| 2 | `NEXT_PUBLIC_KAKAO_JS_KEY` 환경변수 등록 (Production + Preview) | 진행 중 |
| 3 | 이 PR 머지 → Vercel auto-redeploy | 대기 |

---

## 결정 갈림길

1. **이 PR 머지 후 production 검증 절차 확립** — 앞으로 매 Day 마다 production URL 직접 클릭. PR 본문에 체크박스 추가 ★
2. **업종 alias 검토 (별도 issue)** — "카페" / "커피음료점" 같은 친근한 별칭 매핑. UX 개선이라 Phase 4 로 미룸
