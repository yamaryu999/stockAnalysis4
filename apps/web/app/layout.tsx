import "./globals.css";
import Link from "next/link";
import { t } from "@/lib/i18n";

export const metadata = {
  title: t("app.title"),
  description: "イベント・ドリブン銘柄レーダー MVP"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-surface text-slate-100">
        <header className="border-b border-slate-800 bg-surface-100/80 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <h1 className="text-lg font-semibold tracking-wide">{t("app.title")}</h1>
            <nav className="flex items-center gap-4 text-sm text-slate-300">
              <Link href="/dashboard" className="hover:text-white">
                {t("app.nav.dashboard")}
              </Link>
              <Link href="/settings" className="hover:text-white">
                {t("app.nav.settings")}
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto min-h-[calc(100vh-64px)] max-w-6xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
