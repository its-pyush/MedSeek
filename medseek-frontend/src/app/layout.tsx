import type { Metadata, Viewport } from "next";
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

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
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-800 overflow-x-hidden">
        {/* Header */}
        <div className="sticky top-2 sm:top-4 z-50 px-3 sm:px-6 pointer-events-none flex justify-center w-full">
          <header className="pointer-events-auto w-full max-w-5xl rounded-2xl border border-white/60 bg-white/40 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.08)] transition-all duration-500 hover:shadow-[0_8px_32px_rgba(0,0,0,0.12)] hover:bg-white/50 relative">
            <div className="px-3.5 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
              <Link
                href="/"
                className="flex items-center gap-2 sm:gap-2.5 group shrink-0"
                id="header-logo"
              >
                {/* Logo icon */}
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-md shadow-blue-600/20 group-hover:shadow-lg group-hover:shadow-blue-600/30 group-hover:-translate-y-0.5 transition-all duration-300">
                  <svg
                    className="w-4 h-4 sm:w-5 sm:h-5 text-white"
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
                <span className="text-lg sm:text-xl font-bold text-blue-600 group-hover:text-blue-700 transition-colors">
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
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
              <p className="text-xs text-slate-500">
                © {new Date().getFullYear()} MedSeek. For informational purposes only.
              </p>
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50/80 border border-amber-200 text-xs text-amber-800 font-medium">
                <span>⚠️</span>
                <span>Always consult a healthcare professional for medical advice.</span>
              </div>
            </div>
          </div>
          <div className="mt-3 sm:mt-0 sm:absolute sm:bottom-2 sm:right-4 text-center sm:text-right text-xs text-slate-400">
            v1.1
          </div>
        </footer>
      </body>
    </html>
  );
}
