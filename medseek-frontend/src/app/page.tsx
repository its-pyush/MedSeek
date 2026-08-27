"use client";

import React, { useState } from "react";
import SymptomSearch from "@/components/SymptomSearch";
import DiseaseCard from "@/components/DiseaseCard";
import { searchDiseases, DiseaseResult, ResolvedSymptom } from "@/lib/api";

export default function Home() {
  const [results, setResults] = useState<DiseaseResult[]>([]);
  const [dontRuleOut, setDontRuleOut] = useState<DiseaseResult[]>([]);
  const [resolvedSymptoms, setResolvedSymptoms] = useState<ResolvedSymptom[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (symptoms: string[]) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await searchDiseases(symptoms);
      setResults(response.data);
      setDontRuleOut(response.dont_rule_out);
      setResolvedSymptoms(response.meta.resolved_symptoms);
      setTotal(response.meta.total);
      setHasSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setResults([]);
      setDontRuleOut([]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col">
      {/* Hero / Search Section */}
      <section className="relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-indigo-50/80 via-background to-background dark:from-indigo-950/30 dark:via-background dark:to-background" />

        {/* Animated floating orbs */}
        <div className="absolute top-20 left-1/4 w-72 h-72 bg-indigo-300/20 dark:bg-indigo-600/10 rounded-full blur-3xl animate-float" />
        <div className="absolute top-40 right-1/4 w-96 h-96 bg-violet-300/20 dark:bg-violet-600/10 rounded-full blur-3xl animate-float-delayed" />
        <div className="absolute bottom-10 left-1/2 w-64 h-64 bg-cyan-300/10 dark:bg-cyan-600/5 rounded-full blur-3xl animate-float" />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-16 pb-12 sm:pt-24 sm:pb-16">
          <div className="text-center mb-10 animate-fade-in">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 text-xs font-semibold mb-6 border border-indigo-200/50 dark:border-indigo-800/50">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
              </span>
              Powered by 41 diseases · 131 symptoms
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50 mb-5 animate-slide-up">
              What are your{" "}
              <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 dark:from-indigo-400 dark:via-violet-400 dark:to-purple-400 bg-clip-text text-transparent animate-gradient">
                symptoms
              </span>
              ?
            </h1>
            <p className="text-lg sm:text-xl text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto leading-relaxed animate-slide-up delay-200">
              Enter your symptoms to find possible conditions, ranked by
              relevance. We&apos;ll highlight anything urgent you shouldn&apos;t
              ignore.
            </p>
          </div>

          <div className="animate-slide-up delay-300">
            <SymptomSearch onSearch={handleSearch} isLoading={isLoading} />
          </div>

          {/* Feature highlights */}
          {!hasSearched && (
            <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 animate-slide-up delay-500">
              <FeatureCard
                icon="🔍"
                title="Smart Matching"
                description="Synonym-aware search understands 'tummy ache' means abdominal pain"
              />
              <FeatureCard
                icon="⚡"
                title="Urgency Detection"
                description="Highlights dangerous conditions you shouldn't ignore"
              />
              <FeatureCard
                icon="🔒"
                title="Private & Secure"
                description="Your health data is encrypted with AES-256 — only you can access it"
              />
            </div>
          )}
        </div>
      </section>

      {/* Results Section */}
      {hasSearched && (
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16 w-full animate-fade-in">
          {/* Resolved symptoms feedback */}
          {resolvedSymptoms.length > 0 && (
            <div className="mb-6 p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 animate-slide-up">
              <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                Symptom resolution
              </h2>
              <div className="flex flex-wrap gap-2">
                {resolvedSymptoms.map((rs) => (
                  <span
                    key={rs.input}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all hover:scale-105 ${
                      rs.match_type === "none"
                        ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                        : rs.match_type === "exact"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                    }`}
                  >
                    <span className="capitalize">
                      {rs.input.replace(/_/g, " ")}
                    </span>
                    {rs.match_type === "none" ? (
                      <span>✕ not found</span>
                    ) : (
                      <span>
                        → {rs.matched_name?.replace(/_/g, " ")} ({rs.match_type}
                        )
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 mb-6 animate-shake">
              <p className="font-medium">Search failed</p>
              <p className="text-sm mt-1">{error}</p>
            </div>
          )}

          {/* Results count */}
          {results.length > 0 && (
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {total} possible condition{total !== 1 ? "s" : ""} found
              </h2>
            </div>
          )}

          {/* Disease cards — staggered entrance */}
          <div className="grid gap-4 sm:grid-cols-2">
            {results.map((disease, index) => (
              <div
                key={disease.id}
                className="animate-slide-up"
                style={{ animationDelay: `${index * 80}ms` }}
              >
                <DiseaseCard {...disease} />
              </div>
            ))}
          </div>

          {/* Don't rule out section */}
          {dontRuleOut.length > 0 && (
            <div className="mt-10 animate-slide-up delay-300">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-red-600 dark:text-red-400"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-red-700 dark:text-red-400">
                    Don&apos;t rule out
                  </h2>
                  <p className="text-sm text-red-600/80 dark:text-red-400/80">
                    These serious conditions matched some of your symptoms —
                    consider discussing with a doctor.
                  </p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {dontRuleOut.map((disease, index) => (
                  <div
                    key={disease.id}
                    className="animate-slide-up"
                    style={{ animationDelay: `${index * 80 + 200}ms` }}
                  >
                    <DiseaseCard {...disease} isWarning />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No results */}
          {results.length === 0 && !error && (
            <div className="text-center py-16 animate-scale-in">
              <div className="w-20 h-20 mx-auto mb-5 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                <svg
                  className="w-10 h-10 text-zinc-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                No matching conditions found
              </h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Try different symptom terms or check your spelling.
              </p>
            </div>
          )}

          {/* Disclaimer */}
          <div className="mt-12 p-5 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50">
            <div className="flex gap-3">
              <svg
                className="w-6 h-6 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
              <div>
                <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                  Medical Disclaimer
                </h3>
                <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                  This tool provides general health information only and is not a
                  substitute for professional medical advice, diagnosis, or
                  treatment. Always seek the advice of your physician or other
                  qualified health provider with any questions you may have
                  regarding a medical condition.
                </p>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

/* ─── Feature Card ──────────────────────────────────────────────── */

function FeatureCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="group p-5 rounded-2xl bg-white/60 dark:bg-zinc-900/40 border border-zinc-200/60 dark:border-zinc-800/60 hover:bg-white dark:hover:bg-zinc-900/70 hover:shadow-lg hover:shadow-indigo-500/5 hover:-translate-y-0.5 transition-all">
      <div className="text-2xl mb-3">{icon}</div>
      <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-1">{title}</h3>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">{description}</p>
    </div>
  );
}
