"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import AuthGuard from "@/components/AuthGuard";
import { getAuditLog, getAuditActions, AuditEntry } from "@/lib/audit";
import {
  IconActivity,
  IconLogin,
  IconProfile,
  IconRefresh,
  IconEye,
  IconEdit,
  IconSearch,
  IconConsultation,
  IconPlus,
  IconTrash,
  IconWarning,
  IconCheck,
  IconVault,
  IconLockShield,
  IconClock,
  IconChevronRight,
  IconChevronDown,
  IconChevronUp,
  IconClose,
  IconDownload,
  IconShieldCheck,
  IconFilter,
} from "@/components/icons";

// ─── Action Metadata & Categorization ──────────────────────────────

type ActivityCategory = "all" | "auth" | "vault" | "chat" | "search";

interface ActionMeta {
  label: string;
  category: ActivityCategory;
  categoryLabel: string;
  explanation: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  iconBg: string;
  iconText: string;
}

const ACTION_METAS: Record<string, ActionMeta> = {
  "auth.login": {
    label: "Patient Login",
    category: "auth",
    categoryLabel: "Security & Access",
    explanation: "Patient identity authenticated and secure session token established.",
    Icon: IconLogin,
    iconBg: "bg-blue-50 border-blue-200",
    iconText: "text-blue-600",
  },
  "auth.signup": {
    label: "Account Registered",
    category: "auth",
    categoryLabel: "Security & Access",
    explanation: "New patient credentials verified and cryptographic profile initialized.",
    Icon: IconProfile,
    iconBg: "bg-blue-50 border-blue-200",
    iconText: "text-blue-600",
  },
  "auth.refresh": {
    label: "Session Refreshed",
    category: "auth",
    categoryLabel: "Security & Access",
    explanation: "Cryptographic dual-token rotation completed for active patient session.",
    Icon: IconRefresh,
    iconBg: "bg-slate-100 border-slate-200",
    iconText: "text-slate-700",
  },
  "auth.me": {
    label: "Identity Verified",
    category: "auth",
    categoryLabel: "Security & Access",
    explanation: "Active authentication token verified against security gateway.",
    Icon: IconShieldCheck,
    iconBg: "bg-blue-50 border-blue-200",
    iconText: "text-blue-600",
  },
  "profile.view": {
    label: "Profile Inspected",
    category: "auth",
    categoryLabel: "Security & Access",
    explanation: "Patient demographic and clinical profile loaded for inspection.",
    Icon: IconProfile,
    iconBg: "bg-slate-100 border-slate-200",
    iconText: "text-slate-700",
  },
  "profile.update": {
    label: "Profile Updated",
    category: "auth",
    categoryLabel: "Security & Access",
    explanation: "Patient profile records modified and updated in encrypted store.",
    Icon: IconEdit,
    iconBg: "bg-blue-50 border-blue-200",
    iconText: "text-blue-600",
  },
  "vault.read": {
    label: "Record Accessed",
    category: "vault",
    categoryLabel: "Health Vault",
    explanation: "Encrypted health record accessed and decrypted in-memory using envelope IV.",
    Icon: IconEye,
    iconBg: "bg-emerald-50 border-emerald-200",
    iconText: "text-emerald-700",
  },
  "vault.create": {
    label: "Record Encrypted & Saved",
    category: "vault",
    categoryLabel: "Health Vault",
    explanation: "New clinical data point encrypted via AES-256-GCM and stored in personal vault.",
    Icon: IconPlus,
    iconBg: "bg-emerald-50 border-emerald-200",
    iconText: "text-emerald-700",
  },
  "vault.update": {
    label: "Record Modified",
    category: "vault",
    categoryLabel: "Health Vault",
    explanation: "Existing health record updated with re-encrypted ciphertext and timestamp.",
    Icon: IconEdit,
    iconBg: "bg-emerald-50 border-emerald-200",
    iconText: "text-emerald-700",
  },
  "vault.delete": {
    label: "Record Purged",
    category: "vault",
    categoryLabel: "Health Vault",
    explanation: "Encrypted health record permanently purged from database and memory.",
    Icon: IconTrash,
    iconBg: "bg-red-50 border-red-200",
    iconText: "text-red-700",
  },
  "chat.message": {
    label: "Consultation Transmitted",
    category: "chat",
    categoryLabel: "AI Consultations",
    explanation: "Clinical query evaluated by Health AI model with RAG patient context grounding.",
    Icon: IconConsultation,
    iconBg: "bg-blue-50 border-blue-200",
    iconText: "text-blue-700",
  },
  "chat.view": {
    label: "Consultation Viewed",
    category: "chat",
    categoryLabel: "AI Consultations",
    explanation: "Historical AI health consultation session retrieved for review.",
    Icon: IconEye,
    iconBg: "bg-slate-100 border-slate-200",
    iconText: "text-slate-700",
  },
  "search.query": {
    label: "Diagnostic Search",
    category: "search",
    categoryLabel: "Diagnostic Search",
    explanation: "Symptom search query matched against SF-IDF disease ranking engine.",
    Icon: IconSearch,
    iconBg: "bg-sky-50 border-sky-200",
    iconText: "text-sky-700",
  },
  "audit.view": {
    label: "Audit Ledger Viewed",
    category: "search",
    categoryLabel: "Diagnostic Search",
    explanation: "Security ledger and patient access history inspected.",
    Icon: IconActivity,
    iconBg: "bg-slate-100 border-slate-200",
    iconText: "text-slate-700",
  },
};

