import type { Metadata } from "next";
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
        <header className="border-b border-slate-200 bg-white">
          <div className="flex w-full items-center gap-3 px-3 py-2 sm:px-4 sm:py-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.svg"
              alt="아싸"
              width={40}
              height={40}
              className="h-9 w-9 sm:h-10 sm:w-10 flex-shrink-0"
            />
            <span
              className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900"
              style={{ fontFamily: "'Gmarket Sans', Pretendard, sans-serif" }}
            >
              아싸 상권분석
            </span>
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
