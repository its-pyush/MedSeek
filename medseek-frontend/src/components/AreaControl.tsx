"use client";

import React, { useState } from "react";
import { IconCrosshair, IconClose } from "./icons";
import { useAreaCell, type AreaStatus } from "@/lib/location";

/**
 * "Use my area": lets confirmed cases near the user raise matching conditions.
 * Only a ~55 km area is stored and sent, never the exact position.
 */
export default function AreaControl() {
  const { cell, request, clear } = useAreaCell();
  const [status, setStatus] = useState<AreaStatus>("idle");

  if (cell) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-slate-600" title={`Area used: ${cell} (about 55 km across)`}>
        <IconCrosshair size={14} className="text-emerald-600" />
        Using your area
        <button
          type="button"
          onClick={clear}
          className="inline-flex items-center gap-1 h-8 px-2 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-200/60"
          aria-label="Stop using my area"
        >
          <IconClose size={12} /> Stop
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 text-sm">
      <button
        type="button"
        onClick={() => request(setStatus)}
        disabled={status === "locating"}
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-sm font-semibold text-brand-ink hover:bg-brand/10 disabled:opacity-60"
        title="Conditions recently confirmed near you rank higher. Only a ~55 km area is used."
        id="use-my-area"
      >
        <IconCrosshair size={14} />
        {status === "locating" ? "Finding your area…" : "Use my area"}
      </button>
      {status === "denied" && <span className="text-xs text-slate-500">Location was not allowed.</span>}
      {status === "unavailable" && <span className="text-xs text-slate-500">Location is not available.</span>}
    </span>
  );
}