function getActionMeta(action: string): ActionMeta {
  if (ACTION_METAS[action]) return ACTION_METAS[action];

  // Fallback heuristic based on prefix
  if (action.startsWith("auth.") || action.startsWith("profile.")) {
    return {
      label: action,
      category: "auth",
      categoryLabel: "Security & Access",
      explanation: "Security event processed by MedSeek identity service.",
      Icon: IconLogin,
      iconBg: "bg-blue-50 border-blue-200",
      iconText: "text-blue-600",
    };
  }
  if (action.startsWith("vault.")) {
    return {
      label: action,
      category: "vault",
      categoryLabel: "Health Vault",
      explanation: "Data vault event recorded with AES-256 cryptographic logging.",
      Icon: IconVault,
      iconBg: "bg-emerald-50 border-emerald-200",
      iconText: "text-emerald-700",
    };
  }
  if (action.startsWith("chat.")) {
    return {
      label: action,
      category: "chat",
      categoryLabel: "AI Consultations",
      explanation: "Clinical consultation interaction recorded.",
      Icon: IconConsultation,
      iconBg: "bg-blue-50 border-blue-200",
      iconText: "text-blue-700",
    };
  }
  return {
    label: action,
    category: "search",
    categoryLabel: "Diagnostic Search",
    explanation: "System event logged in patient audit ledger.",
    Icon: IconActivity,
    iconBg: "bg-slate-100 border-slate-200",
    iconText: "text-slate-700",
  };
}

// ─── Temporal Grouping Helpers ─────────────────────────────────────

interface DateGroup {
  id: string;
  label: string;
  dateStr: string;
  entries: AuditEntry[];
}

function parseEntryTime(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const normalized = dateStr.includes("T") ? dateStr : dateStr.replace(" ", "T");
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? null : d;
}

