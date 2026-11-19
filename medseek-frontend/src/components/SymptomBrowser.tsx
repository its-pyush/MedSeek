"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { IconCheck, IconClose, IconSearch } from "./icons";
import { PART_TO_MAJOR, getMajor, regionLabel } from "./regionHierarchy";
import { loadSymptomCatalog, type CatalogSymptom, type SymptomCatalog } from "@/lib/symptoms";

/**
 * Every symptom MedSeek knows, in one searchable list.
 *
 * Opens over the page (full screen on phones). Ticking a symptom adds it to
 * the search bar, exactly like the body picker does. The search box matches
 * other words for a symptom too, so "tired" finds "fatigue".
 */

interface SymptomBrowserProps {
  open: boolean;
  onClose: () => void;
  selectedSymptoms: string[];
  onToggleSymptom: (name: string) => void;
  onClear: () => void;
  onSearch: () => void;
  /** Area or part id to start filtered on (from the body picker). */
  initialArea?: string | null;
}

/** Filter chips. Front and back of the same area share one chip. */
const AREA_FILTERS: { id: string; label: string; majors: string[] }[] = [
  { id: "head", label: "Head & face", majors: ["head", "head_back"] },
  { id: "neck", label: "Neck & throat", majors: ["neck"] },
  { id: "chest", label: "Chest", majors: ["chest"] },
  { id: "abdomen", label: "Belly", majors: ["abdomen"] },
  { id: "pelvic", label: "Pelvis & groin", majors: ["pelvic"] },
  { id: "back", label: "Back", majors: ["back"] },
  { id: "buttocks", label: "Hips & buttocks", majors: ["buttocks"] },
  { id: "arms", label: "Arms & hands", majors: ["arms"] },
  { id: "legs", label: "Legs & feet", majors: ["legs", "legs_back"] },
  { id: "skin", label: "Skin", majors: ["skin"] },
  { id: "mind", label: "Mind & mood", majors: ["mind"] },
  { id: "general", label: "Whole body", majors: ["general"] },
];

const GROUP_LABELS: Record<string, string> = { general: "Whole body", skin: "Skin", mind: "Mind & mood" };

/** The filter chip an area/part id falls under. */
function filterFor(areaId: string): string | null {
  const major = getMajor(areaId)?.id ?? PART_TO_MAJOR[areaId] ?? areaId;
  return AREA_FILTERS.find((f) => f.majors.includes(major))?.id ?? null;
}

const PAGE = 120;

type Row = { symptom: CatalogSymptom; via: string | null };

export default function SymptomBrowser(props: SymptomBrowserProps) {
  // Mounted only while open, so every opening starts fresh on the right area.
  if (!props.open || typeof document === "undefined") return null;
  return <SymptomBrowserDialog {...props} />;
}

