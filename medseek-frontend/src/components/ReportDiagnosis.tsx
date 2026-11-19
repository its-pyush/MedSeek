"use client";

import React, { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { API_BASE_URL } from "@/lib/config";
import { fetchWithAuth, isLoggedIn } from "@/lib/auth";
import { useAreaCell, type AreaStatus } from "@/lib/location";
import { IconCheck } from "./icons";

/**
 * "A doctor diagnosed me with this." One anonymous count for the user's area,
 * which helps rank this condition for other people nearby.
 */
export default function ReportDiagnosis({ diseaseId }: { diseaseId: number }) {
  const { cell, request } = useAreaCell();
  const [areaStatus, setAreaStatus] = useState<AreaStatus>("idle");
  const [state, setState] = useState<"idle" | "sending" | "counted" | "already" | "error">("idle");
  // Read after hydration so the server-rendered page and the browser agree.
  const loggedIn = useSyncExternalStore(() => () => {}, isLoggedIn, () => false);

  const send = async () => {
    if (!cell) return;
    setState("sending");
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/api/cases`, {
        method: "POST",
        body: JSON.stringify({ disease_id: diseaseId, cell }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const body = await res.json();
      setState(body.data?.counted ? "counted" : "already");
    } catch {
      setState("error");
    }
  };

  return (
    <div className="mt-4 glass-panel p-4 rounded-xl max-w-3xl">
      <p className="text-sm font-semibold text-slate-900">Has a doctor diagnosed you with this?</p>
      <p className="text-xs text-slate-600 mt-0.5">
        Telling us helps people near you: conditions recently confirmed in an area rank higher there. We store only the
        condition, a ~55 km area and the date — not your name or exact location. Self-reported, not verified.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!loggedIn ? (
          <Link href="/login" className="btn-3d-secondary min-h-10 px-4 rounded-xl text-sm font-semibold inline-flex items-center">
            Log in to report
          </Link>
        ) : state === "counted" || state === "already" ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
            <IconCheck size={15} />
            {state === "counted" ? "Thank you — counted for your area." : "Already counted for you this month."}
          </span>
        ) : !cell ? (
          <>
            <button
              type="button"
              onClick={() => request(setAreaStatus)}
              className="btn-3d-secondary min-h-10 px-4 rounded-xl text-sm font-semibold"
            >
              {areaStatus === "locating" ? "Finding your area…" : "Share my area to report"}
            </button>
            {areaStatus === "denied" && <span className="text-xs text-slate-500">Location was not allowed.</span>}
          </>
        ) : (
          <button
            type="button"
            onClick={send}
            disabled={state === "sending"}
            className="btn-3d-primary min-h-10 px-4 rounded-xl text-sm font-bold disabled:opacity-60"
            id="report-diagnosis"
          >
            {state === "sending" ? "Sending…" : "A doctor diagnosed me with this"}
          </button>
        )}
        {state === "error" && <span className="text-xs text-red-600">Could not send. Try again later.</span>}
      </div>
    </div>
  );
}
