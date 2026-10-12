import type { Metadata, Viewport } from "next";
import { Roboto } from "next/font/google";
import Link from "next/link";
import NavAuthLinks from "@/components/NavAuthLinks";
import { MedSeekLogo, IconWarning } from "@/components/icons";
import "./globals.css";

const roboto = Roboto({
  weight: ["400", "500", "700"],
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
    default: "MedSeek — Clinical Diagnostic Search",
    template: "%s | MedSeek",
  },
  description:
    "Clinical decision support and differential symptom diagnosis engine for patients and healthcare providers.",
  keywords: [
    "symptom checker",
    "clinical differential",
    "disease search",
    "medical diagnosis engine",
    "triage urgency",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${roboto.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[#fff8eb] text-slate-900 overflow-x-hidden relative selection:bg-[#3a5ebb]/20 selection:text-[#1e336d]">
        {/* Header - Frosted Optical Glass Command Bar */}
        <header className="sticky top-0 z-50 w-full glass-header">
          <div className="max-w-6xl mx-auto px-3.5 sm:px-6 h-13 sm:h-14 flex items-center justify-between">
            <Link
              href="/"
              className="flex items-center gap-2.5 group shrink-0"
              id="header-logo"
            >
              <MedSeekLogo size={28} className="text-[#3a5ebb] group-hover:opacity-90 transition-opacity" />
              <div className="flex flex-col">
                <span className="text-base sm:text-lg font-bold tracking-tight text-slate-900 leading-none">
                  MedSeek
                </span>
                <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-500 leading-none mt-0.5">
                  Clinical Diagnostics
                </span>
              </div>
            </Link>

            <nav className="flex items-center text-sm">
              <NavAuthLinks />
            </nav>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 flex flex-col">{children}</main>

        {/* Footer - Warm Frosted Glass Baseline */}
        <footer className="border-t border-[#e2dcd0]/80 bg-[#fff8eb]/85 backdrop-blur-md py-4 sm:py-5">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
            <p>
              © {new Date().getFullYear()} MedSeek Systems. Clinical decision support.
            </p>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md glass-chip text-slate-700">
              <IconWarning size={14} className="text-amber-600 shrink-0" />
              <span>For reference only. Not a replacement for professional physician consultation.</span>
            </div>
            <span className="text-slate-400 font-mono text-[11px]">v1.2</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
