/**
 * 리포트 페이지 — Phase 2 Day 1 첫 페이지.
 *
 * URL: /report/{시도}/{시군구}/{행정동}/{업종}
 * 예시: /report/서울특별시/강남구/역삼1동/커피음료점
 *
 * 7섹션:
 *   1. 헤더 (지역·업종·기준일·신뢰도)
 *   2. 수요 (인구·세대·세대당·연령대)
 *   3. 경쟁 (반경 500m/1km · 시군구 · YoY)
 *   4. 임대료 (상권·층별)
 *   5. 시뮬레이터 (Day 2 이상 구현)
 *   6. 지원사업 (URL 빌더)
 *   7. 체크리스트 (현장 체크)
 */

import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Simulator from "./Simulator";
import CompetitionMap from "./CompetitionMap";
import { calculateScore } from "@/lib/score";

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
    summary: string;
    alias: string;
    candidates: { name: string; reason: string }[];
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
}

export default async function ReportPage({ params }: PageProps) {
  const 시도 = decodeURIComponent(params.sido);
  const 시군구 = decodeURIComponent(params.signgu);
  const 행정동 = decodeURIComponent(params.adong);
  const 업종 = decodeURIComponent(params.upjong);

  const data = await loadSigngu(시도, 시군구);
  if (!data) notFound();

  const adong = data.행정동[행정동];
  if (!adong) notFound();

  const u = adong.업종별[업종];
  if (!u) notFound();

  // Phase 3: 룰 엔진 점수 (항상 즉시 계산) + LLM 캐시 (있으면 표시)
  const score = calculateScore({
    수요: adong.수요,
    경쟁: u.경쟁,
    임대료: adong.임대료,
  });
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
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      {/* ======== 1. 헤더 ======== */}
      <header className="mb-8">
        <div className="flex flex-wrap gap-2 mb-3">
          <span className="chip-brand">{시도}</span>
          <span className="chip-brand">{시군구}</span>
          <span className="chip-brand">{행정동}</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
          {업종} <span className="text-brand-600">상권 리포트</span>
        </h1>
        <p className="mt-3 text-sm text-slate-500">
          이 자리에 {업종} 차려도 될지, 데이터로 한 번 보세요.
        </p>
        {/* 기준일 카드 */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          {Object.entries(data.meta.기준일).filter(([k]) => k !== "상가").map(([k, v]) => (
            <div key={k} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-slate-400">{k} 기준</div>
              <div className="text-slate-700 font-medium mt-0.5">{v}</div>
            </div>
          ))}
        </div>
      </header>

      {/* ======== AI 한 줄 요약 (Phase 3) — 헤더 바로 아래 ======== */}
      <section className="card p-5 sm:p-6 mb-6 bg-gradient-to-br from-brand-50 to-white border-brand-100">
        {/* 별명 */}
        {aiEntry?.llm.alias ? (
          <div className="mb-3">
            <span className="inline-block text-[11px] font-medium text-brand-600 bg-brand-100 px-2 py-1 rounded">
              상권 한 줄
            </span>
            <h2 className="mt-2 text-lg sm:text-xl font-bold text-slate-900">
              &ldquo;{aiEntry.llm.alias}&rdquo;
            </h2>
          </div>
        ) : null}

        {/* 점수 4종 */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          <ScoreBadge label="수요" value={score.수요} />
          <ScoreBadge label="경쟁" value={score.경쟁} />
          <ScoreBadge label="임대료" value={score.임대료} />
          <ScoreBadge label="종합" value={score.종합} highlight={score.톤} />
        </div>

        {/* 한 줄 요약 (LLM) */}
        {aiEntry?.llm.summary ? (
          <p className="text-sm sm:text-base text-slate-700 leading-relaxed">
            {aiEntry.llm.summary}
          </p>
        ) : (
          <p className="text-xs text-slate-400 italic">
            AI 한 줄 요약 준비 중 (시범 운영 — 강남구 일부 행정동만 우선 적용)
          </p>
        )}

        {/* 후보 업종 3개 */}
        {aiEntry?.llm.candidates && aiEntry.llm.candidates.length > 0 ? (
          <div className="mt-4 pt-4 border-t border-brand-100">
            <div className="text-xs font-medium text-slate-500 mb-2">
              💡 이 자리에 어울리는 다른 업종 (참고)
            </div>
            <ul className="space-y-2">
              {aiEntry.llm.candidates.map((c, i) => (
                <li key={i} className="text-sm">
                  <span className="font-semibold text-slate-800">{c.name}</span>
                  <span className="text-slate-500"> — {c.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="mt-4 text-[11px] text-slate-400">
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
      <Section title="🏪 경쟁 업체" subtitle="반경·시군구 단위로 동일 업종 분포 보기">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="반경 500m" value={fmt(u.경쟁.반경500m_동일업종)} unit="개" />
          <Stat label="반경 1km" value={fmt(u.경쟁.반경1km_동일업종)} unit="개" />
          <Stat label={`${시군구} 전체`} value={fmt(u.경쟁.시군구내_업소수)} unit="개" />
          <Stat label="작년 대비" value={fmtPct(u.경쟁.시군구_YoY_pct, true)} unit=""
                highlight={u.경쟁.시군구_YoY_pct != null
                  ? (u.경쟁.시군구_YoY_pct > 0 ? "증가 추세" : u.경쟁.시군구_YoY_pct < -3 ? "빠르게 감소" : "안정")
                  : undefined} />
        </div>
        <p className="mt-4 mb-4 text-xs text-slate-500">
          반경 카운트는 행정동 중심 좌표 기준. 아래 지도에서 실제 핀 위치 확인 가능.
        </p>
        {/* 카카오맵 (Day 4 신규) */}
        <CompetitionMap
          centerLng={adong.지역.중심좌표.lng}
          centerLat={adong.지역.중심좌표.lat}
          시도={시도}
          시군구={시군구}
          sbizCodes={u.sbiz_codes}
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
      <Section title="🧮 창업 시뮬레이터" subtitle="평수·객단가·일 손님(기준) 입력 → 낙관/기준/보수 3시나리오 BEP 자동">
        <Simulator
          업종={업종}
          rentKrwPerM2K={adong.임대료.층별?.["1층"]?.임대료_천원_m2 ?? null}
        />
      </Section>

      {/* ======== 6. 지원사업 ======== */}
      <Section title="🎁 지원사업 연계" subtitle={`${시군구} 자영업 대상 정부·지자체 지원사업`}>
        <div className="space-y-2">
          {adong.지원사업_links.map((link) => (
            <a
              key={link.label}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm hover:border-brand-300 hover:bg-brand-50 transition-colors"
            >
              <span className="text-slate-700">{link.label}</span>
              <span className="text-brand-600">assasup.com →</span>
            </a>
          ))}
        </div>
      </Section>

      {/* ======== 7. 현장 체크리스트 ======== */}
      <Section title="📋 현장 체크리스트" subtitle="데이터에 안 잡히는 거 — 발품으로 확인하세요">
        <ul className="space-y-2 text-sm text-slate-700">
          {[
            "출퇴근 시간대 유동 인구 — 직접 가서 30분 관찰",
            "주말 vs 평일 분위기 차이",
            "주차 가능 여부 + 인근 주차장 시세",
            "건물 외관 / 입구 가시성 / 간판 자리",
            "임대 조건 (보증금·관리비·권리금)",
            "주변 비어있는 매장 수 (= 상권 활력 신호)",
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-1 inline-block w-1.5 h-1.5 rounded-full bg-brand-400 flex-shrink-0" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
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
    <section className="card p-5 sm:p-6 mb-6">
      <h2 className="text-lg sm:text-xl font-bold text-slate-900">{title}</h2>
      {subtitle && <p className="text-xs text-slate-500 mt-1 mb-4">{subtitle}</p>}
      {children}
    </section>
  );
}

function Stat({ label, value, unit, highlight }: { label: string; value: string; unit?: string; highlight?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-3">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="text-xl font-bold text-slate-900 mt-1">
        {value}
        {unit && <span className="text-sm text-slate-400 font-normal ml-0.5">{unit}</span>}
      </div>
      {highlight && (
        <div className="text-[10px] text-brand-700 mt-1 font-medium">{highlight}</div>
      )}
    </div>
  );
}

function ScoreBadge({ label, value, highlight }: { label: string; value: number; highlight?: string }) {
  // 점수 색상: 65+ 파랑, 35-64 회색, 35 미만 amber
  const color =
    value >= 65 ? "bg-brand-100 text-brand-700"
      : value >= 35 ? "bg-slate-100 text-slate-700"
      : "bg-amber-100 text-amber-700";
  return (
    <div className={`rounded-lg ${color} px-3 py-2 text-center`}>
      <div className="text-[10px] opacity-75">{label}</div>
      <div className="text-lg font-bold mt-0.5">{value}</div>
      {highlight && (
        <div className="text-[9px] mt-0.5 font-medium uppercase tracking-wide">
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
    <div className="space-y-1.5">
      {entries.map(([age, v]) => (
        <div key={age} className="flex items-center gap-2 text-xs">
          <div className="w-14 text-slate-500">{age}</div>
          <div className="flex-1 h-5 bg-slate-100 rounded-sm overflow-hidden">
            <div
              className="h-full bg-brand-400"
              style={{ width: `${max ? ((v ?? 0) / max) * 100 : 0}%` }}
            />
          </div>
          <div className="w-16 text-right text-slate-600 font-medium">
            {v?.toLocaleString("ko-KR") ?? "—"}
          </div>
        </div>
      ))}
    </div>
  );
}
