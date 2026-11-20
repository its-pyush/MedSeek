"use client";

import React from "react";
import { IconArrowLeft, IconCheck, IconPlus } from "./icons";
import type { PickerRegion } from "./BodyPickerPanel";

/**
 * Phone picker, drawn over the 3D body (HumanBodyModel variant="chips").
 *
 * - "← Full body" (top left) once an area is open.
 * - Front / Back switch (bottom left).
 * - The symptoms of the tapped part as a column of chips on the right; the
 *   camera moves the body to the left so the chips never cover the part.
 *
 * Presentational only: state lives in HumanBodyModel.
 */

interface BodyChipsProps {
  zoomed: boolean;
  isBackView: boolean;
  onShowFront: () => void;
  onShowBack: () => void;
  onFullBody: () => void;
  /** The tapped part's symptoms; null while no part is open. */
  region: PickerRegion | null;
  selectedSymptoms: string[];
  onToggleSymptom: (id: string) => void;
  /** Opens the full symptom list for this part. */
  onMore?: () => void;
  /** Shown top right while the whole body is in view (e.g. the Female | Male switch). */
  cornerControl?: React.ReactNode;
}

/** Taps on the controls must not start a drag or reach the canvas. */
const stop = (e: React.PointerEvent) => e.stopPropagation();

export default function BodyChips({
  zoomed,
  isBackView,
  onShowFront,
  onShowBack,
  onFullBody,
  region,
  selectedSymptoms,
  onToggleSymptom,
  onMore,
  cornerControl,
}: BodyChipsProps) {
  const symptoms = region ? [...region.topSymptoms, ...(region.secondarySymptoms ?? [])] : [];

  return (
    <>
      {!zoomed && cornerControl && (
        <div onPointerDown={stop} className="absolute top-2 right-3 z-30">
          {cornerControl}
        </div>
      )}

      {zoomed && (
        <button
          type="button"
          onPointerDown={stop}
          onClick={onFullBody}
          className="absolute top-2 left-2 z-30 inline-flex items-center gap-1.5 min-h-11 px-3 rounded-xl glass-chip text-sm font-semibold text-brand-ink"
          id="body-chips-full-body"
        >
          <IconArrowLeft size={16} />
          Full body
        </button>
      )}

      <div
        onPointerDown={stop}
        className="absolute bottom-3 left-3 z-30 flex items-center glass-chip p-1 rounded-xl"
        role="tablist"
        aria-label="Body side"
      >
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
            className={`min-h-10 px-4 rounded-lg text-sm font-semibold transition-colors ${
              side.active ? "btn-3d-primary" : "text-slate-600"
            }`}
          >
            {side.label}
          </button>
        ))}
      </div>

      {region && (
        <div
          onPointerDown={stop}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-30 w-[44%] max-h-[calc(100%-1.5rem)] overflow-y-auto flex flex-col gap-1.5 animate-fade-in"
          role="group"
          aria-label={`Symptoms: ${region.name}`}
          id="body-chips"
        >
          <p className="px-1 text-xs font-bold uppercase tracking-wider text-slate-500">{region.name}</p>
          {symptoms.map((symptom) => {
            const checked = selectedSymptoms.includes(symptom.id);
            return (
              <button
                key={symptom.id}
                type="button"
                role="checkbox"
                aria-checked={checked}
                onClick={() => onToggleSymptom(symptom.id)}
                className={`w-full min-h-11 px-3 py-2 flex items-center gap-2 rounded-xl text-left text-sm font-semibold leading-snug transition-colors ${
                  checked ? "btn-3d-primary" : "glass-chip text-slate-800"
                }`}
              >
                {checked && <IconCheck size={14} className="shrink-0" />}
                <span>{symptom.name}</span>
              </button>
            );
          })}
          {onMore && (
            <button
              type="button"
              onClick={onMore}
              className="w-full min-h-11 px-3 flex items-center gap-2 rounded-xl border border-dashed border-slate-400/70 text-left text-sm font-semibold text-brand-ink"
            >
              <IconPlus size={14} className="shrink-0" />
              More
            </button>
          )}
        </div>
      )}
    </>
  );
}
