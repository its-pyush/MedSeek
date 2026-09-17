"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import SymptomSearch from "@/components/SymptomSearch";
import DiseaseCard from "@/components/DiseaseCard";
import { searchDiseases, DiseaseResult, ResolvedSymptom } from "@/lib/api";

const HumanBodyModel = dynamic(
  () => import("@/components/HumanBodyModel"),
  { ssr: false }
);

export default function Home() {
  const [results, setResults] = useState<DiseaseResult[]>([]);
  const [dontRuleOut, setDontRuleOut] = useState<DiseaseResult[]>([]);
  const [resolvedSymptoms, setResolvedSymptoms] = useState<ResolvedSymptom[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSymptoms, setActiveSymptoms] = useState<string[]>([]);

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
    <div className="flex flex-col flex-1">
      {/* Hero / Search Section */}
      <section className={`relative overflow-hidden medical-scanline flex flex-col ${!hasSearched ? 'flex-1 justify-center' : ''}`}>
        {/* Dark background with subtle blue gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-blue-50/40 via-slate-50 to-slate-50" />

        {/* Matrix-style floating orbs */}
        <div className="absolute top-20 left-1/4 w-72 h-72 bg-blue-500/5 rounded-full blur-3xl animate-float" />
        <div className="absolute top-40 right-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl animate-float-delayed" />
        <div className="absolute bottom-10 left-1/3 w-64 h-64 bg-blue-400/3 rounded-full blur-3xl animate-float" />

        {/* 3D Human Body — rotating in background */}
        <HumanBodyModel activeSymptoms={activeSymptoms} />

        <div className="relative max-w-4xl mx-auto lg:mx-0 lg:ml-[10%] xl:ml-[15%] px-4 sm:px-6 pt-16 pb-12 sm:pt-24 sm:pb-16">
          <div className="text-left mb-10 animate-fade-in">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-50/60 text-blue-600 text-xs font-semibold mb-6 border border-blue-300/40">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
              </span>
              Powered by 41 diseases · 131 symptoms
            </div>

            <h1 className="font-extrabold tracking-tight mb-5 animate-slide-up animate-flicker">
              <span className="block text-3xl sm:text-4xl lg:text-5xl text-slate-800 mb-2">
                What are your
              </span>
              <span className="block text-6xl sm:text-7xl lg:text-8xl text-blue-600 capitalize">
                Symptoms<span className="text-slate-800">?</span>
              </span>
            </h1>
            <p className="text-lg sm:text-xl text-slate-600/60 max-w-2xl leading-relaxed animate-slide-up delay-200">
              Enter your symptoms to find possible conditions, ranked by
              relevance. We&apos;ll highlight anything urgent you shouldn&apos;t
              ignore.
            </p>
          </div>

          <div className="relative z-50 animate-slide-up delay-300">
            <SymptomSearch 
              onSearch={handleSearch} 
              onSymptomsChange={setActiveSymptoms}
              isLoading={isLoading} 
            />
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
            <div className="mb-6 p-4 rounded-2xl bg-blue-50/40 border border-blue-200/60 animate-slide-up">
              <h2 className="text-sm font-semibold text-slate-700 mb-2">
                Symptom resolution
              </h2>
              <div className="flex flex-wrap gap-2">
                {resolvedSymptoms.map((rs) => (
                  <span
                    key={rs.input}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all hover:scale-[1.02] ${
                      rs.match_type === "none"
                        ? "bg-red-50 text-red-700 border border-red-200"
                        : rs.match_type === "exact"
                          ? "bg-blue-50 text-blue-700 border border-blue-200"
                          : "bg-amber-50 text-amber-800 border border-amber-200"
                    }`}
                  >
                    <span className="capitalize font-semibold">
                      {rs.input.replace(/_/g, " ")}
                    </span>
                    {rs.match_type === "none" ? (
                      <span>✕ not found</span>
                    ) : (
                      <span>
                        → {rs.matched_name?.replace(/_/g, " ")} ({rs.match_type})
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 mb-6 animate-shake">
              <p className="font-semibold">Search failed</p>
              <p className="text-sm mt-1">{error}</p>
            </div>
          )}

          {/* Results count */}
          {results.length > 0 && (
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-slate-700">
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
                <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center border border-red-200 text-red-600">
                  <svg
                    className="w-5 h-5"
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
                  <h2 className="text-lg font-bold text-red-900">
                    Don&apos;t rule out
                  </h2>
                  <p className="text-sm text-red-700/80">
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
              <div className="w-20 h-20 mx-auto mb-5 rounded-2xl bg-blue-50/30 border border-blue-300/30 flex items-center justify-center">
                <svg
                  className="w-10 h-10 text-blue-600"
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
              <h3 className="text-lg font-semibold text-slate-600 mb-2">
                No matching conditions found
              </h3>
              <p className="text-sm text-slate-500">
                Try different symptom terms or check your spelling.
              </p>
            </div>
          )}

          {/* Disclaimer */}
          <div className="mt-12 p-5 rounded-2xl bg-amber-50/80 border border-amber-200">
            <div className="flex gap-3">
              <svg
                className="w-6 h-6 text-amber-600 shrink-0 mt-0.5"
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
                <h3 className="text-sm font-bold text-amber-900">
                  Medical Disclaimer
                </h3>
                <p className="text-sm text-amber-800/80 mt-1 leading-relaxed">
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

/* ─── Feature Card ──────────────────────────────────────────── */

function FeatureCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="group p-5 rounded-2xl bg-white/70 border border-slate-200/80 shadow-xs hover:bg-white hover:border-blue-300 hover:shadow-md hover:shadow-blue-500/5 hover:-translate-y-0.5 transition-all">
      <div className="text-2xl mb-3">{icon}</div>
      <h3 className="text-sm font-bold text-slate-800 mb-1">{title}</h3>
      <p className="text-sm text-slate-600 leading-relaxed">{description}</p>
    </div>
  );
}
