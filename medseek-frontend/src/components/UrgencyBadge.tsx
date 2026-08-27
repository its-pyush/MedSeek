import React from "react";

type UrgencyLevel = "low" | "moderate" | "high" | "emergency";

const urgencyConfig: Record<
  UrgencyLevel,
  { label: string; className: string; dotColor: string }
> = {
  low: {
    label: "Low",
    className:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    dotColor: "bg-emerald-500",
  },
  moderate: {
    label: "Moderate",
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    dotColor: "bg-amber-500",
  },
  high: {
    label: "High",
    className:
      "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
    dotColor: "bg-orange-500",
  },
  emergency: {
    label: "Emergency",
    className:
      "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    dotColor: "bg-red-500",
  },
};

interface UrgencyBadgeProps {
  level: UrgencyLevel;
  size?: "sm" | "md";
}

export default function UrgencyBadge({ level, size = "sm" }: UrgencyBadgeProps) {
  const config = urgencyConfig[level] || urgencyConfig.low;
  const sizeClasses =
    size === "sm" ? "px-2.5 py-0.5 text-xs" : "px-3 py-1 text-sm";

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold rounded-full ${sizeClasses} ${config.className}`}
    >
      {/* Status dot with pulse for emergency */}
      <span className="relative flex h-2 w-2">
        {(level === "emergency" || level === "high") && (
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${config.dotColor} opacity-75`} />
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${config.dotColor}`} />
      </span>
      {level === "emergency" && (
        <svg
          className="w-3 h-3"
          fill="currentColor"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
            clipRule="evenodd"
          />
        </svg>
      )}
      {config.label}
    </span>
  );
}