function relativeTime(dateStr: string | null | undefined): string {
  const d = parseEntryTime(dateStr);
  if (!d) return "Unknown";

  const diff = Math.max(0, Date.now() - d.getTime());
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function groupEntriesByDate(entries: AuditEntry[]): DateGroup[] {
  const groups: Map<string, { label: string; dateStr: string; entries: AuditEntry[] }> = new Map();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;
  const sevenDaysAgo = todayStart - 6 * 86400000;

  for (const entry of entries) {
    const d = parseEntryTime(entry.timestamp);
    let groupKey = "older";
    let groupLabel = "Earlier Activity";
    let dateStr = "";

    if (d) {
      const time = d.getTime();
      const entryDayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

      if (entryDayStart >= todayStart) {
        groupKey = "today";
        groupLabel = "Today";
        dateStr = d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
      } else if (entryDayStart >= yesterdayStart) {
        groupKey = "yesterday";
        groupLabel = "Yesterday";
        dateStr = d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
      } else if (time >= sevenDaysAgo) {
        groupKey = `day-${entryDayStart}`;
        groupLabel = d.toLocaleDateString(undefined, { weekday: "long" });
        dateStr = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      } else {
        groupKey = `month-${d.getFullYear()}-${d.getMonth()}`;
        groupLabel = d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
        dateStr = `${d.getFullYear()}`;
      }
    }

    if (!groups.has(groupKey)) {
      groups.set(groupKey, { label: groupLabel, dateStr, entries: [] });
    }
    groups.get(groupKey)!.entries.push(entry);
  }

  return Array.from(groups.entries()).map(([id, val]) => ({
    id,
    label: val.label,
    dateStr: val.dateStr,
    entries: val.entries,
  }));
}

// ─── Main Activity Content Component ───────────────────────────────

function ActivityContent() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [actions, setActions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // Filters state
  const [activeCategory, setActiveCategory] = useState<ActivityCategory>("all");
  const [filterAction, setFilterAction] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<"all" | "success" | "failed">("all");
  const [filterTimeframe, setFilterTimeframe] = useState<"all" | "today" | "7d" | "30d">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [isTabExpanded, setIsTabExpanded] = useState<boolean>(true);

  // Inspection modal state
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null);

  // Load distinct actions once
  useEffect(() => {
    async function loadActions() {
      try {
        const result = await getAuditActions();
        setActions(result);
      } catch {
        /* ignore */
      }
    }
    loadActions();
  }, []);

  // Compute ISO dates for timeframe filter
  const { startDateISO, endDateISO } = useMemo(() => {
    if (filterTimeframe === "all") return { startDateISO: undefined, endDateISO: undefined };
    const now = new Date();
    let start: Date;

    if (filterTimeframe === "today") {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (filterTimeframe === "7d") {
      start = new Date(now.getTime() - 7 * 86400000);
    } else {
      start = new Date(now.getTime() - 30 * 86400000);
    }

    return {
      startDateISO: start.toISOString(),
      endDateISO: now.toISOString(),
    };
  }, [filterTimeframe]);

  // Load audit logs when primary server filters change
  const loadLog = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getAuditLog({
        action: filterAction || undefined,
        startDate: startDateISO,
        endDate: endDateISO,
        limit: pageSize,
        offset: page * pageSize,
      });
      setEntries(result.entries);
      setTotal(result.total);
    } catch {
      // Keep existing or empty
    } finally {
      setIsLoading(false);
    }
  }, [filterAction, startDateISO, endDateISO, pageSize, page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadLog();
  }, [loadLog]);

  // Client-side filtering for category, search query, and status
  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      const meta = getActionMeta(entry.action);

      // Category filter
      if (activeCategory !== "all" && meta.category !== activeCategory) {
        return false;
      }

      // Status filter
      if (filterStatus === "success" && !entry.success) return false;
      if (filterStatus === "failed" && entry.success) return false;

      // Keyword search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesAction = entry.action.toLowerCase().includes(q);
        const matchesLabel = meta.label.toLowerCase().includes(q);
        const matchesTable = (entry.target_table || "").toLowerCase().includes(q);
        const matchesId = entry.target_id ? String(entry.target_id).includes(q) : false;
        const matchesExplanation = meta.explanation.toLowerCase().includes(q);
        if (!matchesAction && !matchesLabel && !matchesTable && !matchesId && !matchesExplanation) {
          return false;
        }
      }

      return true;
    });
  }, [entries, activeCategory, filterStatus, searchQuery]);

  // Group filtered entries temporally
  const dateGroups = useMemo(() => {
    return groupEntriesByDate(filteredEntries);
  }, [filteredEntries]);

  // Metric computations for category tabs
  const metrics = useMemo(() => {
    let authCount = 0;
    let vaultCount = 0;
    let chatCount = 0;
    let searchCount = 0;
    let failedCount = 0;

    for (const item of entries) {
      if (!item.success) failedCount++;
      const cat = getActionMeta(item.action).category;
      if (cat === "auth") authCount++;
      if (cat === "vault") vaultCount++;
      if (cat === "chat") chatCount++;
      if (cat === "search") searchCount++;
    }

    return {
      totalEvents: total,
      authCount,
      vaultCount,
      chatCount,
      searchCount,
      failedCount,
    };
  }, [entries, total]);

  // Reset all filters helper
  const handleResetFilters = () => {
    setActiveCategory("all");
    setFilterAction("");
    setFilterStatus("all");
    setFilterTimeframe("all");
    setSearchQuery("");
    setPage(0);
  };

  const hasActiveFilters =
    activeCategory !== "all" ||
    filterAction !== "" ||
    filterStatus !== "all" ||
    filterTimeframe !== "all" ||
    searchQuery.trim() !== "";

  // Dynamic category tabs data (Small when inactive, expanded with info when active)
  const categoryTabs = useMemo(() => [
    {
      id: "all" as ActivityCategory,
      label: "All Activity",
      Icon: IconActivity,
      count: metrics.totalEvents,
      additionalInfo: "Complete immutable audit trail",
    },
    {
      id: "auth" as ActivityCategory,
      label: "Security & Auth",
      Icon: IconLogin,
      count: metrics.authCount,
      additionalInfo: "Logins & verified session tokens",
    },
    {
      id: "vault" as ActivityCategory,
      label: "Health Vault",
      Icon: IconLockShield,
      count: metrics.vaultCount,
      additionalInfo: "AES-256 encrypted reads & writes",
    },
    {
      id: "chat" as ActivityCategory,
      label: "AI Consultations",
      Icon: IconConsultation,
      count: metrics.chatCount,
      additionalInfo: "Context-grounded clinical chats",
    },
    {
      id: "search" as ActivityCategory,
      label: "Diagnostic Search",
      Icon: IconSearch,
      count: metrics.searchCount,
      additionalInfo: "Differential symptom rank queries",
    },
  ], [metrics]);

  // Export audit trail to CSV
  const handleExportCSV = () => {
    setIsExporting(true);
    try {
      const headers = [
        "Event ID",
        "Action Code",
        "Action Name",
        "Category",
        "Resource Table",
        "Resource ID",
        "Status",
        "Timestamp (ISO)",
        "Timestamp (Local)",
      ];

      const rows = filteredEntries.map((e) => {
        const meta = getActionMeta(e.action);
        const parsed = parseEntryTime(e.timestamp);
        return [
          e.id,
          `"${e.action}"`,
          `"${meta.label}"`,
          `"${meta.categoryLabel}"`,
          `"${e.target_table || "system"}"`,
          e.target_id ?? "",
          e.success ? "SUCCESS" : "FAILED",
          `"${e.timestamp}"`,
          `"${parsed ? parsed.toLocaleString() : ""}"`,
        ].join(",");
      });

      const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `medseek-activity-ledger-${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      /* ignore */
    } finally {
      setIsExporting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 sm:py-8 animate-fade-in">
      {/* ─── 1. Header Bar with Security Shield & Actions ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-[#e2dcd0]/80">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <div className="w-8 h-8 rounded-xl glass-chip flex items-center justify-center text-[#3a5ebb] shrink-0 shadow-2xs">
              <IconActivity size={18} />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Security & Activity Ledger
            </h1>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 ml-1">
              <IconShieldCheck size={12} className="text-emerald-600" />
              <span>Cryptographically Logged</span>
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500">
            Immutable patient access log documenting authentications, encrypted vault changes, and AI diagnostic interactions.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          <button
            onClick={loadLog}
            disabled={isLoading}
            className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5"
            title="Refresh Ledger"
          >
            <IconRefresh size={14} className={isLoading ? "animate-spin text-[#3a5ebb]" : "text-slate-600"} />
            <span className="hidden xs:inline">Refresh</span>
          </button>

          <button
            onClick={handleExportCSV}
            disabled={filteredEntries.length === 0 || isExporting}
            className="btn-3d-primary px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5"
            title="Download CSV for personal archive or medical record compliance"
          >
            <IconDownload size={14} />
            <span>Export Trail</span>
          </button>
        </div>
      </div>

      {/* ─── 2. Unified Dynamic Category Tabs (Horizontal pills when inactive, expands to rich card when selected) ─── */}
      <div className="mb-6">
        <div className="p-2 sm:p-2.5 rounded-2xl glass-panel shadow-2xs">
          <div className="flex items-center gap-2.5 sm:gap-3 overflow-x-auto pb-1 pt-0.5 scrollbar-none no-scrollbar">
            {categoryTabs.map((tab) => {
              const isSelected = activeCategory === tab.id;
              const { Icon } = tab;

              // State A: Selected and Expanded -> Rich KPI-style Card ("what we have right now")
              if (isSelected && isTabExpanded) {
                return (
                  <button
                    key={tab.id}
                    onClick={(e) => {
                      setIsTabExpanded(false);
                      e.currentTarget.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
                    }}
                    className="relative flex flex-col justify-between p-4 sm:p-4.5 rounded-2xl border-2 border-[#2e4d9c] bg-[#3a5ebb] text-white shadow-[0_4px_20px_rgba(58,94,187,0.32)] transition-all duration-300 text-left shrink-0 min-w-[280px] sm:min-w-[320px] ring-2 ring-[#3a5ebb]/20 cursor-pointer select-none animate-scale-in"
                    title="Click to collapse into compact tab"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-[#2a4693] text-white flex items-center justify-center shrink-0 shadow-2xs">
                          <Icon size={15} />
                        </div>
                        <span className="text-xs sm:text-sm font-bold text-white tracking-tight truncate">
                          {tab.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-[#2a4693] text-blue-100 px-2.5 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Active
                        </span>
                        <span className="w-5 h-5 rounded-full bg-[#2a4693]/80 hover:bg-[#1e336d] text-blue-200 hover:text-white flex items-center justify-center transition-colors">
                          <IconChevronUp size={13} />
                        </span>
                      </div>
                    </div>

                    <div className="my-1">
                      <div className="text-3xl sm:text-4xl font-black tracking-tight text-white tabular-nums drop-shadow-xs">
                        {tab.count}
                      </div>
                    </div>

                    <div className="text-[11px] sm:text-xs text-blue-100 font-medium truncate mt-0.5 flex items-center gap-1.5">
                      <span>{tab.additionalInfo}</span>
                    </div>
                  </button>
                );
              }

              // State B: Selected but collapsed -> Sleek active blue horizontal capsule pill
              if (isSelected && !isTabExpanded) {
                return (
                  <button
                    key={tab.id}
                    onClick={(e) => {
                      setIsTabExpanded(true);
                      e.currentTarget.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
                    }}
                    className="group inline-flex items-center justify-between gap-3 px-5 py-2.5 sm:px-6 sm:py-3 rounded-full border-2 border-[#2e4d9c] bg-[#3a5ebb] text-white shadow-[0_2px_10px_rgba(58,94,187,0.35)] transition-all duration-200 shrink-0 min-w-[170px] sm:min-w-[200px] h-10 sm:h-11 cursor-pointer select-none hover:bg-[#3253a6]"
                    title="Click to expand metric card"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                      <span className="text-xs sm:text-[13px] font-bold text-white tracking-tight truncate">
                        {tab.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#2a4693] text-white border border-[#4d6ec5] tabular-nums">
                        {tab.count}
                      </span>
                      <IconChevronDown size={13} className="text-blue-200 group-hover:text-white transition-colors" />
                    </div>
                  </button>
                );
              }

              // State C: Inactive tabs -> Horizontal glass pills
              return (
                <button
                  key={tab.id}
                  onClick={(e) => {
                    setActiveCategory(tab.id);
                    setIsTabExpanded(true);
                    setFilterAction("");
                    setPage(0);
                    e.currentTarget.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
                  }}
                  className="group inline-flex items-center justify-between gap-3 px-5 py-2.5 sm:px-6 sm:py-3 rounded-full border border-[#e2dcd0]/80 bg-white/70 backdrop-blur-xs text-slate-700 shadow-2xs hover:border-[#3a5ebb]/40 hover:bg-white/95 hover:text-slate-900 hover:shadow-xs hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 shrink-0 min-w-[170px] sm:min-w-[200px] h-10 sm:h-11 cursor-pointer select-none"
                  title={`Filter by ${tab.label} and expand`}
                >
                  <span className="text-xs sm:text-[13px] font-semibold text-slate-700 group-hover:text-slate-900 tracking-tight whitespace-nowrap">
                    {tab.label}
                  </span>
                  <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-full bg-white/80 text-slate-600 border border-slate-200/80 group-hover:bg-blue-50 group-hover:text-[#3a5ebb] group-hover:border-[#3a5ebb]/30 transition-colors tabular-nums shrink-0">
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ─── 4. Search & Filter Controls Toolbar ─── */}
      <div className="glass-panel rounded-2xl p-3.5 sm:p-4 mb-6 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 items-center">
          {/* Search Input */}
          <div className="lg:col-span-4 relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <IconSearch size={14} />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by action, keyword, ID..."
              className="w-full pl-9 pr-8 py-1.5 rounded-lg border border-slate-300/80 bg-white/80 backdrop-blur-xs text-slate-900 text-xs focus:outline-none focus:border-[#3a5ebb] focus:ring-2 focus:ring-[#3a5ebb]/15 placeholder:text-slate-400 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600"
              >
                <IconClose size={14} />
              </button>
            )}
          </div>

          {/* Action Sub-Filter */}
          <div className="lg:col-span-3">
            <select
              value={filterAction}
              onChange={(e) => {
                setFilterAction(e.target.value);
                setPage(0);
              }}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-xs focus:outline-none focus:border-blue-600"
            >
              <option value="">All Action Types</option>
              {actions
                .filter((a) => {
                  if (activeCategory === "all") return true;
                  return getActionMeta(a).category === activeCategory;
                })
                .map((a) => (
                  <option key={a} value={a}>
                    {ACTION_METAS[a]?.label ?? a}
                  </option>
                ))}
            </select>
          </div>

          {/* Outcome Status Filter */}
          <div className="lg:col-span-2">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as "all" | "success" | "failed")}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-xs focus:outline-none focus:border-blue-600"
            >
              <option value="all">All Outcomes</option>
              <option value="success">Success Only</option>
              <option value="failed">Failed / Flagged</option>
            </select>
          </div>

          {/* Timeframe Selector */}
          <div className="lg:col-span-3">
            <select
              value={filterTimeframe}
              onChange={(e) => {
                setFilterTimeframe(e.target.value as "all" | "today" | "7d" | "30d");
                setPage(0);
              }}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-xs focus:outline-none focus:border-blue-600"
            >
              <option value="all">Timeframe: All Time</option>
              <option value="today">Today Only</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
          </div>
        </div>

        {/* Active Filter Chips & Summary */}
        {hasActiveFilters && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
                <IconFilter size={12} />
                <span>Filters:</span>
              </span>

              {activeCategory !== "all" && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-blue-50 text-blue-700 border border-blue-200">
                  Category: {activeCategory}
                  <button onClick={() => setActiveCategory("all")} className="hover:text-blue-900">
                    <IconClose size={10} />
                  </button>
                </span>
              )}

              {filterAction && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-slate-100 text-slate-700 border border-slate-200">
                  Action: {ACTION_METAS[filterAction]?.label ?? filterAction}
                  <button onClick={() => setFilterAction("")} className="hover:text-slate-900">
                    <IconClose size={10} />
                  </button>
                </span>
              )}

              {filterStatus !== "all" && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-slate-100 text-slate-700 border border-slate-200">
                  Status: {filterStatus}
                  <button onClick={() => setFilterStatus("all")} className="hover:text-slate-900">
                    <IconClose size={10} />
                  </button>
                </span>
              )}

              {filterTimeframe !== "all" && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-slate-100 text-slate-700 border border-slate-200">
                  Time: {filterTimeframe}
                  <button onClick={() => setFilterTimeframe("all")} className="hover:text-slate-900">
                    <IconClose size={10} />
                  </button>
                </span>
              )}

              {searchQuery && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-slate-100 text-slate-700 border border-slate-200">
                  Search: &quot;{searchQuery}&quot;
                  <button onClick={() => setSearchQuery("")} className="hover:text-slate-900">
                    <IconClose size={10} />
                  </button>
                </span>
              )}
            </div>

            <button
              onClick={handleResetFilters}
              className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 transition-colors"
            >
              Reset all filters
            </button>
          </div>
        )}
      </div>

      {/* ─── 5. Timeline with Temporal Date Groups ─── */}
      <div className="relative">
        {isLoading ? (
          // Loading Skeleton
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 bg-slate-200 rounded w-1/3" />
                    <div className="h-2.5 bg-slate-100 rounded w-1/4" />
                  </div>
                  <div className="w-16 h-3 bg-slate-200 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredEntries.length === 0 ? (
          // Empty State
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400">
              <IconActivity size={24} />
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-1">
              No matching activity events found
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mb-4">
              {hasActiveFilters
                ? "No audit records matched your current combination of filters, categories, and search keywords."
                : "Your account has no recorded audit log entries yet. New authentications and vault operations will appear here."}
            </p>
            {hasActiveFilters && (
              <button
                onClick={handleResetFilters}
                className="btn-3d-primary px-4 py-1.5 rounded-lg text-xs"
              >
                Clear All Filters
              </button>
            )}
          </div>
        ) : (
          // Render Temporal Groups
          <div className="space-y-6">
            {dateGroups.map((group) => (
              <div key={group.id} className="relative">
                {/* Sticky Section Header */}
                <div className="flex items-center justify-between mb-3 sticky top-16 z-20 bg-slate-50/90 backdrop-blur-sm py-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-600" />
                    <h2 className="text-xs sm:text-sm font-bold tracking-tight text-slate-900">
                      {group.label}
                    </h2>
                    {group.dateStr && (
                      <span className="text-[11px] text-slate-400 font-medium">
                        • {group.dateStr}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                    {group.entries.length} {group.entries.length === 1 ? "event" : "events"}
                  </span>
                </div>

                {/* Timeline Cards */}
                <div className="relative pl-3 sm:pl-4 space-y-2 border-l-2 border-slate-200 ml-1">
                  {group.entries.map((entry) => {
                    const meta = getActionMeta(entry.action);
                    const { Icon } = meta;
                    const parsed = parseEntryTime(entry.timestamp);

                    return (
                      <div
                        key={entry.id}
                        onClick={() => setSelectedEntry(entry)}
                        className="group relative glass-card rounded-2xl p-3.5 sm:p-4 hover:border-[#3a5ebb]/40 transition-all cursor-pointer select-none"
                      >
                        <div className="flex items-start justify-between gap-3">
                          {/* Left: Action Icon + Details */}
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <div
                              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                                entry.success
                                  ? `${meta.iconBg} ${meta.iconText}`
                                  : "bg-red-50 text-red-700 border-red-200"
                              }`}
                            >
                              <Icon size={16} />
                            </div>

                            <div className="min-w-0 flex-1">
                              {/* Top Line: Title + Success Badge */}
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                                  {meta.label}
                                </span>

                                {entry.success ? (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded font-medium border border-emerald-200">
                                    <IconCheck size={11} />
                                    <span>Success</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-red-700 bg-red-50 px-1.5 py-0.2 rounded border border-red-200">
                                    <IconWarning size={10} />
                                    <span>Failed Attempt</span>
                                  </span>
                                )}
                              </div>

                              {/* Description / Explanation */}
                              <p className="text-[11px] text-slate-500 line-clamp-1 mb-1.5">
                                {meta.explanation}
                              </p>

                              {/* Target Tag & Category Monospace Pill */}
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                  {entry.action}
                                </span>

                                {entry.target_table && (
                                  <span className="text-[10px] text-slate-500 font-mono">
                                    resource: <span className="font-semibold text-slate-700">{entry.target_table}</span>
                                    {entry.target_id ? ` #${entry.target_id}` : ""}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Right: Timestamp & Drill-in Hint */}
                          <div className="text-right shrink-0 flex flex-col items-end justify-between self-stretch">
                            <div>
                              <p className="text-xs font-semibold text-slate-700 tabular-nums">
                                {relativeTime(entry.timestamp)}
                              </p>
                              <p className="text-[10px] text-slate-400 font-mono flex items-center gap-1 justify-end mt-0.5">
                                <IconClock size={10} />
                                <span>
                                  {parsed
                                    ? parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                                    : ""}
                                </span>
                              </p>
                            </div>

                            <div className="text-[11px] text-blue-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 mt-2">
                              <span>Inspect</span>
                              <IconChevronRight size={12} />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── 6. Pagination Controls & Items Density ─── */}
      <div className="mt-8 pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span>
            Showing <strong className="text-slate-900">{filteredEntries.length}</strong> of{" "}
            <strong className="text-slate-900">{total}</strong> events
          </span>

          <div className="hidden sm:flex items-center gap-1.5 border-l border-slate-200 pl-3">
            <span>Per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(0);
              }}
              className="px-2 py-0.5 rounded border border-slate-200 bg-white text-slate-700 text-xs focus:outline-none"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || isLoading}
              className="btn-3d-secondary px-3.5 py-1.5 rounded-lg text-xs font-medium"
            >
              Previous
            </button>
            <span className="text-xs font-medium text-slate-600 tabular-nums px-2">
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1 || isLoading}
              className="btn-3d-secondary px-3.5 py-1.5 rounded-lg text-xs font-medium"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* ─── 7. Interactive Forensic Detail Modal (Mobile Drawer / Desktop Dialog) ─── */}
      {selectedEntry && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-stone-950/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-slide-up max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
                  <IconShieldCheck size={18} />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900">
                    Audit Event Forensic Record
                  </h3>
                  <p className="text-[11px] text-slate-500 font-mono">
                    Entry Reference #LOG-{selectedEntry.id}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedEntry(null)}
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 flex items-center justify-center transition-colors"
              >
                <IconClose size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
              {/* Event Status Banner */}
              <div
                className={`p-3 rounded-xl border flex items-center gap-3 ${
                  selectedEntry.success
                    ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                    : "bg-red-50 border-red-200 text-red-900"
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-white shrink-0 ${
                    selectedEntry.success ? "bg-emerald-600" : "bg-red-600"
                  }`}
                >
                  {selectedEntry.success ? <IconCheck size={14} /> : <IconWarning size={14} />}
                </div>
                <div>
                  <div className="text-xs font-bold">
                    {selectedEntry.success ? "Action Successfully Authenticated & Executed" : "Security Access Rejected or Error"}
                  </div>
                  <div className="text-[11px] text-slate-600">
                    {getActionMeta(selectedEntry.action).explanation}
                  </div>
                </div>
              </div>

              {/* Metadata Key-Value Grid */}
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 sm:p-4 space-y-2.5">
                <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-200/60">
                  <span className="text-slate-500 font-medium">Action Key</span>
                  <span className="font-mono font-semibold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                    {selectedEntry.action}
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-200/60">
                  <span className="text-slate-500 font-medium">Domain Category</span>
                  <span className="font-semibold text-slate-800">
                    {getActionMeta(selectedEntry.action).categoryLabel}
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-200/60">
                  <span className="text-slate-500 font-medium">Affected Database Resource</span>
                  <span className="font-mono text-slate-800">
                    {selectedEntry.target_table || "system / gateway"}
                  </span>
                </div>

                {selectedEntry.target_id && (
                  <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-200/60">
                    <span className="text-slate-500 font-medium">Target Record ID</span>
                    <span className="font-mono font-semibold text-blue-600">
                      #{selectedEntry.target_id}
                    </span>
                  </div>
                )}

                <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-200/60">
                  <span className="text-slate-500 font-medium">Patient Audit Ref</span>
                  <span className="font-mono text-slate-700">
                    patient_{selectedEntry.patient_id}
                  </span>
                </div>

                <div className="flex justify-between items-start text-xs pb-2 border-b border-slate-200/60">
                  <span className="text-slate-500 font-medium">Local Timestamp</span>
                  <span className="font-mono text-slate-800 text-right">
                    {parseEntryTime(selectedEntry.timestamp)?.toLocaleString() ?? selectedEntry.timestamp}
                  </span>
                </div>

                <div className="flex justify-between items-start text-xs">
                  <span className="text-slate-500 font-medium">Raw ISO Timestamp</span>
                  <span className="font-mono text-[11px] text-slate-600 text-right">
                    {selectedEntry.timestamp}
                  </span>
                </div>
              </div>

              {/* Compliance & Integrity Note */}
              <div className="p-3 rounded-lg bg-blue-50/70 border border-blue-200 text-blue-900 text-xs flex items-start gap-2.5">
                <IconLockShield size={16} className="text-blue-600 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed">
                  <strong>Patient Audit Guarantee:</strong> This entry is stored in an append-only audit trail. In accordance with personal health data standards, MedSeek automatically logs every access attempt to ensure full transparency of your medical data.
                </div>
              </div>
            </div>

            {/* Modal Footer / Navigation Shortcuts */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-2">
              <div>
                {selectedEntry.action.startsWith("vault.") && (
                  <Link
                    href="/vault"
                    className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-600"
                  >
                    Open Health Vault →
                  </Link>
                )}
                {selectedEntry.action.startsWith("chat.") && (
                  <Link
                    href="/chat"
                    className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-600"
                  >
                    Open AI Chat →
                  </Link>
                )}
                {selectedEntry.action.startsWith("search.") && (
                  <Link
                    href="/"
                    className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-600"
                  >
                    Open Search Engine →
                  </Link>
                )}
              </div>

              <button
                onClick={() => setSelectedEntry(null)}
                className="btn-3d-primary px-4 py-1.5 rounded-lg text-xs font-medium"
              >
                Close Record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ActivityPage() {
  return (
    <AuthGuard>
      <ActivityContent />
    </AuthGuard>
  );
}
