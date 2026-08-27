"use client";

import { useState, useEffect } from "react";
import AuthGuard from "@/components/AuthGuard";
import { getAuditLog, getAuditActions, AuditEntry } from "@/lib/audit";

const ACTION_LABELS: Record<string, string> = {
  "auth.login": "Logged in",
  "auth.signup": "Account created",
  "auth.refresh": "Token refreshed",
  "auth.me": "Viewed account info",
  "profile.view": "Viewed profile",
  "profile.update": "Updated profile",
  "search.query": "Searched symptoms",
  "chat.message": "Sent chat message",
  "chat.view": "Viewed chat session",
  "vault.read": "Viewed health record",
  "vault.create": "Added health record",
  "vault.update": "Updated health record",
  "vault.delete": "Deleted health record",
  "audit.view": "Viewed activity log",
};

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
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-zinc-900 dark:text-zinc-50">
          Activity Log
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Your account activity and data access history
        </p>
      </div>

      {/* Filter */}
      <div className="mb-6">
        <select
          value={filterAction}
          onChange={(e) => { setFilterAction(e.target.value); setPage(0); }}
          className="px-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-sm"
        >
          <option value="">All actions</option>
          {actions.map((a) => (
            <option key={a} value={a}>{ACTION_LABELS[a] ?? a}</option>
          ))}
        </select>
      </div>

      {/* Log entries */}
      <div className="space-y-2">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="flex items-center gap-4 p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
          >
            <div className={`w-2 h-2 rounded-full shrink-0 ${entry.success ? "bg-emerald-500" : "bg-red-500"}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {ACTION_LABELS[entry.action] ?? entry.action}
              </p>
              {entry.target_table && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {entry.target_table}
                  {entry.target_id ? ` #${entry.target_id}` : ""}
                </p>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {new Date(entry.timestamp).toLocaleDateString()}
              </p>
              <p className="text-xs text-zinc-400 dark:text-zinc-500">
                {new Date(entry.timestamp).toLocaleTimeString()}
              </p>
            </div>
          </div>
        ))}
        {entries.length === 0 && (
          <div className="text-center py-12">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No activity recorded yet.
            </p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 rounded-lg text-sm text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 rounded-lg text-sm text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 disabled:opacity-40"
          >
            Next
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
