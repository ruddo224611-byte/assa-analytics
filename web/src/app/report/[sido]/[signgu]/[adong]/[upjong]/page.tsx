/**
 * 리포트 페이지.
 *
 * URL: /report/{시도}/{시군구}/{행정동}/{업종}
 * 예시: /report/서울특별시/강남구/역삼1동/커피음료점
 *
 * Phase 3 Day 2 변경 (운영자 피드백):
 *   - 지원사업 / 체크리스트 / AI 후보 업종 섹션 제거
 *   - 시뮬레이터 3시나리오 → 단일 결과
 *   - 점수 옆 한국어 풀이 추가
 *
 * 5섹션:
 *   1. 헤더 + AI 한 줄 요약 + 점수
 *   2. 거주 수요 (인구·세대·연령대)
 *   3. 경쟁 (반경 + 카카오맵)
 *   4. 임대료 (층별 표)
 *   5. 시뮬레이터 (단일 결과)
 */

import { Suspense } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Simulator from "./Simulator";
import CompetitionMap from "./CompetitionMap";
import { calculateScore, buildSignguContext } from "@/lib/score";

// ============ 데이터 형식 (Phase 1 build-signgu-h.ts 와 동기화) ============

interface AdongData {
  지역: { 행정동: string; 행정동코드_jumin: string; 행정동코드_sbiz: string; 중심좌표: { lng: number; lat: number } };
  수요: {
    인구: number | null;
    세대: number | null;
    세대당인구: number | null;
    성비: number | null;
    연령대_10: Record<string, number | null>;
  };
  임대료: {
    상권: string | null;
    상권_full: string | null;
    매핑신뢰도: string | null;
    분기: string;
    층별: Record<string, { 임대료_천원_m2: number | null; 효용비율_pct: number | null }>;
    단위: { 임대료: string; 효용비율: string };
  };
  지원사업_links: { label: string; url: string }[];
  업종별: Record<string, {
    sbiz_codes: string[];
    sbiz_names: string[];
    매핑유형: string;
    경쟁: {
      반경500m_동일업종: number;
      반경1km_동일업종: number;
      시군구내_업소수: number | null;
      시군구_YoY_pct: number | null;
      상가데이터_총수: number;
    };
  }>;
}

interface SignguData {
  meta: {
    시도: string;
    시군구: string;
    기준일: { 인구: string; 업종: string; 임대료: string; 상가: string };
    신뢰도: { 인구: string; 업종: string; 임대료: string; 상가: string; 캐시업데이트: string };
    행정동수: number;
    업종수: number;
  };
  행정동: Record<string, AdongData>;
}

// ============ 데이터 로딩 ============

/**
 * 시군구 데이터 로드.
 *
 * Day 6 hotfix: fs.readFile → fetch 패턴으로 변경.
 *   - Vercel lambda 가 server function bundle 에 public/ 자산을 포함 안 함
 *     → process.cwd() + "public/data" 경로가 production 에서 not found
 *   - 같은 도메인의 public 정적 자산을 fetch 으로 읽으면 dev/prod 모두 동작
 *   - ISR (revalidate 1시간) 로 lambda 호출당 한 번만 fetch
 */
async function loadSigngu(시도: string, 시군구: string): Promise<SignguData | null> {
  const h = headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const url = `${proto}://${host}/data/${encodeURIComponent(시도)}/${encodeURIComponent(시군구)}.json`;
  try {
    const r = await fetch(url, { next: { revalidate: 3600 } });
    if (!r.ok) return null;
    return (await r.json()) as SignguData;
  } catch {
    return null;
  }
}

// ============ LLM 캐시 로딩 (Phase 3) ============

interface LLMEntry {
  score: { 수요: number; 경쟁: number; 임대료: number; 종합: number; 톤: string };
  llm: {
    alias: string;
    summary: string;
    // candidates 는 Day 2 에 제거됨 (구버전 캐시 호환을 위해 optional 로 둘 수도 있지만 표시는 안 함)
  };
}
interface LLMCacheFile {
  meta: { 시도: string; 시군구: string; 캐시업데이트: string };
  행정동: Record<string, { 업종별: Record<string, LLMEntry> }>;
}

