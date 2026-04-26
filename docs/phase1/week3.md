# Phase 1 Week 3 — GitHub Actions cron 자동화

**날짜:** 2026-04-26
**작업:** ETL workflow 자동화. 매월/매분기 cron + 수동 trigger + 자동 PR 생성.

---

## 결과

🟢 `.github/workflows/etl.yml` 신규. **운영자가 GitHub Secrets 등록만 하면 매월 자동 갱신.**

### Workflow 구조

| 트리거 | 시점 (KST) | 동작 |
|---|---|---|
| 월 cron | 매월 5일 06:00 | jumin/nts 새로, sbiz/reb 캐시 사용, 풀빌드 |
| 분기 cron | 1·4·7·10월 15일 08:00 | sbiz/reb 캐시 리셋, 모두 새로 받음, 풀빌드 |
| 수동 (workflow_dispatch) | 즉시 | 시도 필터 / 캐시 리셋 옵션 가능 |

### 빌드 흐름

1. **체크아웃** + Node 20
2. **data/raw 캐시 복원** (이전 run 의 raw)
3. **(분기만) 캐시 리셋** — sbiz/reb 삭제
4. **.env.local 생성** (GitHub Secrets 에서 4개 키 가져옴)
5. **Reference 갱신** (서울 + 광역시 + 도)
6. **시도별 풀빌드** — 17 시도 sequential (Background stuck 학습 반영)
7. **빌드 통계 → GitHub Actions Summary**
8. **data/raw 캐시 저장** (다음 run 위해)
9. **.env.local 삭제** (보안)
10. **자동 PR 생성** — `peter-evans/create-pull-request` 사용

### 자동 PR 본문 양식
- 트리거 종류 / 실행 번호 / 시각
- 변경 시군구 파일 목록 (자동)
- 검토 가이드 (이상 수치면 머지 거부)
- 실패 시 대처

---

## 운영자 액션 — GitHub Secrets 등록 (1회)

PR 머지 후 한 번만 하면 됨:

1. GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**
2. 다음 4개 등록:

| Secret 이름 | 값 |
|---|---|
| `PUBLIC_DATA_API_KEY` | `f48f21c875fa09bd8b64000228f994edfb9715354d791d4caf0f3b83e716308c` |
| `SBIZ_API_KEY` | `f48f21c875fa09bd8b64000228f994edfb9715354d791d4caf0f3b83e716308c` (동일) |
| `REB_API_KEY` | `cd4e75e1b7e64409a177b7ed65d839cb` |
| `NEXT_PUBLIC_KAKAO_JS_KEY` | `acba752957c41204bddfaac09e10ad61` |

3. 등록 후 **수동 테스트:** Actions 탭 → "ETL — 공공데이터 자동 갱신" → "Run workflow" → 시도 필터에 "서울특별시" 만 입력 → Run
   - 5분쯤 후 새 PR 자동 생성됨 (서울만 갱신된)
   - 머지 또는 close (테스트라 close 권장)

---

## 발견 — 설계 시 짚을 거 4가지

### 1. ⚠️ GitHub Actions 무료 한도
Public repo 는 무제한. 우리 repo 는 public 이라 한도 영향 없음.
- (참고) Private 였다면 2,000분/월. 매월 빌드 ~120분 = 6%. 안전.

### 2. PR 머지 후 Vercel 자동 재배포
이미 설정됨 (Phase 0 Day 1). main push 시 자동 빌드. ETL 자동 PR 머지하면 Vercel 자동 트리거.

### 3. ⚠️ data/raw 캐시 7일 보존
GitHub Actions cache 한도 7일 (변경 없을 시 만료). 우리는 매월 빌드라 매월 cache 갱신됨. OK.
**한 달 이상 빌드 안 돌면** raw 캐시 만료 → 다음 빌드 시 SBIZ 모두 새로 받음 (시간 +1시간 정도).

### 4. ⚠️ Background stuck 재발 가능성 (Week 2 발견 #5)
GitHub Actions 도 4시간 timeout 설정. 시도별 sequential 이므로 stuck 시 다음 시도로 넘어가지 못함.
**완화책 적용:**
- 시도별 분할 step (한 시도 stuck 면 그 시도만 영향)
- SBIZ 429 자동 60→120→180초 재시도
- workflow timeout 240분 (4시간)

추가 안전망 (선택):
- 시도별 별도 job + matrix → 병렬 실행 + 한 시도 실패해도 다른 시도 계속. **단점: SBIZ rate limit 폭증 위험.** 도입 보류
- continue-on-error 옵션. 한 시도 실패해도 다음 진행. 머지 시 일부 시도는 옛 데이터 그대로 유지

---

## 영향

- **Phase 1 완료** 🎉. ETL 골격 + 풀빌드 + 자동화 모두 끝.
- **운영자 매월 액션** = 자동 PR 1건 머지 (이상 없으면). 5분 작업.
- Vercel 재배포 → 사이트 데이터 매월 자동 갱신.
- Phase 2 진입 가능 (UI 만 만들면 됨).

---

## 제안 — 다음

**Phase 2 (리포트 페이지 MVP)** 진입.

| 우선순위 | 작업 |
|---|---|
| ⭐ | 지역 · 업종 선택 UI |
| ⭐ | 리포트 템플릿 (7섹션) |
| ⭐ | 창업 시뮬레이터 |
| | 지원사업 연동 (assasup) |
| | 카카오맵 임베드 |

Week 2 종합 docs 의 인계 사항 8가지 참고. 특히:
- R-ONE 매핑 정밀도 (low confidence 표시)
- 행정동명 퍼지 매칭 (성수1가1동 vs 성수1가제1동)

---

## 결정 갈림길 — 없음

이 PR 만 머지하고 시크릿 등록하면 자동 ETL 가동.
다음 작업은 **Phase 2 시작 OR 매월 자동 PR 1건 머지** 만 남음.
