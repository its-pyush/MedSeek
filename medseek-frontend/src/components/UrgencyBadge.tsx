import React from "react";
import {
  IconUrgencyEmergency,
  IconUrgencyHigh,
  IconUrgencyModerate,
  IconUrgencyLow,
} from "./icons";

export type UrgencyLevel = "low" | "moderate" | "high" | "emergency";

const urgencyConfig: Record<
  UrgencyLevel,
  {
    label: string;
    badgeClass: string;
    iconClass: string;
    Icon: React.ComponentType<{ size?: number; className?: string }>;
  }
> = {
  low: {
    label: "Low Priority",
    badgeClass: "bg-emerald-50/90 text-emerald-800 border-emerald-300",
    iconClass: "text-emerald-700",
    Icon: IconUrgencyLow,
  },
  moderate: {
    label: "Moderate",
    badgeClass: "bg-amber-50/90 text-amber-800 border-amber-300",
    iconClass: "text-amber-700",
    Icon: IconUrgencyModerate,
  },
  high: {
    label: "Urgent",
    badgeClass: "bg-orange-50/90 text-orange-900 border-orange-300",
    iconClass: "text-orange-700",
    Icon: IconUrgencyHigh,
  },
  emergency: {
    label: "Critical",
    badgeClass: "bg-red-50 text-red-900 border-red-300 font-bold",
    iconClass: "text-red-700",
    Icon: IconUrgencyEmergency,
  },
};

interface UrgencyBadgeProps {
  level: UrgencyLevel;
  size?: "sm" | "md";
}

export default function UrgencyBadge({ level, size = "sm" }: UrgencyBadgeProps) {
  const config = urgencyConfig[level] || urgencyConfig.low;
  const { Icon } = config;
  const isSm = size === "sm";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border tracking-tight font-medium ${
        isSm ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"
      } ${config.badgeClass}`}
    >
      <Icon size={isSm ? 12 : 14} className={config.iconClass} />
      <span>{config.label}</span>
    </span>
  );
}
