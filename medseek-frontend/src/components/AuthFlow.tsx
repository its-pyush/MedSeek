"use client";

// Sign in / sign up as a short conversation: one question per screen,
// typed straight onto the page (no card, no stacked form fields).

import { useEffect, useRef, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { loginApi, signupApi } from "@/lib/auth";
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconConsultation,
  IconVault,
  IconActivity,
  IconWarning,
  IconEye,
} from "@/components/icons";

type Mode = "login" | "signup";

const COPY = {
  login: {
    chip: "Welcome back",
    steps: [
      { lead: "Hey again.", ask: "What's your email?" },
      { lead: "Good to see you.", ask: "Your password?" },
    ],
    submit: "Sign in",
    busy: "Signing you in…",
    switchText: "New here?",
    switchLink: "Create an account",
    switchHref: "/signup",
  },
  signup: {
    chip: "Free · takes 30 seconds",
    steps: [
      { lead: "Let's set you up.", ask: "What's your email?" },
      { lead: "Nice. Now pick", ask: "a password." },
      { lead: "One more time,", ask: "just to be sure." },
    ],
    submit: "Create my account",
    busy: "Setting up your vault…",
    switchText: "Already have an account?",
    switchLink: "Sign in",
    switchHref: "/login",
  },
} as const;

