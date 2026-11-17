"use client";

import React, { useMemo, useState } from "react";
import { IconArrowLeft, IconCheck, IconClose, IconChevronRight, IconSearch } from "./icons";
import type { MajorRegion } from "./regionHierarchy";

/**
 * The list side of the body picker.
 *
 * Two steps only, so there is never much on screen at once:
 *   1. "Where is the problem?"  — a list of body areas (front or back)
 *   2. "What do you feel there?" — a checklist of symptoms for the chosen part
 *
 * Everything ticked here shows up as a tag in the main search bar. The footer
 * always offers the next action: search with what has been picked.
 *
 * Presentational only — all state lives in HumanBodyModel so the list and the
 * 3D model can never disagree.
 */

export interface PickerSymptom {
  id: string;
  name: string;
  description?: string;
}

export interface PickerRegion {
  name: string;
  topSymptoms: PickerSymptom[];
  secondarySymptoms?: PickerSymptom[];
}

interface BodyPickerPanelProps {
  isBackView: boolean;
  onShowFront: () => void;
  onShowBack: () => void;

  areas: MajorRegion[];
  activeArea: MajorRegion | null;
  activePartId: string | null;
  region: PickerRegion | null;

  onSelectArea: (area: MajorRegion) => void;
  onSelectPart: (partId: string) => void;
  onBackToAreas: () => void;
  onHoverRegion: (id: string | null) => void;

  selectedSymptoms: string[];
  onToggleSymptom: (id: string) => void;
  onClear: () => void;
  onClose: () => void;
  onSearch: () => void;

  /**
   * "bar": a single slim row for phones while the user picks an area by
   * tapping the body, so the model keeps the whole screen.
   * "panel" (default): the full two-step list.
   */
  layout?: "panel" | "bar";
  /** Bar → open the area list for people who would rather not tap the model. */
  onShowList?: () => void;
  /** Panel on a phone → go back to tapping the model. */
  onHideList?: () => void;
}

