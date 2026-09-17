"use client";

import { useState, useEffect } from "react";
import AuthGuard from "@/components/AuthGuard";
import { getAuditLog, getAuditActions, AuditEntry } from "@/lib/audit";

const ACTION_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  "auth.login": { label: "Logged in", icon: "🔑", color: "indigo" },
  "auth.signup": { label: "Account created", icon: "👤", color: "emerald" },
  "auth.refresh": { label: "Token refreshed", icon: "🔄", color: "zinc" },
  "auth.me": { label: "Viewed account", icon: "👁️", color: "zinc" },
  "profile.view": { label: "Viewed profile", icon: "👤", color: "indigo" },
  "profile.update": { label: "Updated profile", icon: "✏️", color: "amber" },
  "search.query": { label: "Searched symptoms", icon: "🔍", color: "violet" },
  "chat.message": { label: "Sent chat message", icon: "💬", color: "violet" },
  "chat.view": { label: "Viewed chat session", icon: "👁️", color: "indigo" },
  "vault.read": { label: "Viewed health record", icon: "📖", color: "emerald" },
  "vault.create": { label: "Added health record", icon: "➕", color: "emerald" },
  "vault.update": { label: "Updated health record", icon: "✏️", color: "amber" },
  "vault.delete": { label: "Deleted health record", icon: "🗑️", color: "red" },
  "audit.view": { label: "Viewed activity log", icon: "📊", color: "zinc" },
};

function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "Unknown";
  // Fix Safari parsing if space is used instead of T
  const normalizedDate = dateStr.replace(' ', 'T');
  const then = new Date(normalizedDate).getTime();
  if (isNaN(then)) return "Invalid Date";

  const now = Date.now();
  const diff = Math.max(0, now - then);
  const minutes = Math.floor(diff / 60000);
  
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(normalizedDate).toLocaleDateString();
}

function ActivityContent() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [actions, setActions] = useState<string[]>([]);
  const [filterAction, setFilterAction] = useState<string>("");
  const [page, setPage] = useState(0);
  const limit = 25;

  useEffect(() => {
    async function loadActions() {
      try {
        const result = await getAuditActions();
        setActions(result);
      } catch { /* ignore */ }
    }
    loadActions();
  }, []);

  useEffect(() => {
    async function loadLog() {
      try {
        const result = await getAuditLog({
          action: filterAction || undefined,
          limit,
          offset: page * limit,
        });
        setEntries(result.entries);
        setTotal(result.total);
      } catch { /* ignore */ }
    }
    loadLog();
  }, [filterAction, page]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
      <div className="mb-6 sm:mb-8 animate-fade-in">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 flex items-center gap-2.5 sm:gap-3">
          <span className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-md shadow-blue-600/20 text-white shrink-0">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </span>
          Activity Log
        </h1>
        <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-slate-500">
          Your account activity and data access history
        </p>
      </div>

      {/* Filter */}
      <div className="mb-6 animate-slide-up delay-100">
        <select
          value={filterAction}
          onChange={(e) => { setFilterAction(e.target.value); setPage(0); }}
          className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
        >
          <option value="">All actions ({total})</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {ACTION_LABELS[a]?.icon ?? "📌"} {ACTION_LABELS[a]?.label ?? a}
            </option>
          ))}
        </select>
      </div>

      {/* Timeline log entries */}
      <div className="relative">
        {/* Connecting line */}
        {entries.length > 1 && (
          <div className="absolute left-[21px] sm:left-[23px] top-4 bottom-4 w-px bg-slate-200" />
        )}

        <div className="space-y-3">
          {entries.map((entry, index) => {
            const meta = ACTION_LABELS[entry.action] ?? { label: entry.action, icon: "📌", color: "slate" };
            return (
              <div
                key={entry.id}
                className="relative flex items-start gap-3 sm:gap-4 p-3.5 sm:p-4 rounded-xl bg-white border border-slate-200/80 hover:border-blue-200 hover:shadow-sm hover:-translate-y-0.5 transition-all animate-slide-up group"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {/* Icon */}
                <div className={`w-7 h-7 sm:w-[30px] sm:h-[30px] rounded-lg flex items-center justify-center text-xs sm:text-sm shrink-0 z-10 ${
                  entry.success
                    ? "bg-slate-100"
                    : "bg-red-50 text-red-600 border border-red-200"
                }`}>
                  {meta.icon}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-800">
                      {meta.label}
                    </p>
                    {!entry.success && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-50 text-red-700 border border-red-200">
                        Failed
                      </span>
                    )}
                  </div>
                  {entry.target_table && (
                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                      {entry.target_table}
                      {entry.target_id ? ` #${entry.target_id}` : ""}
                    </p>
                  )}
                </div>

                <div className="text-right shrink-0">
                  <p className="text-xs font-medium text-slate-600 tabular-nums">
                    {relativeTime(entry.timestamp)}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {entry.timestamp ? new Date(entry.timestamp.replace(' ', 'T')).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""}
                  </p>
                </div>
              </div>
            );
          })}
          {entries.length === 0 && (
            <div className="text-center py-16 animate-scale-in">
              <div className="w-20 h-20 mx-auto mb-5 rounded-2xl bg-slate-100 flex items-center justify-center">
                <span className="text-3xl">📊</span>
              </div>
              <h3 className="text-lg font-bold text-slate-700 mb-2">
                No activity recorded yet
              </h3>
              <p className="text-sm text-slate-500">
                Your data access history will appear here.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-3">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-4 py-2 rounded-xl text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:text-blue-600 disabled:opacity-40 transition-all shadow-xs"
          >
            ← Previous
          </button>
          <span className="text-sm font-medium text-slate-500 tabular-nums">
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-4 py-2 rounded-xl text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:text-blue-600 disabled:opacity-40 transition-all shadow-xs"
          >
            Next →
          </button>
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