const PERKS = [
  { icon: IconConsultation, title: "A chat that remembers you", text: "Answers use your conditions, medicines and allergies." },
  { icon: IconVault, title: "Your records, encrypted", text: "Reports and history kept in one private vault." },
  { icon: IconActivity, title: "You see every access", text: "A log of each time your data is read or changed." },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AuthFlow({ mode }: { mode: Mode }) {
  const router = useRouter();
  const copy = COPY[mode];
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [step]);

  const emailOk = EMAIL_RE.test(email.trim());
  const longEnough = password.length >= 8;
  const matches = confirm.length > 0 && confirm === password;
  const total = copy.steps.length;
  const isLast = step === total - 1;
  const canContinue =
    step === 0 ? emailOk : step === 2 ? matches : mode === "signup" ? longEnough : password.length > 0;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!canContinue || isLoading) return;

    if (!isLast) {
      setStep(step + 1);
      return;
    }

    setIsLoading(true);
    try {
      if (mode === "login") await loginApi(email.trim(), password);
      else await signupApi(email.trim(), password);
      router.push("/dashboard");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : mode === "login"
            ? "That didn't work. Check your email and password."
            : "We couldn't create your account."
      );
      setIsLoading(false);
    }
  };

  const current = copy.steps[step];

  return (
    <section className="relative flex-1 flex items-center overflow-hidden bg-gradient-to-b from-canvas/50 via-canvas/85 to-canvas">
      {/* Same ambient glow as the home hero */}
      <div className="absolute top-[8%] left-[5%] w-96 h-96 rounded-full bg-glow/35 blur-[90px] pointer-events-none" />
      <div className="absolute top-[20%] right-[8%] w-[500px] h-[500px] rounded-full bg-brand/14 blur-[110px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 py-10 lg:py-16 grid gap-12 lg:grid-cols-[1.35fr_1fr] lg:gap-20 items-center">
        {/* The conversation */}
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-chip text-brand-ink text-xs font-semibold">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-60 animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              {copy.chip}
            </div>
            {/* Progress: two short bars */}
            <div className="flex gap-1.5" aria-label={`Step ${step + 1} of ${total}`}>
              {copy.steps.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i <= step ? "w-8 bg-brand" : "w-4 bg-slate-300/70"
                  }`}
                />
              ))}
            </div>
          </div>

          <h1
            key={step}
            className="font-bold tracking-[-0.03em] text-slate-900 text-4xl sm:text-6xl lg:text-7xl leading-[1.02] animate-fade-in"
          >
            {current.lead}
            <br />
            <span className="text-brand">{current.ask}</span>
          </h1>

          {step >= 1 && (
            <button
              type="button"
              onClick={() => {
                setStep(0);
                setError(null);
              }}
              className="mt-5 inline-flex items-center gap-2 h-9 pl-2 pr-3.5 rounded-full glass-chip text-sm text-slate-600 hover:text-slate-900 transition-colors animate-fade-in"
            >
              <span className="grid place-items-center w-6 h-6 rounded-full bg-brand/15 text-brand-ink text-xs font-bold uppercase">
                {email.trim()[0]}
              </span>
              {email.trim()}
              <span className="text-brand-ink font-semibold">· change</span>
            </button>
          )}

          <form onSubmit={handleSubmit} className="mt-8 max-w-xl">
            <div key={step} className="flex items-end gap-3 animate-slide-up">
              <div className="relative flex-1">
                <label htmlFor={step === 0 ? `${mode}-email` : step === 1 ? `${mode}-password` : `${mode}-confirm`} className="sr-only">
                  {step === 0 ? "Email" : step === 1 ? "Password" : "Confirm password"}
                </label>
                <input
                  ref={inputRef}
                  id={step === 0 ? `${mode}-email` : step === 1 ? `${mode}-password` : `${mode}-confirm`}
                  type={step === 0 ? "email" : showPassword ? "text" : "password"}
                  value={step === 0 ? email : step === 1 ? password : confirm}
                  onChange={(e) => {
                    setError(null);
                    if (step === 0) setEmail(e.target.value);
                    else if (step === 1) setPassword(e.target.value);
                    else setConfirm(e.target.value);
                  }}
                  placeholder={step === 0 ? "you@example.com" : "••••••••"}
                  autoComplete={step === 0 ? "email" : mode === "login" ? "current-password" : "new-password"}
                  className="w-full bg-transparent border-0 border-b-2 border-slate-300/80 focus:border-brand outline-none py-3 pr-12 text-2xl sm:text-3xl font-semibold text-slate-900 placeholder:text-slate-300 transition-colors"
                />
                {step >= 1 && (
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className={`absolute right-1 bottom-3 p-2 rounded-full transition-colors ${
                      showPassword ? "text-brand-ink bg-brand/10" : "text-slate-400 hover:text-slate-700"
                    }`}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    <IconEye size={20} />
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={!canContinue || isLoading}
                aria-label={isLast ? copy.submit : "Continue"}
                className="btn-3d-primary shrink-0 h-14 rounded-full inline-flex items-center justify-center gap-2 px-5 text-base"
              >
                {isLast && <span className="hidden sm:inline">{isLoading ? copy.busy : copy.submit}</span>}
                <IconArrowRight size={20} />
              </button>
            </div>

            {/* Under the line: hint, error, or nothing */}
            <div className="mt-3 min-h-6 text-sm">
              {error ? (
                <p className="flex items-center gap-2 text-red-600 animate-shake">
                  <IconWarning size={16} className="shrink-0" />
                  {error}
                </p>
              ) : step === 0 ? (
                <p className="text-slate-500">Press Enter to continue</p>
              ) : step === 2 ? (
                <p className={`flex items-center gap-1.5 transition-colors ${matches ? "text-emerald-600" : "text-slate-500"}`}>
                  <IconCheck size={15} />
                  {confirm.length === 0 ? "Type the same password again" : matches ? "Passwords match" : "Doesn't match yet"}
                </p>
              ) : mode === "signup" ? (
                <p className={`flex items-center gap-1.5 transition-colors ${longEnough ? "text-emerald-600" : "text-slate-500"}`}>
                  <IconCheck size={15} />
                  At least 8 characters
                </p>
              ) : (
                <p className="text-slate-500">Press Enter to sign in</p>
              )}
            </div>
          </form>

          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="text-slate-500">
              {copy.switchText}{" "}
              <Link href={copy.switchHref} className="font-semibold text-brand-ink hover:underline">
                {copy.switchLink}
              </Link>
            </span>
            <Link href="/" className="text-slate-500 hover:text-slate-800 inline-flex items-center gap-1">
              <IconArrowLeft size={14} />
              Back to symptom search
            </Link>
          </div>
        </div>

        {/* What you get */}
        <ul className="flex flex-col gap-3">
          {PERKS.map(({ icon: Icon, title, text }, i) => (
            <li
              key={title}
              className="glass-card rounded-2xl p-4 flex items-start gap-4 animate-slide-up"
              style={{ animationDelay: `${120 + i * 90}ms`, animationFillMode: "both" }}
            >
              <span className="grid place-items-center w-11 h-11 shrink-0 rounded-xl bg-brand/12 text-brand-ink">
                <Icon size={22} className="" />
              </span>
              <div>
                <p className="font-semibold text-slate-900">{title}</p>
                <p className="text-sm text-slate-500 leading-relaxed">{text}</p>
              </div>
            </li>
          ))}
          <li className="flex items-center gap-2 px-1 text-xs text-slate-500">
            <IconWarning size={14} className="text-amber-600" />
            AI answers are information, not a diagnosis.
          </li>
        </ul>
      </div>
    </section>
  );
}
