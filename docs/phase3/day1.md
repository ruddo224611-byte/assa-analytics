# Phase 3 Day 1 — AI 한 줄 요약 + 별명 + 후보 업종

**날짜:** 2026-04-27
**작업:** Claude Haiku 4.5 셋업 + 룰 엔진 + 강남구 시범 + 페이지 통합.

---

## 결과

🟢 **리포트 페이지에 AI 섹션 추가.** (헤더 바로 아래)

3가지 출력 표시:
1. **별명** — `"강남 직장인 과포화 커피 격전지"` (8~15자 한 줄)
2. **점수 4종** — 수요/경쟁/임대료/종합 (0~100)
3. **한 줄 요약** — 친근체 2~3문장 (구체 수치 인용, 단정적 표현 금지)
4. **후보 업종 3개** — 이 자리에 어울리는 다른 업종 + 이유

### 첫 LLM 호출 (강남구 역삼1동 커피음료점) 결과

```
별명: 강남 직장인 과포화 커피 격전지
점수: 수요 86, 경쟁 3, 임대료 0, 종합 27 (우려)

요약: 역삼1동은 3만4천 명의 인구에 30~40대가 절반을 차지하는
      수요처이지만, 반경 500m 내 172개 커피점이 밀집해 있어
      포화 경쟁이 심한 상황이네요. 임대료 정보 부재와 함께 종합
      점수 27점(우려)은 신규 진입 시 충분한 검토가 필요함을
      시사합니다.

후보:
  - 편의점: 직장인 밀집 지역의 빠른 회전율 + 장시간 영업 수요
  - 분식점: 점심 시간 직장인 가성비 식사 대안 + 경쟁 적음
  - 미용실: 30~40대 + 거주 인구 정기적 수요 + 커피 대비 경쟁 ↓
```

---

## 발견 — 4가지

### 1. ✅ Haiku 4.5 응답 품질 만족
- 단정적 표현 ("확실해요", "망해요") 없음
- 친근체 ("~네요", "~합니다") 일관
- 구체 수치 ("3만4천 명", "172개") 자연스럽게 인용
- 후보 업종이 합리적 (직장인 밀집 → 편의점/분식점/미용실)

### 2. ⚠️ dotenv 가 sk-ant-api03- 같은 hyphen 시작 값 일부 못 잡음
`.env.local` 에 5개 변수 있는데 dotenv 가 4개만 inject. ANTHROPIC_API_KEY 만 누락.

→ `web/scripts/build-llm.ts` 에서 직접 `readFileSync` + 정규식 parse 로 우회:

```typescript
const txt = readFileSync(envPath, "utf8");
for (const line of txt.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
```

### 3. 비용 — 호출당 약 $0.00075 (1원)
- input ~150 tokens × $1/1M = $0.00015
- output ~120 tokens × $5/1M = $0.0006
- 합계 ≈ $0.00075 (1.1원)

전국 풀빌드 추정: 255 시군구 × ~14 행정동 × 99 업종 ≈ 35만 호출 × $0.00075 = **$262** (35만원).
→ 한 번에 전국 X. **인기 시군구 + 인기 업종 우선 + on-demand 확장**.

### 4. 캐싱 = build-time CLI + JSON 파일 commit
- `web/scripts/build-llm.ts` 가 시군구 단위 호출
- `data/build/{시도}/{시군구}-llm.json` 저장 (gitignore 안 함, 200MB stores 와 함께 commit)
- 페이지가 read 만 (server fetch, ISR 1시간)
- 운영자가 직접 `npx tsx scripts/build-llm.ts --시도 ... --signgu ...` 호출
- 비용 통제 100%

---

## 신규 파일

| 파일 | 역할 |
|---|---|
| `web/src/lib/score.ts` | 룰 엔진 점수 (수요·경쟁·임대료·종합 + 톤) |
| `web/src/lib/llm-client.ts` | Anthropic Haiku 4.5 클라이언트 + JSON output prompt |
| `web/scripts/build-llm.ts` | CLI: 시군구 단위 LLM 캐시 빌드 |
| `data/build/{시도}/{시군구}-llm.json` | LLM 캐시 (강남구 5 행정동 시범) |
| `web/src/app/report/[...]/page.tsx` | AI 섹션 + score 카드 (헤더 아래) |

---

## 영향

- 리포트 페이지 첫 인상 ↑ (헤더 바로 아래에 LLM 요약)
- 룰 엔진 점수는 LLM 캐시 없어도 항상 표시 (즉시 fallback)
- 캐시 없는 행정동·업종은 "AI 한 줄 요약 준비 중" 안내
- Bundle: +0 KB (server-side 처리)

---

## 운영자 액션

| # | 액션 | 상태 |
|---|---|---|
| 1 | Anthropic API 키 발급 | ✅ 완료 (rotate 권장) |
| 2 | `.env.local` 등록 | ✅ 완료 |
| 3 | (런칭 전) Vercel 환경변수 등록 — `ANTHROPIC_API_KEY` (Sensitive 켜기) | 미완 |
| 4 | (선택) 키 rotate — 채팅 transcript 노출 방지 | 미완 |

→ Vercel 환경변수는 build-time CLI 가 **로컬에서만 호출**되므로 production 에서 불필요. 추후 runtime 호출 도입 시 등록.

---

## 제안 — Day 2+ 옵션

| 옵션 | 작업 | 비용 |
|---|---|---|
| **A** ★ | 강남구 22 행정동 × 99 업종 풀빌드 (운영자 결정 기다리고) | ~$1.6 (2,200원) |
| B | 서울 25구 풀빌드 | ~$15 (2만원) |
| C | 전국 인기 업종 5개 (커피/한식/편의점/미용실/치킨) | ~$13 (1.7만원) |
| D | on-demand 모드 — 첫 페이지 방문 시 호출 + 캐시 | runtime 비용 (월 사용량 기반) |
| E | 룰 엔진만 운영 (LLM 보류) | $0 |

추천 흐름: **A → B → C → D**.
- A 로 강남구 검증 (운영자 만족도 측정)
- B 로 서울 안정화
- C 로 전국 sparse coverage
- D 로 점진적 확장

---

## 결정 갈림길

1. **이번 PR 머지 전 추가 검증** — production 에서 강남구 5 행정동 LLM 표시 확인
2. **Day 2 우선** — A (강남구 풀) ★ vs B/C/D/E
3. **Anthropic 한도 설정** — Anthropic 콘솔 → Limits → Monthly $5 또는 $10 ★
4. **API 키 rotate** — 작업 후 (이번 또는 Day 2 끝나고) ★
