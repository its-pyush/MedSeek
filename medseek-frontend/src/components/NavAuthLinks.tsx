"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isLoggedIn, logout } from "@/lib/auth";
import {
  IconSearch,
  IconConsultation,
  IconVault,
  IconActivity,
  IconDashboard,
  IconLogin,
  IconLogout,
  IconMenu,
  IconClose,
} from "./icons";
import ThemeToggle from "./ThemeToggle";

interface NavLinkItem {
  href: string;
  label: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  public: boolean;
}

const allNavLinks: NavLinkItem[] = [
  { href: "/", label: "Search", Icon: IconSearch, public: true },
  { href: "/chat", label: "Consultation", Icon: IconConsultation, public: false },
  { href: "/vault", label: "Vault", Icon: IconVault, public: false },
  { href: "/activity", label: "Activity", Icon: IconActivity, public: false },
  { href: "/dashboard", label: "Dashboard", Icon: IconDashboard, public: false },
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    if (mobileOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileOpen]);

  if (!mounted) return null;

  const linksToShow = authed
    ? allNavLinks
    : allNavLinks.filter((l) => l.public);

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      {/* Desktop Navigation Links */}
      <div className="hidden sm:flex items-center gap-0.5">
        {linksToShow.map((link) => {
          const isActive = pathname === link.href;
          const { Icon } = link;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-1.5 px-3 h-9 rounded-xl text-sm font-medium tracking-tight transition-colors ${
                isActive
                  ? "text-brand-ink bg-brand/12 font-semibold"
                  : "text-slate-600 hover:text-slate-950 hover:bg-slate-900/5"
              }`}
            >
              <Icon size={15} className={isActive ? "text-brand" : "text-slate-500"} />
              {link.label}
            </Link>
          );
        })}
      </div>

      {/* Desktop Auth Actions */}
      {!authed ? (
        <div className="hidden sm:flex items-center gap-2 ml-1.5">
          <Link
            href="/login"
            className="btn-3d-secondary px-3.5 h-9 text-sm"
            id="nav-login"
          >
            Sign In
          </Link>
          <Link
            href="/signup"
            className="btn-3d-primary px-4 h-9 text-sm"
            id="nav-signup"
          >
            Register
          </Link>
        </div>
      ) : null}

      <ThemeToggle />

      {/* Mobile Menu Button (wrapper carries the breakpoint: the button class sets its own display) */}
      <div className="sm:hidden">
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="btn-3d-secondary w-9 h-9 rounded-xl"
          aria-label="Toggle navigation menu"
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <IconClose size={18} /> : <IconMenu size={18} />}
        </button>
      </div>

      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="sm:hidden fixed inset-0 z-40 bg-black/20 backdrop-blur-xs"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile Dropdown Menu */}
      {mobileOpen && (
        <div className="absolute top-[calc(100%+0.5rem)] left-0 right-0 sm:hidden glass-dropdown rounded-2xl p-3 animate-slide-up z-50">
          <nav className="flex flex-col gap-1.5">
            {linksToShow.map((link) => {
              const isActive = pathname === link.href;
              const { Icon } = link;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-3 min-h-11 rounded-xl text-base font-medium transition-colors ${
                    isActive ? "text-brand-ink bg-brand/12 font-semibold" : "text-slate-700 hover:bg-slate-900/5"
                  }`}
                >
                  <Icon size={16} className={isActive ? "text-brand" : "text-slate-500"} />
                  {link.label}
                </Link>
              );
            })}

            {!authed ? (
              <div className="pt-2 mt-1 border-t border-slate-200 flex flex-col gap-2">
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className="btn-3d-secondary w-full min-h-11 text-base"
                >
                  <IconLogin size={15} className="mr-1.5 text-slate-500" />
                  Sign In
                </Link>
                <Link
                  href="/signup"
                  onClick={() => setMobileOpen(false)}
                  className="btn-3d-primary w-full min-h-11 text-base"
                >
                  Register Account
                </Link>
              </div>
            ) : (
              <div className="pt-2 mt-1 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false);
                    logout();
                    window.location.href = "/";
                  }}
                  className="btn-3d-danger w-full min-h-11 text-base flex items-center justify-center gap-2"
                >
                  <IconLogout size={15} />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </nav>
        </div>
      )}
    </div>
  );
}
