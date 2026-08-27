import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import NavAuthLinks from "@/components/NavAuthLinks";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: {
    default: "MedSeek — Symptom Search Engine",
    template: "%s | MedSeek",
  },
  description:
    "Search for possible conditions based on your symptoms. MedSeek uses advanced ranking algorithms to match your symptoms with diseases, highlighting urgent conditions you shouldn't ignore.",
  keywords: [
    "symptom checker",
    "disease search",
    "medical symptoms",
    "health search engine",
    "symptom diagnosis",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {/* Header */}
        <header className="sticky top-0 z-50 border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
            <Link
              href="/"
              className="flex items-center gap-2.5 group"
              id="header-logo"
            >
              {/* Logo icon */}
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-md shadow-indigo-500/20 group-hover:shadow-lg group-hover:shadow-indigo-500/30 transition-shadow">
                <svg
                  className="w-5 h-5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-violet-600 dark:from-indigo-400 dark:to-violet-400 bg-clip-text text-transparent">
                MedSeek
              </span>
            </Link>

            <nav className="flex items-center gap-1 text-sm">
              <Link
                href="/"
                className="px-3 py-2 rounded-lg text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors font-medium"
              >
                Search
              </Link>
              <NavAuthLinks />
            </nav>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1">{children}</main>

        {/* Footer */}
        <footer className="border-t border-zinc-200 dark:border-zinc-800 py-6">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                © {new Date().getFullYear()} MedSeek. For informational purposes
                only.
              </p>
              <p className="text-xs text-red-600 dark:text-red-400 font-medium">
                ⚠️ Always consult a healthcare professional for medical advice.
              </p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
