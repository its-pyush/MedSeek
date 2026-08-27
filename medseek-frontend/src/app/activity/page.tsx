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

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
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
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <div className="mb-8 animate-fade-in">
        <h1 className="text-3xl font-extrabold text-zinc-900 dark:text-zinc-50 flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-md shadow-indigo-500/20">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </span>
          Activity Log
        </h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400 ml-[52px]">
          Your account activity and data access history
        </p>
      </div>

      {/* Filter */}
      <div className="mb-6 animate-slide-up delay-100">
        <select
          value={filterAction}
          onChange={(e) => { setFilterAction(e.target.value); setPage(0); }}
          className="px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
          <div className="absolute left-[23px] top-4 bottom-4 w-px bg-zinc-200 dark:bg-zinc-800" />
        )}

        <div className="space-y-3">
          {entries.map((entry, index) => {
            const meta = ACTION_LABELS[entry.action] ?? { label: entry.action, icon: "📌", color: "zinc" };
            return (
              <div
                key={entry.id}
                className="relative flex items-start gap-4 p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:shadow-md hover:-translate-y-0.5 transition-all animate-slide-up group"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {/* Icon */}
                <div className={`w-[30px] h-[30px] rounded-lg flex items-center justify-center text-sm shrink-0 z-10 ${
                  entry.success
                    ? "bg-zinc-100 dark:bg-zinc-800"
                    : "bg-red-100 dark:bg-red-900/30"
                }`}>
                  {meta.icon}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {meta.label}
                    </p>
                    {!entry.success && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
                        Failed
                      </span>
                    )}
                  </div>
                  {entry.target_table && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                      {entry.target_table}
                      {entry.target_id ? ` #${entry.target_id}` : ""}
                    </p>
                  )}
                </div>

                <div className="text-right shrink-0">
                  <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                    {relativeTime(entry.timestamp)}
                  </p>
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity">
                    {new Date(entry.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>
            );
          })}
          {entries.length === 0 && (
            <div className="text-center py-16 animate-scale-in">
              <div className="w-20 h-20 mx-auto mb-5 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                <span className="text-3xl">📊</span>
              </div>
              <h3 className="text-lg font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                No activity recorded yet
              </h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
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
            className="px-4 py-2 rounded-xl text-sm font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-40 transition-all"
          >
            ← Previous
          </button>
          <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400 tabular-nums">
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-4 py-2 rounded-xl text-sm font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-40 transition-all"
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
