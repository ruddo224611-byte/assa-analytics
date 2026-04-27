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
  // 사용자가 입력한 원본 검색어 (AI 추천 선택 시) — URL ?keyword 로 전달해서 핀 정확 필터
  const [keyword, setKeyword] = useState("");

  const sidoObj = useMemo(() => index.시도.find((s) => s.name === sido), [index, sido]);
  const signguObj = useMemo(() => sidoObj?.시군구.find((g) => g.name === signgu), [sidoObj, signgu]);

  const canSubmit = sido && signgu && adong && upjong;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const base = `/report/${encodeURIComponent(sido)}/${encodeURIComponent(signgu)}/${encodeURIComponent(adong)}/${encodeURIComponent(upjong)}`;
    const url = keyword && keyword !== upjong ? `${base}?keyword=${encodeURIComponent(keyword)}` : base;
    router.push(url);
  }

  function quickPick() {
    setSido("서울특별시");
    setSigngu("강남구");
    setAdong("역삼1동");
    setUpjong("커피음료점");
    setKeyword("");
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
          onKeyword={setKeyword}
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
 * - 즉시: 별칭/정식명/substring 매칭 (upjong-aliases.ts)
 * - 300ms debounce 후: LLM 검색 (/api/upjong-search) — 별칭에 없는 자유 검색어 매칭
 *   예: "필라테스" → 헬스클럽 / 예체능학원
 */
interface AIMatch { name: string; reason: string; }

function UpjongCombobox({
  value, onChange, onKeyword, options,
}: {
  value: string;
  onChange: (v: string) => void;
  onKeyword: (q: string) => void; // AI 추천 선택 시 원본 검색어 (URL keyword 용)
  options: string[];
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [aiMatches, setAiMatches] = useState<AIMatch[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value && !open) setQuery(value);
  }, [value, open]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const localResults = useMemo(() => {
    if (!query.trim()) return options.slice(0, 8);
    return searchUpjong(query, options, 8);
  }, [query, options]);

  // LLM 검색 — debounce 300ms, 로컬 결과 0개일 때만 (불필요 호출 절약)
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || localResults.length > 0) {
      setAiMatches([]);
      setAiLoading(false);
      return;
    }
    setAiLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/upjong-search?q=${encodeURIComponent(q)}`);
        const d = await r.json();
        setAiMatches(d.matches ?? []);
      } catch {
        setAiMatches([]);
      } finally {
        setAiLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, localResults.length]);

  // 키보드 네비용 통합 리스트 (로컬 + AI)
  const allItems = useMemo(() => {
    const items: { kind: "local" | "ai"; name: string; reason?: string }[] = [];
    for (const u of localResults) items.push({ kind: "local", name: u });
    for (const m of aiMatches) {
      if (!items.find((i) => i.name === m.name))
        items.push({ kind: "ai", name: m.name, reason: m.reason });
    }
    return items;
  }, [localResults, aiMatches]);

  function pick(u: string, isAiPick = false) {
    onChange(u);
    // AI 추천에서 선택했고 사용자 입력이 정식 업종명과 다르면 keyword 로 저장
    if (isAiPick && query.trim() && query.trim() !== u) {
      onKeyword(query.trim());
    } else {
      onKeyword("");
    }
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
            setHighlightIdx((i) => Math.min(i + 1, allItems.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlightIdx((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && open && allItems[highlightIdx]) {
            e.preventDefault();
            const item = allItems[highlightIdx];
            pick(item.name, item.kind === "ai");
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder="업종 검색 (예: 카페, 필라테스, 키즈카페)"
        className={selectCls}
        autoComplete="off"
      />
      {open && (allItems.length > 0 || aiLoading) && (
        <div className="absolute left-0 right-0 mt-1 max-h-80 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg z-10">
          {/* 즉시 결과 */}
          {localResults.length > 0 && (
            <ul>
              {localResults.map((u, i) => (
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
          {/* AI 추천 */}
          {(aiMatches.length > 0 || aiLoading) && (
            <div className="border-t border-slate-100">
              <div className="px-4 py-1.5 text-[10px] font-medium text-brand-600 bg-brand-50/60 uppercase tracking-wide">
                {aiLoading ? "🤖 AI 분석 중..." : "💡 AI 추천 (가장 가까운 업종)"}
              </div>
              {aiMatches.map((m, i) => {
                const idx = localResults.length + i;
                return (
                  <div
                    key={m.name}
                    onMouseDown={(e) => { e.preventDefault(); pick(m.name, true); }}
                    onMouseEnter={() => setHighlightIdx(idx)}
                    className={`px-4 py-2.5 cursor-pointer ${
                      idx === highlightIdx
                        ? "bg-brand-50"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <div className={`text-sm font-medium ${idx === highlightIdx ? "text-brand-700" : "text-slate-800"}`}>
                      {m.name}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">{m.reason}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {open && query.trim().length >= 2 && allItems.length === 0 && !aiLoading && (
        <div className="absolute left-0 right-0 mt-1 rounded-lg border border-slate-200 bg-white shadow-lg z-10 px-4 py-3 text-sm text-slate-500">
          매칭 업종 없음 — 다른 키워드 시도 (예: 카페, 분식, 미용실)
        </div>
      )}
    </div>
  );
}
