import type { Metadata, Viewport } from "next";
import { Roboto } from "next/font/google";
import Link from "next/link";
import NavAuthLinks from "@/components/NavAuthLinks";
import { themeInitScript } from "@/components/ThemeToggle";
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
    <html lang="en" className={`${roboto.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-canvas text-slate-900 overflow-x-hidden relative">
        {/* Header: a floating frosted bar */}
        <header className="sticky top-0 z-50 w-full px-2.5 sm:px-4 pt-2 h-14">
          <div className="glass-header relative max-w-6xl mx-auto h-12 px-3 sm:px-4 rounded-2xl flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 group shrink-0" id="header-logo">
              <MedSeekLogo size={26} className="text-brand group-hover:opacity-90 transition-opacity" />
              <span className="text-lg font-bold tracking-tight text-slate-900 leading-none">MedSeek</span>
            </Link>

            <nav className="flex items-center text-sm">
              <NavAuthLinks />
            </nav>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 flex flex-col">{children}</main>

        {/* Footer - Warm Frosted Glass Baseline */}
        <footer className="border-t border-line/80 bg-canvas py-4 sm:py-5">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
            <p>
              © {new Date().getFullYear()} MedSeek
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
