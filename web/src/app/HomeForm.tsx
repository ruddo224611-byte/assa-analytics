"use client";

/**
 * 홈 페이지 cascade dropdown — 시도 → 시군구 → 행정동 → 업종 → 리포트로 이동.
 *
 * 입력: server component 가 region-index.json 을 props 로 전달
 * 출력: 4개 select 로 사용자가 선택 → 버튼 클릭 → /report/{...} 이동
 *
 * UX:
 *   - cascade: 상위 선택 안 되면 하위 disabled
 *   - 검색 가능한 select 는 Day 3 이상에서 (지금은 단순 native select)
 *   - 모바일 고려: select 박스 충분히 크게
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export interface RegionIndex {
  시도: { name: string; 시군구: { name: string; 행정동: string[] }[] }[];
  업종: string[];
}

export default function HomeForm({ index }: { index: RegionIndex }) {
  const router = useRouter();
  const [sido, setSido] = useState("");
  const [signgu, setSigngu] = useState("");
  const [adong, setAdong] = useState("");
  const [upjong, setUpjong] = useState("");

  const sidoObj = useMemo(() => index.시도.find((s) => s.name === sido), [index, sido]);
  const signguObj = useMemo(() => sidoObj?.시군구.find((g) => g.name === signgu), [sidoObj, signgu]);

  const canSubmit = sido && signgu && adong && upjong;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const url = `/report/${encodeURIComponent(sido)}/${encodeURIComponent(signgu)}/${encodeURIComponent(adong)}/${encodeURIComponent(upjong)}`;
    router.push(url);
  }

  function quickPick() {
    setSido("서울특별시");
    setSigngu("강남구");
    setAdong("역삼1동");
    setUpjong("커피음료점");
  }

  return (
    <form onSubmit={handleSubmit} className="card p-6 sm:p-8 space-y-4">
      <Field label="시도">
        <select
          className={selectCls}
          value={sido}
          onChange={(e) => { setSido(e.target.value); setSigngu(""); setAdong(""); }}
        >
          <option value="">시도 선택</option>
          {index.시도.map((s) => (
            <option key={s.name} value={s.name}>{s.name}</option>
          ))}
        </select>
      </Field>

      <Field label="시군구">
        <select
          className={selectCls}
          value={signgu}
          onChange={(e) => { setSigngu(e.target.value); setAdong(""); }}
          disabled={!sidoObj}
        >
          <option value="">{sidoObj ? "시군구 선택" : "시도 먼저 선택"}</option>
          {sidoObj?.시군구.map((g) => (
            <option key={g.name} value={g.name}>{g.name}</option>
          ))}
        </select>
      </Field>

      <Field label="행정동">
        <select
          className={selectCls}
          value={adong}
          onChange={(e) => setAdong(e.target.value)}
          disabled={!signguObj}
        >
          <option value="">{signguObj ? `행정동 선택 (${signguObj.행정동.length}개)` : "시군구 먼저 선택"}</option>
          {signguObj?.행정동.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </Field>

      <Field label="업종">
        <select
          className={selectCls}
          value={upjong}
          onChange={(e) => setUpjong(e.target.value)}
        >
          <option value="">업종 선택 ({index.업종.length}개)</option>
          {index.업종.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
      </Field>

      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <button
          type="submit"
          disabled={!canSubmit}
          className="flex-1 rounded-lg bg-brand-600 px-6 py-3 text-white font-semibold hover:bg-brand-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
        >
          {canSubmit ? "📊 리포트 보기" : "위 4개 모두 선택해주세요"}
        </button>
        <button
          type="button"
          onClick={quickPick}
          className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 hover:border-brand-300 hover:bg-brand-50 transition-colors"
        >
          예시: 강남 역삼1동 카페
        </button>
      </div>

      <p className="text-xs text-slate-400 pt-2 text-center">
        총 {index.시도.length} 시도 / {index.시도.reduce((a, s) => a + s.시군구.length, 0)} 시군구 /{" "}
        {index.시도.reduce((a, s) => a + s.시군구.reduce((b, g) => b + g.행정동.length, 0), 0).toLocaleString()} 행정동 ·{" "}
        {index.업종.length} 업종 데이터 보유
      </p>
    </form>
  );
}

const selectCls =
  "w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 " +
  "focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none " +
  "disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700 mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}