async function loadLLM(시도: string, 시군구: string): Promise<LLMCacheFile | null> {
  const h = headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const url = `${proto}://${host}/data/${encodeURIComponent(시도)}/${encodeURIComponent(시군구)}-llm.json`;
  try {
    const r = await fetch(url, { next: { revalidate: 3600 } });
    if (!r.ok) return null;
    return (await r.json()) as LLMCacheFile;
  } catch {
    return null;
  }
}

// ============ 페이지 ============

interface PageProps {
  // Next.js 동적 segment 명에 한글 못 씀 → 영어 키. URL 값(한글)은 OK
  params: { sido: string; signgu: string; adong: string; upjong: string };
  searchParams: { keyword?: string };
}

export default async function ReportPage({ params, searchParams }: PageProps) {
  const 시도 = decodeURIComponent(params.sido);
  const 시군구 = decodeURIComponent(params.signgu);
  const 행정동 = decodeURIComponent(params.adong);
  const 업종 = decodeURIComponent(params.upjong);
  const keyword = searchParams.keyword?.trim() ?? "";

  const data = await loadSigngu(시도, 시군구);
  if (!data) notFound();

  const adong = data.행정동[행정동];
  if (!adong) notFound();

  const u = adong.업종별[업종];
  if (!u) notFound();

  // Phase 3 Day 5b: keyword 가 있으면 sbiz_codes 중 sbiz_names 가 keyword 포함하는 것만 필터
  // (예: 업종 = "스포츠교육기관", keyword = "필라테스" → 필라테스 코드만 핀에 표시)
  const filteredCodes = keyword
    ? u.sbiz_codes.filter((_, i) => (u.sbiz_names[i] ?? "").includes(keyword))
    : u.sbiz_codes;
  const filteredCodeToName = Object.fromEntries(
    u.sbiz_codes
      .map((c, i) => [c, u.sbiz_names[i] ?? ""])
      .filter(([c]) => filteredCodes.includes(c as string)),
  );

  // Phase 3 Day 3: 시군구 분위 기반 점수 (시군구 컨텍스트 사용)
  const signguCtx = buildSignguContext(data);
  const score = calculateScore(
    { 수요: adong.수요, 경쟁: u.경쟁, 임대료: adong.임대료 },
    signguCtx,
    업종,
  );
  const llmCache = await loadLLM(시도, 시군구);
  const aiEntry = llmCache?.행정동?.[행정동]?.업종별?.[업종];

  const fmt = (n: number | null | undefined) =>
    n == null ? "—" : Number(n).toLocaleString("ko-KR");
  const fmtPct = (n: number | null | undefined, sign = false) =>
    n == null ? "—" : `${sign && n > 0 ? "+" : ""}${n.toFixed(1)}%`;
  const fmtMoney = (n: number | null | undefined) =>
    n == null ? "—" : (n).toFixed(1);

  // 평당 월세 환산 (천원/㎡ → 원/평) ; 1평 = 3.305785㎡
  const m2ToPyeong = (krwPerM2K: number | null | undefined) =>
    krwPerM2K == null ? null : Math.round(krwPerM2K * 1000 * 3.305785);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
      {/* ======== 1. 헤더 ======== */}
      <header className="mb-10">
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="chip-brand text-sm">{시도}</span>
          <span className="chip-brand text-sm">{시군구}</span>
          <span className="chip-brand text-sm">{행정동}</span>
          {keyword && (
            <span className="text-sm font-medium px-2.5 py-1 rounded bg-amber-100 text-amber-700">
              🔍 {keyword}
            </span>
          )}
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-900">
          {keyword ? keyword : 업종} <span className="text-brand-600">상권 리포트</span>
        </h1>
        <p className="mt-4 text-base sm:text-lg text-slate-500">
          이 자리에 {업종} 차려도 될지, 데이터로 한 번 보세요.
        </p>
        {/* 기준일 카드 */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          {Object.entries(data.meta.기준일).filter(([k]) => k !== "상가").map(([k, v]) => (
            <div key={k} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
              <div className="text-slate-400 text-xs">{k} 기준</div>
              <div className="text-slate-700 font-medium mt-1">{v}</div>
            </div>
          ))}
        </div>
      </header>

      {/* ======== AI 한 줄 요약 (Phase 3) — 헤더 바로 아래 ======== */}
      <section className="card p-6 sm:p-8 mb-8 bg-gradient-to-br from-brand-50 to-white border-brand-100">
        {/* 별명 */}
        {aiEntry?.llm.alias ? (
          <div className="mb-4">
            <span className="inline-block text-xs font-medium text-brand-600 bg-brand-100 px-2.5 py-1 rounded">
              상권 한 줄
            </span>
            <h2 className="mt-2.5 text-2xl sm:text-3xl font-bold text-slate-900">
              &ldquo;{aiEntry.llm.alias}&rdquo;
            </h2>
          </div>
        ) : null}

        {/* 점수 4종 — Day 3: 시군구 분위 기반 (50점 = 시군구 평균) */}
        <div className="grid grid-cols-4 gap-2 sm:gap-3 mb-3">
          <ScoreBadge label="수요" sub="사람 많은지" value={score.수요} />
          <ScoreBadge label="경쟁" sub="비어있는지" value={score.경쟁} />
          <ScoreBadge label="임대료" sub="저렴한지" value={score.임대료} />
          <ScoreBadge label="종합" sub="전체 평가" value={score.종합} highlight={score.톤} />
        </div>
        <p className="text-sm text-slate-400 mb-5 text-center">
          ※ <strong className="text-slate-500">{시군구} 안에서</strong> 상대 위치. 100 = {시군구} 1위, 50 = 평균, 0 = 꼴찌.
        </p>

        {/* 한 줄 요약 (LLM) — file cache 있으면 즉시, 없으면 on-demand (Suspense lazy) */}
        {aiEntry?.llm.summary ? (
          <p className="text-base sm:text-lg text-slate-700 leading-relaxed whitespace-pre-line">
            {aiEntry.llm.summary}
          </p>
        ) : (
          <Suspense fallback={<AILoadingFallback />}>
            <OnDemandAI 시도={시도} 시군구={시군구} 행정동={행정동} 업종={업종} />
          </Suspense>
        )}

        <p className="mt-5 text-xs text-slate-400">
          ※ 점수·요약은 데이터 기반 참고용. 단정적 판정 X. 현장 확인 필수.
        </p>
      </section>

      {/* ======== 2. 수요 ======== */}
      <Section title="🧑‍🤝‍🧑 거주 수요" subtitle={`행정동 단위 (출처: 행안부 주민등록)`}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <Stat label="인구" value={fmt(adong.수요.인구)} unit="명" />
          <Stat label="세대" value={fmt(adong.수요.세대)} unit="가구" />
          <Stat label="세대당 인구" value={fmtMoney(adong.수요.세대당인구)} unit="명" highlight={
            adong.수요.세대당인구 != null && adong.수요.세대당인구 < 1.7 ? "1인가구 비율 높음" :
            adong.수요.세대당인구 != null && adong.수요.세대당인구 > 2.5 ? "가족 거주 비율 높음" : undefined
          } />
          <Stat label="남여 비율" value={fmtMoney(adong.수요.성비)} unit="(남=1)" />
        </div>
        {/* 연령대 막대 */}
        <div>
          <div className="text-xs text-slate-500 mb-2">연령대 분포 (10세 단위)</div>
          <AgeChart data={adong.수요.연령대_10} />
        </div>
      </Section>

      {/* ======== 3. 경쟁 ======== */}
      <Section
        title="🏪 경쟁 업체"
        subtitle={
          keyword && filteredCodes.length > 0
            ? `반경·시군구 단위 동일 업종 분포. 지도 핀은 "${keyword}" 만 표시 (${filteredCodes.length}개 SBIZ 코드)`
            : "반경·시군구 단위로 동일 업종 분포 보기"
        }
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="반경 500m" value={fmt(u.경쟁.반경500m_동일업종)} unit="개" />
          <Stat label="반경 1km" value={fmt(u.경쟁.반경1km_동일업종)} unit="개" />
          <Stat label={`${시군구} 전체`} value={fmt(u.경쟁.시군구내_업소수)} unit="개" />
          <Stat label="작년 대비" value={fmtPct(u.경쟁.시군구_YoY_pct, true)} unit=""
                highlight={u.경쟁.시군구_YoY_pct != null
                  ? (u.경쟁.시군구_YoY_pct > 0 ? "증가 추세" : u.경쟁.시군구_YoY_pct < -3 ? "빠르게 감소" : "안정")
                  : undefined} />
        </div>
        {keyword && (
          <p className="mt-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            ※ 위 카운트는 <b>{업종}</b> 카테고리 전체 (NTS 단위). 아래 지도는 <b>&ldquo;{keyword}&rdquo;</b> 만 정확 필터.
          </p>
        )}
        <p className="mt-4 mb-4 text-xs text-slate-500">
          반경 카운트는 행정동 중심 좌표 기준. 아래 지도에서 실제 핀 위치 확인 가능.
        </p>
        {/* 카카오맵 (Day 4 신규) — Day 5b: keyword 있으면 필터된 sbiz 만 */}
        <CompetitionMap
          centerLng={adong.지역.중심좌표.lng}
          centerLat={adong.지역.중심좌표.lat}
          시도={시도}
          시군구={시군구}
          sbizCodes={filteredCodes}
          sbizCodeToName={filteredCodeToName}
        />
      </Section>

      {/* ======== 4. 임대료 ======== */}
      <Section
        title="💰 상권 임대료"
        subtitle={
          adong.임대료.상권
            ? `상권: ${adong.임대료.상권} (매핑 신뢰도: ${adong.임대료.매핑신뢰도}) — 단위: ${adong.임대료.단위.임대료}`
            : "임대료 데이터 매핑 없음"
        }
      >
        {Object.keys(adong.임대료.층별).length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="text-left py-2">층</th>
                  <th className="text-right py-2">임대료 (천원/㎡)</th>
                  <th className="text-right py-2">평당 월세 (원)</th>
                  <th className="text-right py-2">효용비율 (%)</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(adong.임대료.층별).sort((a, b) => {
                  const order = ["지하1층", "1층", "2층", "3층", "4층", "5층", "6층이상"];
                  return order.indexOf(a[0]) - order.indexOf(b[0]);
                }).map(([층, v]) => (
                  <tr key={층} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 font-medium text-slate-700">{층}</td>
                    <td className="py-2 text-right text-slate-600">{fmtMoney(v.임대료_천원_m2)}</td>
                    <td className="py-2 text-right text-slate-600">{m2ToPyeong(v.임대료_천원_m2)?.toLocaleString("ko-KR") ?? "—"}</td>
                    <td className="py-2 text-right text-slate-600">{fmtMoney(v.효용비율_pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-500">이 동에 매핑된 상권 임대료 데이터가 없습니다.</p>
        )}
        <p className="mt-3 text-xs text-slate-400">
          ※ 한국부동산원 R-ONE 중대형 상가 임대동향 ({adong.임대료.분기}). 실제 가게 임대료는 위치·층·면적에 따라 차이 큼. 현장 확인 필수.
        </p>
      </Section>

      {/* ======== 5. 시뮬레이터 ======== */}
      <Section title="🧮 창업 시뮬레이터" subtitle="층·평수·객단가·일 손님·인건비 입력 → BEP 즉시 계산">
        <Simulator 업종={업종} floors={adong.임대료.층별} />
      </Section>

      {/* ======== 푸터 (필수 고정문) ======== */}
      <footer className="mt-12 pt-6 border-t border-slate-200">
        <p className="text-xs text-slate-400 text-center">
          참고용입니다 · 실제 창업 전 현장 확인 필수
        </p>
        <p className="text-[11px] text-slate-300 text-center mt-1">
          데이터 캐시: {new Date(data.meta.신뢰도.캐시업데이트).toLocaleString("ko-KR")} ·{" "}
          매핑신뢰도: 임대료 {adong.임대료.매핑신뢰도 ?? "없음"}
        </p>
      </footer>
    </div>
  );
}

// ============ UI 헬퍼 컴포넌트 ============

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="card p-6 sm:p-8 mb-8">
      <h2 className="text-xl sm:text-2xl font-bold text-slate-900">{title}</h2>
      {subtitle && <p className="text-sm text-slate-500 mt-1.5 mb-5">{subtitle}</p>}
      {children}
    </section>
  );
}

function Stat({ label, value, unit, highlight }: { label: string; value: string; unit?: string; highlight?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-4 py-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
        {value}
        {unit && <span className="text-base text-slate-400 font-normal ml-1">{unit}</span>}
      </div>
      {highlight && (
        <div className="text-xs text-brand-700 mt-1.5 font-medium">{highlight}</div>
      )}
    </div>
  );
}

// On-demand AI fetch (file cache 없는 시군구) — Suspense streaming
async function OnDemandAI({ 시도, 시군구, 행정동, 업종 }: {
  시도: string; 시군구: string; 행정동: string; 업종: string;
}) {
  const h = headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const url = `${proto}://${host}/api/llm?` + new URLSearchParams({
    sido: 시도, signgu: 시군구, adong: 행정동, upjong: 업종,
  }).toString();
  try {
    const r = await fetch(url, { next: { revalidate: 60 * 60 * 24 } });
    if (!r.ok) {
      return (
        <p className="text-xs text-slate-400 italic">
          AI 분석 준비 중 (잠시 후 다시 시도해주세요)
        </p>
      );
    }
    const d = await r.json() as { llm: { alias: string; summary: string } };
    return (
      <>
        {d.llm?.alias && (
          <div className="mb-3 -mt-2">
            <span className="inline-block text-[11px] font-medium text-brand-600 bg-brand-100 px-2 py-1 rounded">
              상권 한 줄
            </span>
            <h2 className="mt-2 text-lg sm:text-xl font-bold text-slate-900">
              &ldquo;{d.llm.alias}&rdquo;
            </h2>
          </div>
        )}
        {d.llm?.summary && (
          <p className="text-sm sm:text-base text-slate-700 leading-relaxed whitespace-pre-line">
            {d.llm.summary}
          </p>
        )}
      </>
    );
  } catch {
    return (
      <p className="text-xs text-slate-400 italic">
        AI 분석 준비 중 (잠시 후 다시 시도해주세요)
      </p>
    );
  }
}

function AILoadingFallback() {
  return (
    <div className="space-y-2 animate-pulse">
      <div className="h-4 bg-slate-100 rounded" />
      <div className="h-4 bg-slate-100 rounded" />
      <div className="h-4 w-3/4 bg-slate-100 rounded" />
      <p className="mt-3 text-xs text-slate-400">AI 분석 중… (5~10초)</p>
    </div>
  );
}

function ScoreBadge({ label, sub, value, highlight }: { label: string; sub?: string; value: number; highlight?: string }) {
  // 점수 색상: 65+ 파랑, 35-64 회색, 35 미만 amber
  const color =
    value >= 65 ? "bg-brand-100 text-brand-700"
      : value >= 35 ? "bg-slate-100 text-slate-700"
      : "bg-amber-100 text-amber-700";
  return (
    <div className={`rounded-lg ${color} px-3 py-3 text-center`}>
      <div className="text-sm font-medium">{label}</div>
      {sub && <div className="text-[11px] opacity-70 leading-tight mt-0.5">{sub}</div>}
      <div className="text-2xl sm:text-3xl font-bold mt-1.5">{value}</div>
      {highlight && (
        <div className="text-xs mt-1 font-semibold">
          {highlight}
        </div>
      )}
    </div>
  );
}

function AgeChart({ data }: { data: Record<string, number | null> }) {
  const entries = Object.entries(data).filter(([k]) => k !== "100세 이상");
  const max = Math.max(...entries.map(([, v]) => v ?? 0));
  return (
    <div className="space-y-2">
      {entries.map(([age, v]) => (
        <div key={age} className="flex items-center gap-3 text-sm">
          <div className="w-16 text-slate-500">{age}</div>
          <div className="flex-1 h-6 bg-slate-100 rounded-sm overflow-hidden">
            <div
              className="h-full bg-brand-400"
              style={{ width: `${max ? ((v ?? 0) / max) * 100 : 0}%` }}
            />
          </div>
          <div className="w-20 text-right text-slate-600 font-medium">
            {v?.toLocaleString("ko-KR") ?? "—"}
          </div>
        </div>
      ))}
    </div>
  );
}
