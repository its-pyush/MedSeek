import React from "react";
import Link from "next/link";
import UrgencyBadge from "./UrgencyBadge";
import { IconWarning, IconChevronRight } from "./icons";

interface DiseaseCardProps {
  id: number;
  name: string;
  description: string | null;
  urgency_level: "low" | "moderate" | "high" | "emergency";
  score?: number;
  matched_symptoms: string[];
  total_symptoms: number;
  isWarning?: boolean;
}

export default function DiseaseCard({
  id,
  name,
  description,
  urgency_level,
  matched_symptoms,
  total_symptoms,
  isWarning = false,
}: DiseaseCardProps) {
  const matchPercentage = total_symptoms > 0
    ? Math.round((matched_symptoms.length / total_symptoms) * 100)
    : 0;

  return (
    <Link
      href={`/disease/${id}`}
      className={`group block rounded-2xl p-4 sm:p-4.5 transition-all duration-200 ${
        isWarning ? "glass-card-warning" : "glass-card"
      }`}
    >
      {/* Header: Name + Urgency Badge */}
      <div className="flex items-start justify-between gap-2.5 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {isWarning && (
            <IconWarning size={16} className="text-red-600 shrink-0 mt-0.5" />
          )}
          <h3 className="text-sm sm:text-base font-bold text-slate-900 group-hover:text-[#3a5ebb] transition-colors capitalize truncate">
            {name.replace(/_/g, " ")}
          </h3>
        </div>
        <div className="shrink-0">
          <UrgencyBadge level={urgency_level} size="sm" />
        </div>
      </div>

      {/* Description */}
      {description && (
        <p className="text-xs text-slate-600 mb-3 line-clamp-2 leading-relaxed font-normal">
          {description}
        </p>
      )}

      {/* Matched Symptom Tags */}
      <div className="flex flex-wrap gap-1 sm:gap-1.5 mb-3">
        {matched_symptoms.slice(0, 5).map((symptom) => (
          <span
            key={symptom}
            className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-white/70 text-slate-700 border border-slate-200/80 capitalize shadow-2xs"
          >
            {symptom.replace(/_/g, " ")}
          </span>
        ))}
        {matched_symptoms.length > 5 && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-white/50 text-slate-500 border border-slate-200/80">
            +{matched_symptoms.length - 5} more
          </span>
        )}
      </div>

      {/* Match Telemetry Bar */}
      <div className="flex items-center justify-between gap-3 pt-2.5 border-t border-slate-200/60 text-xs">
        <div className="flex-1 flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-slate-200/70 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                isWarning
                  ? "bg-red-600 shadow-[0_0_8px_rgba(220,38,38,0.4)]"
                  : "bg-[#3a5ebb] shadow-[0_0_8px_rgba(58,94,187,0.4)]"
              }`}
              style={{ width: `${Math.min(matchPercentage, 100)}%` }}
            />
          </div>
          <span className="font-mono text-[11px] font-semibold text-slate-600 tabular-nums">
            {matchPercentage}%
          </span>
        </div>

        <div className="flex items-center gap-1 text-[11px] text-slate-500 font-medium shrink-0 group-hover:text-[#3a5ebb] transition-colors">
          <span>{matched_symptoms.length}/{total_symptoms} markers</span>
          <IconChevronRight size={12} className="text-slate-400 group-hover:translate-x-0.5 transition-transform" />
        </div>
      </div>
    </Link>
  );
}