export default function BodyPickerPanel({
  isBackView,
  onShowFront,
  onShowBack,
  areas,
  activeArea,
  activePartId,
  region,
  onSelectArea,
  onSelectPart,
  onBackToAreas,
  onHoverRegion,
  selectedSymptoms,
  onToggleSymptom,
  onClear,
  onClose,
  onSearch,
  layout = "panel",
  onShowList,
  onHideList,
}: BodyPickerPanelProps) {
  const [filter, setFilter] = useState("");
  const onSymptomStep = Boolean(region && activePartId);

  const symptoms = useMemo(() => {
    if (!region) return [];
    const all = [...region.topSymptoms, ...(region.secondarySymptoms ?? [])];
    const q = filter.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (s) => s.name.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q)
    );
  }, [region, filter]);

  const title = onSymptomStep ? region!.name : "Where is the problem?";
  const count = selectedSymptoms.length;

  const sideSwitch = (
    <div className="flex items-center bg-slate-100 p-1 rounded-xl" role="tablist" aria-label="Body side">
      {[
        { label: "Front", active: !isBackView, onClick: onShowFront },
        { label: "Back", active: isBackView, onClick: onShowBack },
      ].map((side) => (
        <button
          key={side.label}
          type="button"
          role="tab"
          aria-selected={side.active}
          onClick={side.onClick}
          className={`min-h-9 px-4 rounded-lg text-sm font-semibold transition-colors ${
            side.active ? "bg-white text-brand-ink shadow-xs" : "text-slate-600"
          }`}
        >
          {side.label}
        </button>
      ))}
    </div>
  );

  if (layout === "bar") {
    return (
      <div
        className="bg-white border-t border-line shadow-[0_-4px_16px_rgba(15,23,42,0.08)] px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        onPointerDown={(e) => e.stopPropagation()}
        role="toolbar"
        aria-label="Body picker"
      >
        <p className="text-center text-sm font-semibold text-slate-700 mb-2">
          Tap the part of the body that hurts
        </p>
        <div className="flex items-center gap-2">
          {sideSwitch}
          <button
            type="button"
            onClick={onShowList}
            className="min-h-11 px-3 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700"
          >
            List
          </button>
          <button
            type="button"
            onClick={onSearch}
            disabled={count === 0}
            className="btn-3d-primary ml-auto min-h-11 px-4 rounded-xl text-sm font-bold disabled:opacity-50"
          >
            {count === 0 ? "Search" : `Search (${count})`}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center w-11 h-11 rounded-xl text-slate-500 hover:bg-slate-100"
            aria-label="Close body picker"
          >
            <IconClose size={18} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full bg-white border border-line rounded-t-2xl lg:rounded-2xl shadow-xl overflow-hidden"
      onPointerDown={(e) => e.stopPropagation()}
      role="dialog"
      aria-label="Choose symptoms by body area"
    >
      {/* Header: one way back, one way out */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-200">
        {onSymptomStep ? (
          <button
            type="button"
            onClick={() => {
              setFilter("");
              onBackToAreas();
            }}
            className="inline-flex items-center gap-1.5 min-h-11 px-3 rounded-xl text-sm font-semibold text-brand-ink hover:bg-brand/10"
          >
            <IconArrowLeft size={16} />
            <span>All areas</span>
          </button>
        ) : (
          <>
            {sideSwitch}
            {onHideList && (
              <button
                type="button"
                onClick={onHideList}
                className="min-h-9 px-3 rounded-xl text-sm font-semibold text-brand-ink hover:bg-brand/10"
              >
                Tap on body
              </button>
            )}
          </>
        )}

        <button
          type="button"
          onClick={onClose}
          className="ml-auto inline-flex items-center justify-center w-11 h-11 rounded-xl text-slate-500 hover:bg-slate-100"
          aria-label="Close body picker"
        >
          <IconClose size={18} />
        </button>
      </div>

      <div className="px-4 pt-3 pb-2">
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500">
          {onSymptomStep ? "Tick everything you feel here." : "Tap the body, or choose from this list."}
        </p>
      </div>

      {/* Step 2 extras: parts of the chosen area + filter */}
      {onSymptomStep && activeArea?.subRegions && activeArea.subRegions.length > 1 && (
        <div className="flex gap-2 px-4 pb-2 overflow-x-auto shrink-0">
          {activeArea.subRegions.map((part) => {
            const active = part.id === activePartId;
            return (
              <button
                key={part.id}
                type="button"
                onClick={() => {
                  setFilter("");
                  onSelectPart(part.id);
                }}
                onPointerEnter={() => onHoverRegion(part.id)}
                onPointerLeave={() => onHoverRegion(null)}
                className={`shrink-0 min-h-10 px-3.5 rounded-full text-sm font-semibold border transition-colors ${
                  active
                    ? "bg-brand border-brand text-white"
                    : "bg-white border-slate-300 text-slate-700 hover:border-brand/60"
                }`}
              >
                {part.label}
              </button>
            );
          })}
        </div>
      )}

      {onSymptomStep && (region!.topSymptoms.length + (region!.secondarySymptoms?.length ?? 0)) > 6 && (
        <div className="relative px-4 pb-2 shrink-0">
          <IconSearch size={16} className="absolute left-7 top-1/2 -translate-y-[70%] text-slate-400" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter this list"
            className="w-full min-h-11 pl-10 pr-3 bg-slate-50 border border-slate-200 rounded-xl text-base text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-brand"
          />
        </div>
      )}

      {/* The list */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3">
        {!onSymptomStep && (
          <ul className="space-y-1.5">
            {areas.map((area) => (
              <li key={area.id}>
                <button
                  type="button"
                  onClick={() => onSelectArea(area)}
                  onPointerEnter={() => onHoverRegion(area.id)}
                  onPointerLeave={() => onHoverRegion(null)}
                  className="w-full min-h-12 px-4 flex items-center justify-between rounded-xl border border-slate-200 bg-white text-left text-base font-semibold text-slate-800 hover:border-brand/60 hover:bg-brand/5"
                >
                  <span>{area.label}</span>
                  <IconChevronRight size={16} className="text-slate-400" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {onSymptomStep && (
          <ul className="space-y-1.5">
            {symptoms.map((symptom) => {
              const checked = selectedSymptoms.includes(symptom.id);
              return (
                <li key={symptom.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    onClick={() => onToggleSymptom(symptom.id)}
                    className={`w-full min-h-12 px-3 py-2 flex items-center gap-3 rounded-xl border text-left transition-colors ${
                      checked
                        ? "bg-brand/10 border-brand"
                        : "bg-white border-slate-200 hover:border-brand/60"
                    }`}
                  >
                    <span
                      className={`w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 ${
                        checked ? "bg-brand border-brand text-white" : "border-slate-400 bg-white"
                      }`}
                    >
                      {checked && <IconCheck size={14} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-base font-semibold text-slate-900">{symptom.name}</span>
                      {symptom.description && (
                        <span className="block text-sm text-slate-500">{symptom.description}</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
            {symptoms.length === 0 && (
              <li className="py-6 text-center text-sm text-slate-500">Nothing in this list matches.</li>
            )}
          </ul>
        )}
      </div>

      {/* Footer: always the next action */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-t border-slate-200 bg-slate-50">
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
  );
}
