"use client";

import React, { useCallback, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import SymptomSearch from "@/components/SymptomSearch";
import DiseaseCard from "@/components/DiseaseCard";
import { searchDiseases, DiseaseResult, ResolvedSymptom } from "@/lib/api";
import {
  IconSearch,
  IconWarning,
  IconCheck,
  IconClose,
} from "@/components/icons";

const HumanBodyModel = dynamic(
  () => import("@/components/HumanBodyModel"),
  { ssr: false }
);

const Threads = dynamic(
  () => import("@/components/Threads"),
  { ssr: false }
);

/** True on screens wide enough for the side-by-side hero (Tailwind's lg breakpoint). */
function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia("(min-width: 1024px)");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(min-width: 1024px)").matches,
    () => false
  );
}

const RISK_TIERS = [
  { level: "low", label: "Lower risk", hint: "Usually manageable with self-care or routine care", color: "text-emerald-700" },
  { level: "moderate", label: "Moderate risk", hint: "Worth a doctor's appointment", color: "text-amber-700" },
  { level: "high", label: "Higher risk", hint: "See a doctor soon", color: "text-orange-700" },
  { level: "emergency", label: "Emergency", hint: "Needs immediate care if it fits", color: "text-red-700" },
] as const;

export default function Home() {
  const [results, setResults] = useState<DiseaseResult[]>([]);
  const [dontRuleOut, setDontRuleOut] = useState<DiseaseResult[]>([]);
  const [resolvedSymptoms, setResolvedSymptoms] = useState<ResolvedSymptom[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSymptoms, setActiveSymptoms] = useState<string[]>([]);
  const [bodySelectMode, setBodySelectMode] = useState(false);
  const [pickerSlot, setPickerSlot] = useState<HTMLDivElement | null>(null);
  const isDesktop = useIsDesktop();
  // On a phone, picking on the body takes over the screen below the search bar.
  const mobilePicking = bodySelectMode && !isDesktop;

  const handleSelectModeChange = useCallback((active: boolean) => {
    setBodySelectMode(active);
    // On a phone the picker uses the whole screen, so start from the top of the page.
    if (active && !window.matchMedia("(min-width: 1024px)").matches) {
      window.scrollTo({ top: 0 });
    }
  }, []);

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
      {/* Hero: search on the left, anatomical model in its own column on the right */}
      <section className={`relative overflow-hidden border-b border-[#e2dcd0]/80 bg-gradient-to-b from-[#fff8eb]/50 via-[#fff8eb]/85 to-[#fff8eb] flex flex-col ${!hasSearched && !mobilePicking ? "flex-1 justify-center" : ""}`}>
        {/* Soft ambient colour behind the glass panels */}
        <div className="absolute top-[8%] left-[5%] w-96 h-96 rounded-full bg-[#fed7aa]/35 blur-[90px] pointer-events-none -z-10" />
        <div className="absolute top-[20%] right-[8%] w-[500px] h-[500px] rounded-full bg-[#3a5ebb]/14 blur-[110px] pointer-events-none -z-10" />

        {/* Animated threads: desktop only, behind everything */}
        {isDesktop && (
          <div className="absolute inset-0 pointer-events-none -z-5 overflow-hidden opacity-70">
            <Threads
              color={[0.18, 0.42, 0.85]}
              amplitude={1.2}
              distance={0.18}
              speed={0.35}
              enableMouseInteraction={false}
            />
          </div>
        )}

        {/* Desktop model: its own right-hand column, never under the text */}
        {isDesktop && (
          <div className="absolute inset-y-0 right-0 left-[56%] xl:left-[54%] z-0">
            <HumanBodyModel
              activeSymptoms={activeSymptoms}
              onSymptomsChange={setActiveSymptoms}
              onSelectModeChange={handleSelectModeChange}
              panelContainer={pickerSlot}
              onSearchRequested={() => handleSearch(activeSymptoms)}
            />
          </div>
        )}

        <div className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 pt-5 pb-4 sm:pt-10 lg:pb-10 pointer-events-none">
          <div className={`pointer-events-auto lg:max-w-[52%] ${hasSearched ? "lg:min-h-0" : "lg:min-h-[600px]"} flex flex-col lg:justify-center`}>
            {/* Intro text steps aside while the picker is open, so the list has room */}
            {!bodySelectMode && (
              <div className="text-left mb-4 sm:mb-6 animate-fade-in">
                <h1 className="font-bold tracking-tight mb-2 sm:mb-4 text-slate-900 text-3xl sm:text-5xl lg:text-6xl leading-[1.05]">
                  What are your <span className="text-[#3a5ebb]">symptoms?</span>
                </h1>
                <p className="text-base text-slate-600 max-w-xl leading-relaxed">
                  Type what you feel, or tap the body to choose. This is a reference tool, not a diagnosis.
                </p>
              </div>
            )}

            {/* The search bar is always on top; picked symptoms appear in it as tags */}
            <div className="relative z-20">
              <SymptomSearch
                onSearch={handleSearch}
                selectedSymptoms={activeSymptoms}
                onSymptomsChange={setActiveSymptoms}
                isLoading={isLoading}
              />
            </div>

            {/* Picker list: under the search bar on desktop, a bottom sheet on phones */}
            <div
              ref={setPickerSlot}
              className={
                bodySelectMode
                  ? "fixed inset-x-0 bottom-0 z-40 h-[46dvh] lg:static lg:z-auto lg:h-[440px] lg:mt-4 animate-slide-up"
                  : "hidden"
              }
            />
          </div>
        </div>

        {/* Phones: the model is the centrepiece, large and directly below the search */}
        {!isDesktop && (
          <div
            className={`relative w-full overflow-hidden ${mobilePicking ? "h-[calc(54dvh-12.5rem)] min-h-[180px]" : "h-[62dvh] min-h-[420px]"}`}
          >
            <HumanBodyModel
              activeSymptoms={activeSymptoms}
              onSymptomsChange={setActiveSymptoms}
              onSelectModeChange={handleSelectModeChange}
              panelContainer={pickerSlot}
              onSearchRequested={() => handleSearch(activeSymptoms)}
            />
          </div>
        )}
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
                Grouped by risk · lowest first
              </span>
            </div>
          )}

          {/* Primary Results — grouped by risk tier, lowest first (order set by the backend) */}
          {RISK_TIERS.map((tier) => {
            const tierResults = results.filter((d) => d.urgency_level === tier.level);
            if (tierResults.length === 0) return null;
            return (
              <div key={tier.level} className="mb-6">
                <div className="flex items-baseline gap-2 mb-2.5">
                  <h3 className={`text-xs font-bold uppercase tracking-wider ${tier.color}`}>
                    {tier.label} ({tierResults.length})
                  </h3>
                  <span className="text-[11px] text-slate-500">{tier.hint}</span>
                </div>
                <div className="grid gap-3.5 sm:grid-cols-2">
                  {tierResults.map((disease) => (
                    <div key={disease.id}>
                      <DiseaseCard {...disease} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

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
