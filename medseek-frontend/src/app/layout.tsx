import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import Link from "next/link";
import NavAuthLinks from "@/components/NavAuthLinks";
import "./globals.css";

const roboto = Roboto({
  weight: ["300", "400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-roboto",
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
    <html lang="en" className={`${roboto.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-800">
        {/* Header */}
        <div className="sticky top-4 z-50 px-4 sm:px-6 pointer-events-none flex justify-center w-full">
          <header className="pointer-events-auto w-full max-w-5xl rounded-2xl border border-white/60 bg-white/40 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.08)] transition-all duration-500 hover:shadow-[0_8px_32px_rgba(0,0,0,0.12)] hover:bg-white/50 relative">
            <div className="px-4 sm:px-6 h-16 flex items-center justify-between">
              <Link
                href="/"
                className="flex items-center gap-2.5 group"
                id="header-logo"
              >
                {/* Logo icon */}
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-emerald-600 flex items-center justify-center shadow-md shadow-blue-500/20 group-hover:shadow-lg group-hover:shadow-blue-500/40 group-hover:-translate-y-0.5 transition-all duration-300">
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
                <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-emerald-600 bg-clip-text text-transparent group-hover:opacity-80 transition-opacity">
                  MedSeek
                </span>
              </Link>

              <nav className="flex items-center text-sm">
                <NavAuthLinks />
              </nav>
            </div>
          </header>
        </div>

        {/* Main content */}
        <main className="flex-1 flex flex-col">{children}</main>

        {/* Footer */}
        <footer className="border-t border-slate-200/80 bg-white/60 backdrop-blur-md py-6 relative">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-xs text-slate-500">
                © {new Date().getFullYear()} MedSeek. For informational purposes only.
              </p>
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50/80 border border-amber-200 text-xs text-amber-800 font-medium">
                <span>⚠️</span>
                <span>Always consult a healthcare professional for medical advice.</span>
              </div>
            </div>
          </div>
          <div className="absolute bottom-2 right-4 text-xs text-slate-400">
            v1.1
          </div>
        </footer>
      </body>
    </html>
  );
}
