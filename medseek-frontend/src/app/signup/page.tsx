"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signupApi } from "@/lib/auth";
import { IconProfile, IconWarning, IconArrowLeft } from "@/components/icons";
import Threads from "@/components/Threads";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Password confirmation does not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must contain at least 8 characters");
      return;
    }

    setIsLoading(true);

    try {
      await signupApi(email, password);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Account registration failed");
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
              <IconProfile size={20} />
            </div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">
              Create Patient Account
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              Initialize client-side encrypted vault and profile
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
                htmlFor="signup-email"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Email Address
              </label>
              <input
                id="signup-email"
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
                htmlFor="signup-password"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Password
              </label>
              <input
                id="signup-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                className="w-full px-3 py-2 rounded-lg border border-slate-300/80 bg-white/80 backdrop-blur-xs text-slate-800 placeholder:text-slate-400 text-xs focus:outline-none focus:border-[#3a5ebb] focus:ring-2 focus:ring-[#3a5ebb]/15 transition-all"
                autoComplete="new-password"
                minLength={8}
              />
            </div>

            <div>
              <label
                htmlFor="signup-confirm"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Confirm Password
              </label>
              <input
                id="signup-confirm"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat password"
                className="w-full px-3 py-2 rounded-lg border border-slate-300/80 bg-white/80 backdrop-blur-xs text-slate-800 placeholder:text-slate-400 text-xs focus:outline-none focus:border-[#3a5ebb] focus:ring-2 focus:ring-[#3a5ebb]/15 transition-all"
                autoComplete="new-password"
                minLength={8}
              />
            </div>

            <div className="pt-1">
              <button
                type="submit"
                disabled={isLoading}
                className="btn-3d-primary w-full py-2 px-4 rounded-lg text-xs"
              >
                {isLoading ? "Creating Vault..." : "Register Account"}
              </button>
            </div>
          </form>

          {/* Footer Navigation */}
          <p className="mt-4 text-center text-xs text-slate-500 pt-3 border-t border-slate-200/60">
            Already have an active account?{" "}
            <Link
              href="/login"
              className="font-semibold text-[#3a5ebb] hover:text-[#2a4693] hover:underline"
            >
              Sign In
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
