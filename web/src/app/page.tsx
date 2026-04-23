export default function Home() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-20 sm:py-28 text-center">
      <div className="mb-6 flex justify-center">
        <span className="chip-brand">곧 오픈합니다</span>
      </div>

      <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-slate-900 text-balance">
        데이터로 검증하는{" "}
        <span className="text-brand-600">자영업 창업 의사결정</span>
      </h1>

      <p className="mt-5 text-base sm:text-lg text-slate-600 text-balance">
        지역 × 업종 입력하면 상권 리포트가 나옵니다
      </p>

      <div className="card mt-12 p-10 text-center">
        <p className="text-sm text-slate-400 mb-2">개발 중</p>
        <p className="text-base sm:text-lg text-slate-500">
          지역 선택 · 업종 선택 UI 자리
        </p>
      </div>
    </section>
  );
}
