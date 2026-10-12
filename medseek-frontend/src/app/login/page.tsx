"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { loginApi } from "@/lib/auth";
import { IconLogin, IconWarning, IconArrowLeft } from "@/components/icons";
import Threads from "@/components/Threads";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await loginApi(email, password);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[75vh] flex items-center justify-center px-4 py-8 relative overflow-hidden">
      {/* Background Animated Threads Canvas */}
      <div className="absolute inset-0 z-0 pointer-events-auto">
        <Threads
          color={[0.23, 0.37, 0.73]}
          amplitude={1.1}
          distance={0.15}
          enableMouseInteraction={false}
        />
      </div>

      {/* Ambient optical diffusion orbs */}
      <div className="absolute top-[20%] left-[30%] w-72 h-72 rounded-full bg-[#fed7aa]/25 blur-[80px] pointer-events-none z-0" />
      <div className="absolute bottom-[20%] right-[30%] w-80 h-80 rounded-full bg-[#3a5ebb]/10 blur-[90px] pointer-events-none z-0" />

      <div className="w-full max-w-sm relative z-10">
        {/* Optical Glass Card */}
        <div className="p-6 sm:p-7 rounded-2xl glass-panel shadow-lg">
          {/* Header */}
          <div className="text-center mb-5">
            <div className="w-11 h-11 mx-auto mb-3 rounded-xl glass-chip flex items-center justify-center text-[#3a5ebb] shadow-xs">
              <IconLogin size={20} />
            </div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">
              Clinical Portal Sign In
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              Access your encrypted health profile and consultations
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {error && (
              <div className="p-2.5 rounded-lg bg-red-50/90 backdrop-blur-xs border border-red-200 text-red-700 text-xs flex items-center gap-2 animate-shake">
                <IconWarning size={14} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label
                htmlFor="email"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@institution.com"
                className="w-full px-3 py-2 rounded-lg border border-slate-300/80 bg-white/80 backdrop-blur-xs text-slate-800 placeholder:text-slate-400 text-xs focus:outline-none focus:border-[#3a5ebb] focus:ring-2 focus:ring-[#3a5ebb]/15 transition-all"
                autoComplete="email"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 rounded-lg border border-slate-300/80 bg-white/80 backdrop-blur-xs text-slate-800 placeholder:text-slate-400 text-xs focus:outline-none focus:border-[#3a5ebb] focus:ring-2 focus:ring-[#3a5ebb]/15 transition-all"
                autoComplete="current-password"
                minLength={8}
              />
            </div>

            <div className="pt-1">
              <button
                type="submit"
                disabled={isLoading}
                className="btn-3d-primary w-full py-2 px-4 rounded-lg text-xs"
              >
                {isLoading ? "Authenticating..." : "Sign In to Portal"}
              </button>
            </div>
          </form>

          {/* Footer Navigation */}
          <p className="mt-4 text-center text-xs text-slate-500 pt-3 border-t border-slate-200/60">
            Need to establish an account?{" "}
            <Link
              href="/signup"
              className="font-semibold text-[#3a5ebb] hover:text-[#2a4693] hover:underline"
            >
              Register
            </Link>
          </p>
        </div>

        {/* Back Link */}
        <p className="mt-4 text-center text-xs">
          <Link
            href="/"
            className="text-slate-500 hover:text-slate-800 font-medium transition-colors inline-flex items-center gap-1"
          >
            <IconArrowLeft size={12} />
            <span>Return to diagnostic search</span>
          </Link>
        </p>
      </div>
    </div>
  );
}
