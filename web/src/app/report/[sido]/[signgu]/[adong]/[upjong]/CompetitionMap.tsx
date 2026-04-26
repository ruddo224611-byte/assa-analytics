"use client";

/**
 * 카카오맵 임베드 — 리포트 #3 경쟁 섹션. Phase 2 Day 4.
 *
 * 동작:
 *   1. /data/{sido}/{signgu}-stores.json fetch (lazy)
 *   2. 현재 업종의 sbiz 코드로 필터
 *   3. 카카오맵 SDK 로드 후 핀 표시
 *   4. 반경 500m / 1km 토글
 *
 * fallback:
 *   - stores 파일 없으면 (Day 4 는 강남구만 commit) "다른 시군구는 다음 빌드 후" 메시지
 *   - NEXT_PUBLIC_KAKAO_JS_KEY 없으면 안내
 */

import { useEffect, useRef, useState, useMemo } from "react";
import Script from "next/script";

interface Store {
  name: string;
  branch?: string;
  sclsCd: string;
  sclsNm: string;
  addr: string;
  floor?: string;
  lng: number;
  lat: number;
}

interface Props {
  centerLng: number;
  centerLat: number;
  시도: string;
  시군구: string;
  sbizCodes: string[];
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    kakao: any;
  }
}

function distMeters(lng1: number, lat1: number, lng2: number, lat2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export default function CompetitionMap({ centerLng, centerLat, 시도, 시군구, sbizCodes }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [stores, setStores] = useState<Store[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [radius, setRadius] = useState<500 | 1000>(500);

  // stores fetch (lazy, mount 시)
  useEffect(() => {
    const url = `/data/${encodeURIComponent(시도)}/${encodeURIComponent(시군구)}-stores.json`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then((d: { stores: Store[] }) => {
        const codeSet = new Set(sbizCodes);
        const matched = d.stores.filter((s) => codeSet.has(s.sclsCd));
        setStores(matched);
      })
      .catch((e) => {
        setError(`이 시군구의 stores 데이터가 아직 빌드되지 않았어요 (${String(e)}). Day 5+ 디스크 전략 결정 후 추가됩니다.`);
      });
  }, [시도, 시군구, sbizCodes]);

  // 반경 안 stores
  const filtered = useMemo(() => {
    if (!stores) return [];
    return stores.filter(
      (s) => distMeters(centerLng, centerLat, s.lng, s.lat) <= radius,
    );
  }, [stores, centerLng, centerLat, radius]);

  // 지도 init
  useEffect(() => {
    if (!sdkReady || !stores || !containerRef.current) return;
    if (!window.kakao?.maps) return;
    window.kakao.maps.load(() => {
      const container = containerRef.current!;
      // 기존 자식 제거 (radius 변경 시 re-init)
      container.innerHTML = "";
      const map = new window.kakao.maps.Map(container, {
        center: new window.kakao.maps.LatLng(centerLat, centerLng),
        level: radius === 500 ? 4 : 5, // 줌
      });
      // 중심 원
      new window.kakao.maps.Circle({
        map,
        center: new window.kakao.maps.LatLng(centerLat, centerLng),
        radius,
        strokeColor: "#2563eb",
        strokeOpacity: 0.7,
        strokeWeight: 2,
        fillColor: "#3b82f6",
        fillOpacity: 0.1,
      });
      // 마커
      filtered.forEach((s) => {
        new window.kakao.maps.Marker({
          map,
          position: new window.kakao.maps.LatLng(s.lat, s.lng),
          title: s.name + (s.branch ? ` ${s.branch}` : ""),
        });
      });
    });
  }, [sdkReady, stores, filtered, centerLng, centerLat, radius]);

  const apikey = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
  if (!apikey) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
        지도 표시 안 됨 — NEXT_PUBLIC_KAKAO_JS_KEY 환경변수가 필요해요. (Vercel Settings → Environment Variables 에 등록)
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
        🗺️ {error}
      </div>
    );
  }

  return (
    <>
      <Script
        src={`//dapi.kakao.com/v2/maps/sdk.js?appkey=${apikey}&autoload=false`}
        strategy="afterInteractive"
        onLoad={() => setSdkReady(true)}
      />
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setRadius(500)}
            className={radius === 500 ? activeBtn : inactiveBtn}
          >
            반경 500m
          </button>
          <button
            type="button"
            onClick={() => setRadius(1000)}
            className={radius === 1000 ? activeBtn : inactiveBtn}
          >
            반경 1km
          </button>
          <span className="text-xs text-slate-500 ml-auto">
            {!stores ? "데이터 로딩 중…" : `핀 ${filtered.length}개 표시 (반경 ${radius}m)`}
          </span>
        </div>
        <div
          ref={containerRef}
          className="w-full aspect-[4/3] sm:aspect-[16/10] rounded-lg overflow-hidden bg-slate-100"
        >
          {!sdkReady && (
            <div className="w-full h-full flex items-center justify-center text-sm text-slate-400">
              카카오맵 로딩 중…
            </div>
          )}
        </div>
        <p className="text-[11px] text-slate-400">
          ※ 핀 위치는 공단 B553077 의 행정동 단위 좌표. 실제 매장 위치와 미세 차이 가능. 클릭 시 상호명 (브라우저 기본 tooltip).
        </p>
      </div>
    </>
  );
}

const activeBtn =
  "rounded-md bg-brand-600 text-white text-xs font-medium px-3 py-1.5 hover:bg-brand-700 transition-colors";
const inactiveBtn =
  "rounded-md bg-slate-100 text-slate-600 text-xs font-medium px-3 py-1.5 hover:bg-slate-200 transition-colors";
