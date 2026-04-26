# Phase 2 Day 5 — Stores 컬럼 압축 + 전국 카카오맵

**날짜:** 2026-04-27
**작업:** Day 4 의 stores 사이즈 폭발 (3.6GB) 해결 → 전국 시군구 카카오맵 동작.

---

## 결과

🟢 **컬럼 압축 65% 절감 → 전국 stores commit + 모든 시군구 카카오맵 동작.**

- **강남구 stores: 14.6 MB → 5.06 MB** (예상 50% 절감 → 실제 65% 절감)
- **전국 stores: 201 MB** (예상 1.25GB 대비 6배 더 작음 — 강남구가 매장 밀집 1위라 평균은 훨씬 낮음)
- 전국 255 시군구 100% 빌드 성공 (raw 캐시 활용으로 sbiz 호출 0회, 약 6분)
- 카카오맵: 전국 모든 시군구에서 동작 (Day 4 는 강남구만)
- 리포트 페이지 7섹션 + 전국 carry-over

### 압축 적용

| 변경 | 절감 |
|---|---|
| 9 필드 → 4 필드 (name/sclsCd/lng/lat 만) | 약 50% |
| 좌표 6자리 → 5자리 (1m 정밀도, 카카오맵 충분) | 약 16% |
| **합계** | **65%** |

빠진 필드: `branch` (지점명은 name 에 합침 " " 구분), `sclsNm`, `adongCd/Nm`, `addr`, `floor`. Phase 3+ 핀 클릭 모달 도입 시 별도 lazy fetch.

---

## 발견 — 3가지

### 1. ✅ 사이즈 부담 거의 없음 — 그대로 git commit OK
전국 stores 201MB. ETL workflow 가 월 1회 재생성 시 매월 PR diff 가 200MB 수준. 거대 PR 이긴 하지만 GitHub 한도 (file 100MB / repo 5GB 권장) 내.

→ 현재 결정: **A (그대로 commit)**. Phase 1 Week 3 ETL workflow 와 충돌 없음.
→ Phase 5 런칭 전 다시 검토할 옵션 (선택):
  - **B**: stores 만 별도 storage (Vercel Blob). ETL 이 storage 에 push, web 이 fetch.
  - **C**: stores 를 git LFS 로. 같은 repo 지만 diff 안 보임.

당장 운영 부담 없으니 미룸.

### 2. ✅ 좌표 5자리는 카카오맵에 충분 — 1m 정밀도
6자리 (10cm) 는 over-precision. 5자리 (1m) 가 GPS 오차 (3-5m) 보다도 정밀.

핀이 1m 차이 안에 모이는 것보다 SBIZ 자체가 행정동 단위 좌표라 실제 매장 위치가 100m 까지 차이날 수 있음 → 좌표 정밀도는 5자리 충분.

### 3. ✅ raw 캐시 활용으로 빌드 빨라짐 — sbiz 호출 0회
Phase 1 Week 2/3 에서 모든 행정동 sbiz 캐시 (3,569 파일) 가 이미 있어서, 전국 빌드가 sbiz API 호출 0회로 끝남.

→ 분기마다 sbiz 캐시 리셋 하면 (Phase 1 Week 3 cron) 다시 호출. 평소엔 캐시 활용.

---

## 신규/변경 파일

| 파일 | 역할 |
|---|---|
| `scripts/transform/build-signgu-h.ts` | `SignguStoresFile` 4필드 + 좌표 5자리 round (`스키마: "v2-compact"`) |
| `web/src/app/report/[...]/CompetitionMap.tsx` | `Store` interface 4필드만 |
| `data/build/.gitignore` | **삭제** (전국 stores commit 가능) |
| `data/build/{시도}/{시군구}-stores.json` | 전국 261 파일 신규 commit |
| `docs/ROADMAP.md` | Phase 2 Week 1 (Day 1-5) 표 형식 업데이트 |

---

## 영향

- 카카오맵: **모든 시군구**에서 동작 (Day 4 는 강남구만 → Day 5 부터 255 시군구 전체)
- 리포트 페이지 완성도: 100% (7섹션 모두 실 데이터, 전국 커버)
- Vercel deploy 사이즈: data/build 약 +200MB. 첫 deploy 약간 느려질 수 있음 (1-2분)
- ETL workflow (월 cron): 매월 PR diff 200MB. 부담 적은 수준

---

## 제안 — Day 6+ 옵션

Phase 2 의 5일 계획 (리포트 MVP) 은 Day 5 로 완성. 다음 단계 선택:

| 옵션 | 작업 | 기간 |
|---|---|---|
| **A** | **Phase 3 진입** — AI (Claude Haiku) 한 줄 요약 + 상권 별명 + 후보 업종 3개 설명 | 1~2주 |
| B | Phase 2 보강 — 비교 모드 (2개 행정동) + 업종 검색 combobox + 시뮬레이터 다층 | 2~3일 |
| C | Phase 4 일부 선행 — 데이터 기준일 카드 + 현장 체크리스트 강화 + 오류 신고 | 2~3일 |
| D | 운영 정비 — Vercel deploy 검증 + Day 4 / Day 5 PR 머지 + 도메인 연결 검토 | 1일 |

추천: **D → A**. D 로 한번 실 deploy 해서 카카오맵·시뮬레이터·전국 동작 확인 후, A 로 Phase 3 진입.

이유: AI 한 줄 요약은 "데이터 → 자연어" 라 데이터가 안정된 상태에서 시작해야 prompt 튜닝이 의미 있음.

---

## 결정 갈림길

1. **Day 6 우선:** D (운영 정비) ★ vs A/B/C
2. **Stores storage 전략:** 현재 A (git commit, 200MB). 부담 적어서 그대로 유지 ★ 또는 Phase 5 전 B (Vercel Blob) 전환
3. **운영자 액션 (Day 4 결정 사항):** Vercel `NEXT_PUBLIC_KAKAO_JS_KEY` 등록 — 안 하면 카카오맵 안 뜸
