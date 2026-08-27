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
      className={`group block rounded-2xl border p-5 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 ${
        isWarning
          ? "border-red-200 bg-red-50/50 dark:border-red-800/50 dark:bg-red-950/20 hover:border-red-300 dark:hover:border-red-700"
          : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 hover:border-indigo-300 dark:hover:border-indigo-700"
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors capitalize">
          {name.replace(/_/g, " ")}
        </h3>
        <UrgencyBadge level={urgency_level} />
      </div>

      {description && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4 line-clamp-2">
          {description}
        </p>
      )}

      {/* Matched symptoms */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {matched_symptoms.slice(0, 6).map((symptom) => (
          <span
            key={symptom}
            className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 capitalize"
          >
            {symptom.replace(/_/g, " ")}
          </span>
        ))}
        {matched_symptoms.length > 6 && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            +{matched_symptoms.length - 6} more
          </span>
        )}
      </div>

      {/* Score bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500"
            style={{ width: `${Math.min(matchPercentage, 100)}%` }}
          />
        </div>
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 tabular-nums whitespace-nowrap">
          {matched_symptoms.length}/{total_symptoms} symptoms · {score.toFixed(2)}
        </span>
      </div>
    </Link>
  );
}
