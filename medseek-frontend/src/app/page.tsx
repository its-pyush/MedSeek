"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import SymptomSearch from "@/components/SymptomSearch";
import DiseaseCard from "@/components/DiseaseCard";
import { searchDiseases, DiseaseResult, ResolvedSymptom } from "@/lib/api";
import {
  IconSearch,
  IconWarning,
  IconCrosshair,
  IconCheck,
  IconClose,
} from "@/components/icons";

const HumanBodyModel = dynamic(
  () => import("@/components/HumanBodyModel"),
  { ssr: false }
);

import FoldText from "@/components/FoldText";

const Threads = dynamic(
  () => import("@/components/Threads"),
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
      setError(err instanceof Error ? err.message : "Search query failed");
      setResults([]);
      setDontRuleOut([]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col flex-1">
      {/* Diagnostic Console / Search Section with Ambient Diffusion & 3D Integration */}
      <section className={`relative overflow-hidden border-b border-[#e2dcd0]/80 bg-gradient-to-b from-[#fff8eb]/50 via-[#fff8eb]/85 to-[#fff8eb] flex flex-col ${!hasSearched ? 'flex-1 justify-center' : ''}`}>
        {/* Ambient Chromatic Diffusion Orbs (Physically scatter light through frosted glass panels) */}
        <div className="absolute top-[8%] left-[5%] w-96 h-96 rounded-full bg-[#fed7aa]/35 blur-[90px] pointer-events-none -z-10" />
        <div className="absolute top-[20%] right-[8%] w-[500px] h-[500px] rounded-full bg-[#3a5ebb]/14 blur-[110px] pointer-events-none -z-10" />
        <div className="absolute bottom-[5%] left-[25%] w-80 h-80 rounded-full bg-[#c7d2fe]/20 blur-[80px] pointer-events-none -z-10" />

        {/* Dynamic Waving Ambient Threads behind 3D Model */}
        <div className="absolute inset-0 pointer-events-none -z-5 overflow-hidden opacity-95">
          <Threads
            color={[0.18, 0.42, 0.85]}
            amplitude={1.2}
            distance={0.18}
            speed={0.35}
            enableMouseInteraction={false}
          />
        </div>

        {/* Interactive Anatomical Model in Background */}
        <HumanBodyModel
          activeSymptoms={activeSymptoms}
          onSymptomsChange={setActiveSymptoms}
        />

        <div className="relative max-w-4xl mx-auto lg:mx-0 lg:ml-[8%] xl:ml-[12%] px-4 sm:px-6 pt-6 pb-7 sm:pt-12 sm:pb-10 z-10">
          <div className="text-left mb-5 sm:mb-7 animate-fade-in">
            {/* Clinical Categorization Pill */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full glass-chip text-[#2a4693] text-[11px] font-bold mb-3 shadow-2xs">
              <IconCrosshair size={13} className="text-[#3a5ebb]" />
              <span>Differential Diagnostic Engine</span>
            </div>

            <h1 className="font-extrabold tracking-tight mb-3 sm:mb-4">
              <span className="block text-2xl sm:text-4xl lg:text-5xl text-slate-900 mb-1 sm:mb-2 font-bold">
                <FoldText
                  text="What are your"
                  splitBy="word"
                  hinge="top"
                  trigger="mount"
                  duration={0.65}
                  stagger={0.06}
                  ease="power3.out"
                  perspective={700}
                  creaseShading={0.35}
                  fontSize="inherit"
                  fontWeight="inherit"
                  color="inherit"
                />
              </span>
              <span className="block text-4xl sm:text-6xl lg:text-7xl xl:text-8xl text-[#3a5ebb] tracking-tight">
                <FoldText
                  text="Symptoms?"
                  splitBy="char"
                  hinge="top"
                  trigger="mount"
                  duration={0.7}
                  stagger={0.045}
                  ease="power3.out"
                  perspective={800}
                  creaseShading={0.45}
                  fontSize="inherit"
                  fontWeight="inherit"
                  color="#3a5ebb"
                />
              </span>
            </h1>
            <p className="text-xs sm:text-base text-slate-600 max-w-2xl leading-relaxed">
              Identify plausible medical conditions corresponding to presenting symptoms.
              Urgent and high-severity clinical indications are flagged automatically.
            </p>
          </div>

          <div className="relative z-20 animate-slide-up">
            <SymptomSearch 
              onSearch={handleSearch} 
              selectedSymptoms={activeSymptoms}
              onSymptomsChange={setActiveSymptoms}
              isLoading={isLoading} 
            />
          </div>
        </div>
      </section>

      {/* Differential Results Section */}
      {hasSearched && (
        <section className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 w-full animate-fade-in relative">
          {/* Subtle Results Ambient Aura */}
          <div className="absolute top-[10%] right-[15%] w-72 h-72 rounded-full bg-[#3a5ebb]/08 blur-[90px] pointer-events-none -z-10" />

          {/* Resolved Symptoms Telemetry */}
          {resolvedSymptoms.length > 0 && (
            <div className="mb-5 p-3.5 sm:p-4.5 rounded-2xl glass-panel shadow-xs animate-slide-up">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5">
                Evaluated Symptom Index
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {resolvedSymptoms.map((rs) => (
                  <span
                    key={rs.input}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                      rs.match_type === "none"
                        ? "bg-red-50/85 text-red-800 border-red-200/90 shadow-2xs"
                        : rs.match_type === "exact"
                          ? "glass-chip text-[#2a4693] font-semibold"
                          : "bg-white/80 text-slate-800 border-slate-200/90 shadow-2xs"
                    }`}
                  >
                    <span className="capitalize font-semibold">
                      {rs.input.replace(/_/g, " ")}
                    </span>
                    {rs.match_type === "none" ? (
                      <span className="flex items-center gap-0.5 text-red-700">
                        <IconClose size={12} />
                        <span>unindexed</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-slate-600">
                        <IconCheck size={12} className="text-emerald-600" />
                        <span>{rs.matched_name?.replace(/_/g, " ")} ({rs.match_type})</span>
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="p-3.5 rounded-xl bg-red-50/90 backdrop-blur-md border border-red-200 text-red-800 text-xs sm:text-sm mb-5 flex items-center gap-2 animate-shake">
              <IconWarning size={16} className="text-red-600 shrink-0" />
              <div>
                <span className="font-semibold">Query Error: </span>
                <span>{error}</span>
              </div>
            </div>
          )}

          {/* Primary Differential Header */}
          {results.length > 0 && (
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#e2dcd0]/80">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                Primary Differential Matches ({total})
              </h2>
              <span className="text-xs text-slate-500 font-mono">
                Ranked by correlation
              </span>
            </div>
          )}

          {/* Primary Results Grid */}
          <div className="grid gap-3.5 sm:grid-cols-2">
            {results.map((disease) => (
              <div key={disease.id}>
                <DiseaseCard {...disease} />
              </div>
            ))}
          </div>

          {/* Critical Path Differential / Don't Rule Out */}
          {dontRuleOut.length > 0 && (
            <div className="mt-8 animate-slide-up">
              <div className="flex items-center gap-2.5 mb-3.5 pb-2 border-b border-red-200/80">
                <div className="w-6 h-6 rounded-lg bg-red-100 border border-red-200 flex items-center justify-center text-red-700 shrink-0">
                  <IconWarning size={14} />
                </div>
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-red-900">
                    Critical Path Differential (Don&apos;t Rule Out)
                  </h2>
                  <p className="text-xs text-red-700/90">
                    Significant clinical overlap detected with high-acuity conditions.
                  </p>
                </div>
              </div>
              <div className="grid gap-3.5 sm:grid-cols-2">
                {dontRuleOut.map((disease) => (
                  <div key={disease.id}>
                    <DiseaseCard {...disease} isWarning />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No Results Empty State */}
          {results.length === 0 && !error && (
            <div className="text-center py-12 glass-panel rounded-2xl">
              <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-white/80 border border-slate-200/80 flex items-center justify-center text-slate-400 shadow-2xs">
                <IconSearch size={22} />
              </div>
              <h3 className="text-sm font-bold text-slate-800 mb-1">
                No Diagnostic Correlations Found
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                No indexed disease matched the provided symptom profile. Verify clinical terms or expand the symptom set.
              </p>
            </div>
          )}

          {/* Clinical Advisory Notice */}
          <div className="mt-8 p-4 rounded-2xl glass-panel text-xs text-slate-600 flex gap-3">
            <IconWarning size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-800">Clinical Protocol Notice: </span>
              MedSeek algorithmic evaluations provide preliminary differential screening. They do not constitute definitive clinical diagnoses or triage mandates. For acute symptoms, consult emergency services immediately.
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
