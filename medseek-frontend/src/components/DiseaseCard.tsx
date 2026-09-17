import React from "react";
import Link from "next/link";
import UrgencyBadge from "./UrgencyBadge";

interface DiseaseCardProps {
  id: number;
  name: string;
  description: string | null;
  urgency_level: "low" | "moderate" | "high" | "emergency";
  score: number;
  matched_symptoms: string[];
  total_symptoms: number;
  isWarning?: boolean;
}

export default function DiseaseCard({
  id,
  name,
  description,
  urgency_level,
  score,
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
      className={`group block rounded-2xl border p-5 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 ${
        isWarning
          ? "border-red-200/80 bg-red-50/40 hover:border-red-300 shadow-xs"
          : "border-slate-200/80 bg-white/90 hover:border-blue-300 shadow-xs hover:shadow-blue-500/5"
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="text-lg font-bold text-slate-800 group-hover:text-blue-600 transition-colors capitalize">
          {name.replace(/_/g, " ")}
        </h3>
        <UrgencyBadge level={urgency_level} />
      </div>

      {description && (
        <p className="text-sm text-slate-600 mb-4 line-clamp-2 leading-relaxed">
          {description}
        </p>
      )}

      {/* Matched symptoms */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {matched_symptoms.slice(0, 6).map((symptom) => (
          <span
            key={symptom}
            className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-medium bg-blue-50/80 text-blue-700 border border-blue-200/60 capitalize"
          >
            {symptom.replace(/_/g, " ")}
          </span>
        ))}
        {matched_symptoms.length > 6 && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200/60">
            +{matched_symptoms.length - 6} more
          </span>
        )}
      </div>

      {/* Score bar */}
      <div className="flex items-center gap-3 pt-1 border-t border-slate-100">
        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-500"
            style={{ width: `${Math.min(matchPercentage, 100)}%` }}
          />
        </div>
        <span className="text-xs font-medium text-slate-500 tabular-nums whitespace-nowrap">
          {matched_symptoms.length}/{total_symptoms} symptoms · {matchPercentage}% match
        </span>
      </div>
    </Link>
  );
}
