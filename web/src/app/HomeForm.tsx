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

import { useMemo, useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { searchUpjong } from "@/lib/upjong-aliases";

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

      <Field label="업종 (검색 또는 선택)">
        <UpjongCombobox
          value={upjong}
          onChange={setUpjong}
          options={index.업종}
        />
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

/**
 * 업종 검색 + 선택 combobox.
 * - 텍스트 입력 → 별칭/정식명/substring 매칭 (upjong-aliases.ts)
 * - 화살표/엔터로 선택, 클릭으로 선택, blur 시 닫힘
 */
function UpjongCombobox({
  value, onChange, options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // value 가 외부에서 set 되면 query 동기화
  useEffect(() => {
    if (value && !open) setQuery(value);
  }, [value, open]);

  // outside click → 닫기
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const results = useMemo(() => {
    if (!query.trim()) return options.slice(0, 8); // 빈 입력 → 처음 8개
    return searchUpjong(query, options, 8);
  }, [query, options]);

  function pick(u: string) {
    onChange(u);
    setQuery(u);
    setOpen(false);
    setHighlightIdx(0);
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlightIdx(0);
          if (e.target.value === "") onChange("");
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setHighlightIdx((i) => Math.min(i + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlightIdx((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && open && results[highlightIdx]) {
            e.preventDefault();
            pick(results[highlightIdx]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder="업종 검색 (예: 카페, 치킨, 헬스장)"
        className={selectCls}
        autoComplete="off"
      />
      {open && results.length > 0 && (
        <ul className="absolute left-0 right-0 mt-1 max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg z-10">
          {results.map((u, i) => (
            <li
              key={u}
              onMouseDown={(e) => { e.preventDefault(); pick(u); }}
              onMouseEnter={() => setHighlightIdx(i)}
              className={`px-4 py-2.5 cursor-pointer text-sm ${
                i === highlightIdx
                  ? "bg-brand-50 text-brand-700 font-medium"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              {u}
            </li>
          ))}
        </ul>
      )}
      {open && query.trim() && results.length === 0 && (
        <div className="absolute left-0 right-0 mt-1 rounded-lg border border-slate-200 bg-white shadow-lg z-10 px-4 py-3 text-sm text-slate-500">
          매칭 업종 없음 — 다른 키워드 (예: 카페, 분식, 미용실)
        </div>
      )}
    </div>
  );
}
