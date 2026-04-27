import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "아싸 상권분석",
  description: "자영업자를 위한 상권 데이터 분석 - 창업 의사결정 도우미",
  other: {
    "color-scheme": "light",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-white text-slate-900 antialiased flex flex-col">
        {/* assasup.com 과 동일 패턴: max-w 안 좌측 정렬 + 클릭 시 홈 */}
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 hover:opacity-80 transition-opacity"
              aria-label="아싸 상권분석 홈으로"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.png"
                alt=""
                width={32}
                height={32}
                className="h-8 w-8"
              />
              <span
                className="text-lg sm:text-xl font-bold tracking-tight text-slate-900"
                style={{ fontFamily: "'Gmarket Sans', Pretendard, sans-serif" }}
              >
                아싸 상권분석
              </span>
            </Link>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-slate-200 bg-slate-50">
          <div className="mx-auto max-w-5xl px-6 py-6 text-sm text-slate-500">
            © 2026 아싸 시리즈 · 자매 사이트:{" "}
            <a
              href="https://assasup.com"
              className="text-brand-600 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              assasup.com
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}
