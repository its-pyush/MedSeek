"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isLoggedIn } from "@/lib/auth";

const allNavLinks = [
  { href: "/", label: "Search", icon: "🔍", public: true },
  { href: "/chat", label: "AI Chat", icon: "💬", public: false },
  { href: "/vault", label: "Vault", icon: "🔒", public: false },
  { href: "/activity", label: "Activity", icon: "📊", public: false },
  { href: "/dashboard", label: "Dashboard", icon: "👤", public: false },
];

export default function NavAuthLinks() {
  const [authed, setAuthed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAuthed(isLoggedIn());
    setMounted(true);
    const handleStorage = () => setAuthed(isLoggedIn());
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  if (!mounted) return null;

  const linksToShow = authed
    ? allNavLinks
    : allNavLinks.filter((l) => l.public);

  return (
    <div className="flex items-center gap-1 sm:gap-2">
      {/* Desktop Links */}
      <div className="hidden sm:flex items-center gap-1">
        {linksToShow.map((link) => {
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`relative px-3.5 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "text-blue-600 bg-blue-50/80 shadow-xs border border-blue-200/60"
                  : "text-slate-600 hover:text-blue-600 hover:bg-slate-100/70"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </div>

      {/* Auth action buttons for unauthenticated state */}
      {!authed ? (
        <div className="flex items-center gap-1.5">
          <Link
            href="/login"
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
              pathname === "/login"
                ? "text-blue-600 bg-blue-50/80 border border-blue-200/60"
                : "text-slate-700 hover:text-blue-600 hover:bg-slate-100/70"
            }`}
            id="nav-login"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="px-4 py-1.5 rounded-full bg-gradient-to-r from-blue-600 to-emerald-600 text-white text-sm font-semibold shadow-sm shadow-blue-500/20 hover:shadow-md hover:shadow-blue-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
            id="nav-signup"
          >
            Sign up
          </Link>
        </div>
      ) : null}

      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="sm:hidden p-2 rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
        aria-label="Toggle menu"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          {mobileOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="absolute top-[calc(100%+0.5rem)] left-0 right-0 sm:hidden bg-white/95 backdrop-blur-2xl border border-slate-200/80 rounded-2xl shadow-xl p-3 animate-slide-up z-50">
          <nav className="flex flex-col gap-1">
            {linksToShow.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    isActive
                      ? "text-blue-600 bg-blue-50 border border-blue-200/60 font-semibold"
                      : "text-slate-700 hover:bg-slate-100 hover:text-blue-600"
                  }`}
                >
                  <span className="text-base">{link.icon}</span>
                  {link.label}
                </Link>
              );
            })}

            {!authed && (
              <div className="pt-2 mt-1 border-t border-slate-100 flex flex-col gap-1">
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  <span>🔑</span> Log in
                </Link>
                <Link
                  href="/signup"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center justify-center py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-blue-600 to-emerald-600 text-white shadow-sm"
                >
                  Sign up
                </Link>
              </div>
            )}
          </nav>
        </div>
      )}
    </div>
  );
}
