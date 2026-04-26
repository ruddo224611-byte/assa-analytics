"use client";

/**
 * 창업 시뮬레이터 — 리포트 #5 섹션.
 *
 * 핵심 입력 3개 (평수 / 객단가 / 일평균 손님 — 기준 시나리오) +
 * 인건비 1개 = 사용자가 4개만 입력하면 즉시 3시나리오 BEP 계산.
 *
 * 임대료는 1층 데이터 자동. 다른 층은 Day 4+ 에서 선택 옵션.
 */

import { useState, useMemo } from "react";
import {
  calculate,
  fmtKrw,
  getUpjongDefaults,
  type SimulatorScenario,
} from "@/lib/simulator";

interface Props {
  업종: string;
  rentKrwPerM2K: number | null; // 1층 임대료 (천원/㎡)
}

export default function Simulator({ 업종, rentKrwPerM2K }: Props) {
  const defaults = getUpjongDefaults(업종);
  const [평수, set평수] = useState(30);
  const [객단가, set객단가] = useState(defaults.객단가);
  const [손님, set손님] = useState(defaults.일평균손님);
  const [인건비, set인건비] = useState(2_500_000);

  const result = useMemo(
    () =>
      calculate({
        rentKrwPerM2K,
        평수,
        객단가,
        일평균손님_기준: 손님,
        인건비,
        재료비율: defaults.재료비율,
      }),
    [rentKrwPerM2K, 평수, 객단가, 손님, 인건비, defaults.재료비율],
  );

  if (rentKrwPerM2K == null) {
    return (
      <div className="rounded-xl border-2 border-dashed border-amber-200 bg-amber-50 px-4 py-6 text-center">
        <p className="text-amber-700 text-sm">
          이 행정동 임대료 데이터 매핑이 없어 시뮬레이터 사용 어려워요.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 입력 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <NumInput label="평수" value={평수} onChange={set평수} suffix="평" min={5} step={5} />
        <NumInput label="객단가" value={객단가} onChange={set객단가} suffix="원" min={1000} step={500} />
        <NumInput label="일 손님 (기준)" value={손님} onChange={set손님} suffix="명" min={1} step={5} />
        <NumInput label="인건비 (월)" value={인건비} onChange={set인건비} suffix="원" min={0} step={100_000} />
      </div>

      {/* 가정 안내 */}
      <details className="text-xs text-slate-500">
        <summary className="cursor-pointer hover:text-slate-700">
          가정 자세히 보기
        </summary>
        <ul className="mt-2 space-y-1 pl-4 list-disc">
          <li>임대료: R-ONE 중대형 1층 평균 ({rentKrwPerM2K?.toFixed(1)} 천원/㎡) × 평수 환산</li>
          <li>업종 기본 재료비율: {(defaults.재료비율 * 100).toFixed(0)}% (업종별 표준 추정)</li>
          <li>기타 고정비: (월세 + 인건비) × 15% (관리비·공과금·소모품 추정)</li>
          <li>3시나리오: 일 손님 = 기준 × 1.5(낙관) / 1.0(기준) / 0.6(보수)</li>
        </ul>
      </details>

      {/* 결과 표 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {result.scenarios.map((s) => (
          <ScenarioCard key={s.label} s={s} />
        ))}
      </div>

      {/* 고정비 breakdown */}
      <div className="rounded-lg bg-slate-50 px-4 py-3 text-xs">
        <div className="text-slate-500 mb-2">월 고정비 구성</div>
        <div className="grid grid-cols-3 gap-2 text-slate-700">
          <div>월세 <span className="font-medium">{fmtKrw(result.고정비_breakdown.월세)}원</span></div>
          <div>인건비 <span className="font-medium">{fmtKrw(result.고정비_breakdown.인건비)}원</span></div>
          <div>기타 <span className="font-medium">{fmtKrw(result.고정비_breakdown.기타)}원</span></div>
        </div>
      </div>

      <p className="text-[11px] text-slate-400 text-center">
        ※ 참고용 추정. 실제 창업 손익은 권리금·인테리어·세금·계절성 등 변동 큼. 현장 검증 필수.
      </p>
    </div>
  );
}

function ScenarioCard({ s }: { s: SimulatorScenario }) {
  const profitable = s.월영업이익 > 0;
  const colorMap = {
    낙관: profitable ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50",
    기준: profitable ? "border-brand-200 bg-brand-50" : "border-amber-200 bg-amber-50",
    보수: profitable ? "border-slate-200 bg-slate-50" : "border-rose-200 bg-rose-50",
  };
  const labelColor = {
    낙관: "text-emerald-700",
    기준: "text-brand-700",
    보수: profitable ? "text-slate-700" : "text-rose-700",
  };
  return (
    <div className={`rounded-lg border ${colorMap[s.label]} p-4`}>
      <div className="flex items-baseline justify-between mb-2">
        <span className={`text-sm font-bold ${labelColor[s.label]}`}>{s.label}</span>
        <span className="text-xs text-slate-500">일 {s.일평균손님}명</span>
      </div>
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500">월 매출</span>
          <span className="font-medium text-slate-900">{fmtKrw(s.월매출)}원</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">월 영업이익</span>
          <span className={`font-bold ${profitable ? "text-slate-900" : "text-rose-600"}`}>
            {profitable ? "" : "−"}{fmtKrw(Math.abs(s.월영업이익))}원
          </span>
        </div>
        <div className="flex justify-between text-xs pt-1 border-t border-slate-200/60">
          <span className="text-slate-400">BEP 손님</span>
          <span className="text-slate-600">일 {s.BEP_손님}명 ({s.달성률_pct.toFixed(0)}%)</span>
        </div>
      </div>
      {!profitable && (
        <p className="mt-2 text-[11px] text-rose-600 font-medium">⚠ 적자 — 손님 수·객단가 조정 필요</p>
      )}
    </div>
  );
}

function NumInput({
  label, value, onChange, suffix, min = 0, step = 1,
}: {
  label: string; value: number; onChange: (n: number) => void;
  suffix?: string; min?: number; step?: number;
}) {
  return (
    <label className="block">
      <span className="text-xs text-slate-500 mb-1 block">{label}</span>
      <div className="relative">
        <input
          type="number"
          value={value}
          min={min}
          step={step}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="w-full rounded-md border border-slate-200 bg-white pl-3 pr-9 py-2 text-sm font-medium text-slate-900 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none"
        />
        {suffix && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}