function SymptomBrowserDialog({
  onClose,
  selectedSymptoms,
  onToggleSymptom,
  onClear,
  onSearch,
  initialArea = null,
}: SymptomBrowserProps) {
  const [catalog, setCatalog] = useState<SymptomCatalog | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [area, setArea] = useState<string | null>(() => (initialArea ? filterFor(initialArea) : null));
  const [sort, setSort] = useState<"common" | "az">("common");
  const [limit, setLimit] = useState(PAGE);

  // Load the list (cached after the first time).
  useEffect(() => {
    let alive = true;
    loadSymptomCatalog()
      .then((c) => alive && setCatalog(c))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [attempt]);

  // Escape closes; the page behind does not scroll.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const rows = useMemo<Row[]>(() => {
    if (!catalog) return [];
    const q = query.trim().toLowerCase();
    const majors = area ? AREA_FILTERS.find((f) => f.id === area)?.majors ?? [] : null;

    const scored: { row: Row; rank: number }[] = [];
    for (const symptom of catalog.symptoms) {
      if (majors && !symptom.bodyAreas.some((a) => majors.includes(getMajor(a)?.id ?? PART_TO_MAJOR[a] ?? a))) {
        continue;
      }
      if (!q) {
        scored.push({ row: { symptom, via: null }, rank: 0 });
        continue;
      }
      const name = symptom.name.toLowerCase();
      if (name.startsWith(q)) scored.push({ row: { symptom, via: null }, rank: 0 });
      else if (name.includes(q)) scored.push({ row: { symptom, via: null }, rank: 1 });
      else {
        const via = symptom.synonyms.find((s) => s.toLowerCase().includes(q));
        if (via) scored.push({ row: { symptom, via }, rank: 2 });
      }
    }
    scored.sort(
      (a, b) =>
        a.rank - b.rank ||
        (sort === "az"
          ? a.row.symptom.name.localeCompare(b.row.symptom.name)
          : b.row.symptom.diseaseCount - a.row.symptom.diseaseCount ||
            a.row.symptom.name.localeCompare(b.row.symptom.name))
    );
    return scored.map((s) => s.row);
  }, [catalog, query, area, sort]);

  const count = selectedSymptoms.length;
  const total = catalog?.symptoms.length ?? 0;
  const visible = rows.slice(0, limit);

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-slate-900/45 backdrop-blur-sm sm:p-6"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="All symptoms"
    >
      <div className="w-full sm:max-w-2xl h-[100dvh] sm:h-[min(46rem,88vh)] flex flex-col bg-white sm:rounded-2xl border border-line shadow-2xl overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-slate-900">All symptoms</h2>
            <p className="text-sm text-slate-500">
              {catalog
                ? `Showing ${rows.length.toLocaleString()} of ${total.toLocaleString()}`
                : failed
                  ? "Could not load the list"
                  : "Loading…"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-11 h-11 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
            aria-label="Close the symptom list"
          >
            <IconClose size={18} />
          </button>
        </div>

        {/* Search + sort */}
        <div className="px-4 flex items-center gap-2">
          <div className="relative flex-1">
            <IconSearch size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(PAGE);
              }}
              placeholder="Search symptoms, e.g. tired or itchy"
              className="w-full min-h-11 pl-10 pr-3 bg-slate-50 border border-slate-200 rounded-xl text-base text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-brand"
              id="symptom-browser-search"
              autoComplete="off"
            />
          </div>
          <button
            type="button"
            onClick={() => setSort(sort === "common" ? "az" : "common")}
            className="shrink-0 min-h-11 px-3 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:border-brand/60"
            title="Change the order of the list"
          >
            {sort === "common" ? "Most common" : "A to Z"}
          </button>
        </div>

        {/* Area filter */}
        <div className="mt-3 px-4 pb-3 flex gap-2 overflow-x-auto border-b border-slate-200" role="tablist" aria-label="Body area">
          {[{ id: null as string | null, label: "All" }, ...AREA_FILTERS].map((f) => {
            const active = area === f.id;
            return (
              <button
                key={f.id ?? "all"}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setArea(f.id);
                  setLimit(PAGE);
                }}
                className={`shrink-0 min-h-9 px-3.5 rounded-full border text-sm font-semibold whitespace-nowrap transition-colors ${
                  active
                    ? "bg-brand/15 border-brand text-brand-ink"
                    : "bg-white border-slate-200 text-slate-600 hover:border-brand/60"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {/* List */}
        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
          {!catalog && !failed && (
            <p className="py-10 text-center text-sm text-slate-500">Loading the symptom list…</p>
          )}
          {failed && (
            <div className="py-10 text-center">
              <p className="text-sm text-slate-600">
                The symptom list did not load. The server may be waking up.
              </p>
              <button
                type="button"
                onClick={() => {
                  setFailed(false);
                  setAttempt((n) => n + 1);
                }}
                className="btn-3d-secondary mt-3 min-h-11 px-4 rounded-xl text-sm font-semibold"
              >
                Try again
              </button>
            </div>
          )}
          {catalog && (
            <ul className="space-y-1.5">
              {visible.map(({ symptom, via }) => {
                const checked = selectedSymptoms.includes(symptom.name);
                const where = [
                  ...new Set(symptom.bodyAreas.map((a) => GROUP_LABELS[a] ?? regionLabel(a)).filter(Boolean)),
                ].join(", ");
                return (
                  <li key={symptom.name}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      onClick={() => onToggleSymptom(symptom.name)}
                      className={`w-full min-h-12 px-3 py-2 flex items-center gap-3 rounded-xl border text-left transition-colors ${
                        checked ? "bg-brand/10 border-brand" : "bg-white border-slate-200 hover:border-brand/60"
                      }`}
                    >
                      <span
                        className={`w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 ${
                          checked ? "bg-brand border-brand text-white" : "border-slate-400 bg-white"
                        }`}
                      >
                        {checked && <IconCheck size={14} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-base font-semibold text-slate-900 first-letter:uppercase">
                          {symptom.name}
                        </span>
                        <span className="block text-sm text-slate-500 truncate">
                          {via ? `Also called “${via}” · ` : ""}
                          {where}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-slate-500 text-right">
                        {symptom.diseaseCount.toLocaleString()}
                        <span className="block">{symptom.diseaseCount === 1 ? "condition" : "conditions"}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
              {rows.length === 0 && (
                <li className="py-10 text-center text-sm text-slate-500">
                  No symptom matches. Try a different word, or choose “All”.
                </li>
              )}
              {rows.length > limit && (
                <li className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={() => setLimit(limit + PAGE * 2)}
                    className="btn-3d-secondary min-h-11 px-4 rounded-xl text-sm font-semibold"
                  >
                    Show more ({(rows.length - limit).toLocaleString()} left)
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>

        {/* Footer: same next action as the body picker */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-t border-slate-200 bg-slate-50 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
          <span className="text-sm font-semibold text-slate-700">
            {count === 0 ? "Nothing selected yet" : `${count} selected`}
          </span>
          {count > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="min-h-11 px-3 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-200/70"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={onSearch}
            disabled={count === 0}
            className="btn-3d-primary ml-auto min-h-11 px-5 rounded-xl text-sm font-bold disabled:opacity-50"
          >
            Search
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
