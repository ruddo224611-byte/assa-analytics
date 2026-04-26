"use client";

/**
 * 창업 시뮬레이터 — 리포트 #5 섹션.
 *
 * Phase 3 Day 2 변경: 3시나리오 (낙관/기준/보수) → 단일 결과 (운영자 피드백).
 * 사용자가 입력한 값 그대로 계산해서 결과 보여줌.
 *
 * 핵심 입력 4개 (평수 / 객단가 / 일평균 손님 / 인건비) → 즉시 BEP 계산.
 */

import { useState, useMemo } from "react";
import { calculate, fmtKrw, getUpjongDefaults } from "@/lib/simulator";

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
        일평균손님: 손님,
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

  const profitable = result.월영업이익 > 0;

  return (
    <div className="space-y-5">
      {/* 입력 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <NumInput label="평수" value={평수} onChange={set평수} suffix="평" min={5} step={5} />
        <NumInput label="객단가" value={객단가} onChange={set객단가} suffix="원" min={1000} step={500} />
        <NumInput label="일평균 손님" value={손님} onChange={set손님} suffix="명" min={1} step={5} />
        <NumInput label="인건비 (월)" value={인건비} onChange={set인건비} suffix="원" min={0} step={100_000} />
      </div>

      {/* 가정 안내 */}
      <details className="text-xs text-slate-500">
        <summary className="cursor-pointer hover:text-slate-700">
          계산 가정 자세히 보기
        </summary>
        <ul className="mt-2 space-y-1 pl-4 list-disc">
          <li>임대료: R-ONE 중대형 1층 평균 ({rentKrwPerM2K?.toFixed(1)} 천원/㎡) × 평수 환산</li>
          <li>업종 기본 재료비율: {(defaults.재료비율 * 100).toFixed(0)}% (업종별 표준 추정)</li>
          <li>기타 고정비: (월세 + 인건비) × 15% (관리비·공과금·소모품 추정)</li>
          <li>월 매출 = 일평균 손님 × 객단가 × 30일</li>
        </ul>
      </details>

      {/* 결과 카드 (단일) */}
      <div className={`rounded-xl border-2 p-5 ${
        profitable ? "border-brand-200 bg-brand-50/50" : "border-rose-200 bg-rose-50"
      }`}>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <ResultStat label="월 매출" value={`${fmtKrw(result.월매출)}원`} />
          <ResultStat
            label="월 영업이익"
            value={`${profitable ? "" : "−"}${fmtKrw(Math.abs(result.월영업이익))}원`}
            highlight={profitable ? "brand" : "rose"}
          />
        </div>
        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200/60 text-sm">
          <div>
            <div className="text-slate-500 text-xs mb-0.5">손익분기점 (BEP)</div>
            <div className="text-slate-700 font-medium">
              월 매출 {fmtKrw(result.BEP_매출)}원 / 일 손님 {result.BEP_손님}명
            </div>
          </div>
          <div>
            <div className="text-slate-500 text-xs mb-0.5">BEP 대비 달성률</div>
            <div className={`font-medium ${profitable ? "text-brand-700" : "text-rose-700"}`}>
              {result.달성률_pct.toFixed(0)}%
            </div>
          </div>
        </div>
        {!profitable && (
          <p className="mt-3 text-xs text-rose-700">
            ⚠ 적자 — 손님 수·객단가·평수 조정해서 흑자 조건 찾아보세요.
          </p>
        )}
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

function ResultStat({
  label, value, highlight,
}: { label: string; value: string; highlight?: "brand" | "rose" }) {
  const color = highlight === "brand"
    ? "text-brand-700"
    : highlight === "rose"
      ? "text-rose-700"
      : "text-slate-900";
  return (
    <div>
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
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
