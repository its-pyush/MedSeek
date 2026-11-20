"use client";

import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import SymptomSearch from "@/components/SymptomSearch";
import SymptomBrowser from "@/components/SymptomBrowser";
import DiseaseCard from "@/components/DiseaseCard";
import AreaControl from "@/components/AreaControl";
import { getAreaCell } from "@/lib/location";
import { useBodySex, getBodySex, bodyFor, searchSexFor } from "@/lib/bodySex";
import { BodySexChooser, BodySwitch } from "@/components/BodySexControls";
import { searchDiseases, DiseaseResult, ResolvedSymptom } from "@/lib/api";
import {
  IconSearch,
  IconWarning,
  IconCheck,
  IconClose,
  IconArrowLeft,
} from "@/components/icons";

const HumanBodyModel = dynamic(
  () => import("@/components/HumanBodyModel"),
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

const QUICK_SYMPTOMS = ["fever", "headache", "cough", "stomach pain", "fatigue"];

const RISK_TIERS = [
  { level: "low", label: "Lower risk", hint: "Usually manageable with self-care or routine care", color: "text-emerald-700" },
  { level: "moderate", label: "Moderate risk", hint: "Worth a doctor's appointment", color: "text-amber-700" },
  { level: "high", label: "Higher risk", hint: "See a doctor soon", color: "text-orange-700" },
  { level: "emergency", label: "Emergency", hint: "Needs immediate care if it fits", color: "text-red-700" },
] as const;

export default function Home() {
  const bodySex = useBodySex();
  const [results, setResults] = useState<DiseaseResult[]>([]);
  const [dontRuleOut, setDontRuleOut] = useState<DiseaseResult[]>([]);
  const [resolvedSymptoms, setResolvedSymptoms] = useState<ResolvedSymptom[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSymptoms, setActiveSymptoms] = useState<string[]>([]);
  const [bodySelectMode, setBodySelectMode] = useState(false);
  const [desktopSlot, setDesktopSlot] = useState<HTMLDivElement | null>(null);
  // The "all symptoms" list; `area` preselects a body area when opened from the picker.
  const [browser, setBrowser] = useState<{ open: boolean; area: string | null }>({ open: false, area: null });
  const openBrowser = useCallback((area: string | null = null) => setBrowser({ open: true, area }), []);
  const isDesktop = useIsDesktop();

  // Phones: the body fills the first screen, so after a search scroll down to
  // the results (otherwise they sit unseen below the body).
  const resultsRef = useRef<HTMLElement>(null);
  const [searchCount, setSearchCount] = useState(0);
  useEffect(() => {
    if (searchCount === 0 || isDesktop) return;
    resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [searchCount, isDesktop]);

  const removeSymptom = (name: string) => setActiveSymptoms((current) => current.filter((s) => s !== name));

  const handleSearch = async (symptoms: string[]) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await searchDiseases(symptoms, 20, 0, getAreaCell(), searchSexFor(getBodySex()));
      setResults(response.data);
      setDontRuleOut(response.dont_rule_out);
      setResolvedSymptoms(response.meta.resolved_symptoms);
      setTotal(response.meta.total);
      setHasSearched(true);
      setSearchCount((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search query failed");
      setResults([]);
      setDontRuleOut([]);
      setHasSearched(true);
      setSearchCount((n) => n + 1);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col flex-1">
      <SymptomBrowser
        open={browser.open}
        initialArea={browser.area}
        onClose={() => setBrowser((b) => ({ ...b, open: false }))}
        selectedSymptoms={activeSymptoms}
        onToggleSymptom={(name) =>
          setActiveSymptoms((current) =>
            current.includes(name) ? current.filter((s) => s !== name) : [...current, name]
          )
        }
        onClear={() => setActiveSymptoms([])}
        onSearch={() => {
          setBrowser((b) => ({ ...b, open: false }));
          handleSearch(activeSymptoms);
        }}
      />
      {/* Hero: search on the left, anatomical model in its own column on the right */}
      <section
        className={`relative overflow-hidden border-b border-line/80 flex flex-col bg-gradient-to-b from-canvas/50 via-canvas/85 to-canvas ${
          !hasSearched ? "flex-1 justify-center" : ""
        }`}
      >
        {/* Soft ambient colour behind the glass panels */}
        <div className="absolute top-[8%] left-[5%] w-96 h-96 rounded-full bg-glow/35 blur-[90px] pointer-events-none -z-10" />
        <div className="absolute top-[20%] right-[8%] w-[500px] h-[500px] rounded-full bg-brand/14 blur-[110px] pointer-events-none -z-10" />

        {/* Desktop model: its own right-hand column, never under the text */}
        {isDesktop && (
          <div className="absolute inset-y-0 right-0 left-[56%] xl:left-[54%] z-0">
            {bodySex === null ? (
              <BodySexChooser className="absolute inset-0 z-30 pointer-events-auto" />
            ) : (
              <BodySwitch value={bodySex} className="absolute top-3 right-4 z-30 pointer-events-auto" />
            )}
            {bodySex !== null && (
            <HumanBodyModel
              body={bodyFor(bodySex)}
              activeSymptoms={activeSymptoms}
              onSymptomsChange={setActiveSymptoms}
              onSelectModeChange={setBodySelectMode}
              panelContainer={desktopSlot}
              onSearchRequested={() => handleSearch(activeSymptoms)}
              onBrowseAll={openBrowser}
            />
            )}
          </div>
        )}

        {/* Desktop: text and search on the left. Hidden on phones by CSS (not
            unmounted), so the text stays in the server-rendered page. */}
        <div className="hidden lg:block relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 pt-5 pb-4 sm:pt-10 lg:pb-10 pointer-events-none">
          <div className={`pointer-events-auto lg:max-w-[52%] ${hasSearched ? "lg:min-h-0" : "lg:min-h-[600px]"} flex flex-col lg:justify-center`}>
            {/* Intro text steps aside while the picker is open, so the list has room */}
            {!bodySelectMode && (
              <div className="text-left mb-5 sm:mb-7 animate-fade-in">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-chip text-brand-ink text-xs font-semibold mb-4">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-60 animate-ping" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                  Symptom search · 1,200+ conditions
                </div>
                <h1 className="font-bold tracking-[-0.03em] mb-3 sm:mb-4 text-slate-900 text-4xl sm:text-6xl lg:text-7xl leading-[1.02]">
                  What are your
                  <br />
                  <span className="text-brand">symptoms?</span>
                </h1>
                <p className="text-base sm:text-lg text-slate-600 max-w-xl leading-relaxed">
                  Type what you feel, or tap the body to point to it. See matching conditions, from lower to higher risk.
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

            {/* Quick starts: one tap adds a common symptom */}
            {!bodySelectMode && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-sm text-slate-500">Try:</span>
                {QUICK_SYMPTOMS.filter((q) => !activeSymptoms.includes(q)).map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setActiveSymptoms([...activeSymptoms, q])}
                    className="btn-3d-secondary h-9 px-3.5 rounded-full text-sm capitalize"
                  >
                    {q}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => openBrowser(null)}
                  className="h-9 px-3 rounded-full text-sm font-semibold text-brand-ink hover:bg-brand/10 underline underline-offset-4 decoration-brand/40"
                  id="browse-all-symptoms"
                >
                  Browse all symptoms
                </button>
                <AreaControl />
              </div>
            )}

            {!bodySelectMode && !hasSearched && (
              <ul className="hidden sm:flex mt-6 items-center gap-5 text-sm text-slate-500">
                <li className="flex items-center gap-1.5"><IconCheck size={15} className="text-emerald-600" />Results grouped by risk</li>
                <li className="flex items-center gap-1.5"><IconCheck size={15} className="text-emerald-600" />Plain-language summaries</li>
                <li className="flex items-center gap-1.5"><IconWarning size={15} className="text-amber-600" />Not a diagnosis</li>
              </ul>
            )}

            {/* Desktop: the picker list opens under the search bar */}
            <div
              ref={setDesktopSlot}
              className={bodySelectMode && isDesktop ? "h-[440px] mt-4 animate-slide-up" : "hidden"}
            />
          </div>
        </div>

        {/* Phones: the body is the page. Tap a part, tick its symptoms, search. */}
        {!isDesktop && (
          <div className="relative flex flex-col h-[calc(100dvh-3.5rem)] min-h-[520px]">
            <div className="flex items-center gap-3 px-4 pt-3 pb-1">
              <div className="min-w-0">
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 leading-tight">
                  Where does it <span className="text-brand">hurt?</span>
                </h2>
                <p className="text-sm text-slate-500">Tap the body, then tick what you feel.</p>
              </div>
              <button
                type="button"
                id="mobile-search-button"
                onClick={() => handleSearch(activeSymptoms)}
                disabled={activeSymptoms.length === 0 || isLoading}
                className="btn-3d-primary ml-auto shrink-0 min-h-11 px-4 rounded-xl text-sm font-bold disabled:opacity-50"
              >
                {isLoading ? "Searching…" : activeSymptoms.length ? `Search (${activeSymptoms.length})` : "Search"}
              </button>
            </div>

            <div className="relative flex-1 min-h-0">
              {bodySex === null ? (
                <BodySexChooser className="absolute inset-0 z-30" />
              ) : (
                <HumanBodyModel
                  variant="chips"
                  cornerControl={<BodySwitch value={bodySex} />}
                  body={bodyFor(bodySex)}
                  activeSymptoms={activeSymptoms}
                  onSymptomsChange={setActiveSymptoms}
                  onBrowseAll={openBrowser}
                />
              )}
            </div>

            {/* What has been picked so far, from the body or the full list */}
            {activeSymptoms.length > 0 && (
              <div className="flex items-center gap-1.5 px-4 pt-2 overflow-x-auto shrink-0 [scrollbar-width:none]" aria-label="Picked symptoms">
                {activeSymptoms.map((name) => (
                  <span
                    key={name}
                    className="shrink-0 inline-flex items-center gap-1 pl-3 pr-1 h-9 rounded-full glass-chip text-sm font-semibold text-brand-ink capitalize"
                  >
                    {name}
                    <button
                      type="button"
                      onClick={() => removeSymptom(name)}
                      className="inline-flex items-center justify-center w-7 h-7 rounded-full text-slate-500 hover:bg-slate-200/60"
                      aria-label={`Remove ${name}`}
                    >
                      <IconClose size={14} />
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  onClick={() => setActiveSymptoms([])}
                  className="shrink-0 h-9 px-2 text-sm font-semibold text-slate-500"
                >
                  Clear
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] shrink-0">
              <button
                type="button"
                onClick={() => openBrowser(null)}
                className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl glass-chip text-sm font-semibold text-brand-ink"
                id="mobile-all-symptoms"
              >
                <IconSearch size={15} />
                All symptoms
              </button>
              <AreaControl />
            </div>
          </div>
        )}
      </section>

      {/* Differential Results Section */}
      {hasSearched && (
        <section ref={resultsRef} className="scroll-mt-16 max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 w-full animate-fade-in relative">
          {/* Subtle Results Ambient Aura */}
          <div className="absolute top-[10%] right-[15%] w-72 h-72 rounded-full bg-brand/08 blur-[90px] pointer-events-none -z-10" />

          {/* Phones: the body is above; one tap goes back to it */}
          {!isDesktop && (
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className="mb-4 inline-flex items-center gap-1.5 min-h-10 px-3 rounded-xl glass-chip text-sm font-semibold text-brand-ink"
            >
              <IconArrowLeft size={15} className="rotate-90" />
              Change symptoms on the body
            </button>
          )}

          {/* Resolved Symptoms Telemetry */}
          {resolvedSymptoms.length > 0 && (
            <div className="mb-5 p-3.5 sm:p-4.5 rounded-2xl glass-panel shadow-xs animate-slide-up">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5">
                Symptoms we understood
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {resolvedSymptoms.map((rs) => (
                  <span
                    key={rs.input}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                      rs.match_type === "none"
                        ? "bg-red-50/85 text-red-800 border-red-200/90 shadow-2xs"
                        : rs.match_type === "exact"
                          ? "glass-chip text-brand-ink font-semibold"
                          : "bg-white/80 text-slate-800 border-slate-200/90 shadow-2xs"
                    }`}
                  >
                    <span className="capitalize font-semibold">
                      {rs.input.replace(/_/g, " ")}
                    </span>
                    {rs.match_type === "none" ? (
                      <span className="flex items-center gap-0.5 text-red-700">
                        <IconClose size={12} />
                        <span>not recognised</span>
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
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-line/80">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                Matching conditions ({total})
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
                    Don&apos;t rule out
                  </h2>
                  <p className="text-xs text-red-700/90">
                    Serious conditions that also fit these symptoms. Rare, but worth knowing.
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
                No matching conditions found
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Try different words, or add another symptom.
              </p>
            </div>
          )}

          {/* Clinical Advisory Notice */}
          <div className="mt-8 p-4 rounded-2xl glass-panel text-xs text-slate-600 flex gap-3">
            <IconWarning size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-800">Please note: </span>
              These results are for reference and are not a diagnosis. If symptoms are severe or sudden, contact emergency services.
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
