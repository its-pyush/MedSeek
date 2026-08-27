"use client";

import { useState, useEffect, useCallback, FormEvent } from "react";
import AuthGuard from "@/components/AuthGuard";
import {
  listRecords,
  getRecord,
  createRecord,
  deleteRecord,
  RecordType,
  HealthRecord,
  HealthRecordSummary,
} from "@/lib/vault";

const RECORD_TYPES: { value: RecordType; label: string; icon: string }[] = [
  { value: "condition", label: "Conditions", icon: "🩺" },
  { value: "medication", label: "Medications", icon: "💊" },
  { value: "allergy", label: "Allergies", icon: "⚠️" },
  { value: "report", label: "Reports", icon: "📋" },
];

function VaultContent() {
  const [records, setRecords] = useState<HealthRecordSummary[]>([]);
  const [activeType, setActiveType] = useState<RecordType | undefined>();
  const [selectedRecord, setSelectedRecord] = useState<HealthRecord | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  // Add form state
  const [newType, setNewType] = useState<RecordType>("condition");
  const [newName, setNewName] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const loadRecords = useCallback(async () => {
    try {
      const result = await listRecords(activeType);
      setRecords(result.records);
      setTotal(result.total);
    } catch {
      setError("Failed to load records");
    }
  }, [activeType]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadRecords();
  }, [loadRecords]);

  async function handleViewRecord(id: number) {
    try {
      const record = await getRecord(id);
      setSelectedRecord(record);
    } catch {
      setError("Failed to load record details");
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Are you sure you want to delete this record? This cannot be undone.")) return;
    try {
      await deleteRecord(id);
      setSelectedRecord(null);
      setSuccess("Record deleted");
      setTimeout(() => setSuccess(null), 3000);
      loadRecords();
    } catch {
      setError("Failed to delete record");
    }
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      await createRecord(newType, {
        name: newName,
        notes: newNotes,
        added_at: new Date().toISOString(),
      });
      setShowAddForm(false);
      setNewName("");
      setNewNotes("");
      setSuccess("Record added successfully");
      setTimeout(() => setSuccess(null), 3000);
      loadRecords();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add record");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <div className="flex items-center justify-between mb-8 animate-fade-in">
        <div>
          <h1 className="text-3xl font-extrabold text-zinc-900 dark:text-zinc-50 flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md shadow-emerald-500/20">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
            </span>
            Health Vault
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400 ml-[52px]">
            Your encrypted health records — only you can access this data
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-semibold hover:shadow-lg hover:shadow-emerald-500/20 active:scale-[0.98] transition-all flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Record
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm animate-shake">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-6 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-sm animate-slide-up">
          ✓ {success}
        </div>
      )}

      {/* Type filter tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2 animate-slide-up delay-100">
        <button
          onClick={() => setActiveType(undefined)}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
            !activeType
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
              : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800"
          }`}
        >
          All ({total})
        </button>
        {RECORD_TYPES.map((t) => (
          <button
            key={t.value}
            onClick={() => setActiveType(t.value)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
              activeType === t.value
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Record list */}
      <div className="space-y-3">
        {records.map((r, index) => (
          <button
            key={r.id}
            onClick={() => handleViewRecord(r.id)}
            className={`w-full text-left p-4 rounded-xl border transition-all hover:shadow-md hover:-translate-y-0.5 animate-slide-up ${
              selectedRecord?.id === r.id
                ? "border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/20 shadow-sm"
                : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
            }`}
            style={{ animationDelay: `${index * 60}ms` }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xl w-10 h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                  {RECORD_TYPES.find((t) => t.value === r.record_type)?.icon ?? "📄"}
                </span>
                <div>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 capitalize">
                    {r.record_type}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Updated {new Date(r.updated_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <svg className="w-4 h-4 text-zinc-400 group-hover:text-zinc-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>
        ))}
        {records.length === 0 && (
          <div className="text-center py-16 animate-scale-in">
            <div className="w-20 h-20 mx-auto mb-5 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
              <svg className="w-10 h-10 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
              Your vault is empty
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
              Add your first health record to get started.
            </p>
            <button
              onClick={() => setShowAddForm(true)}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-semibold hover:shadow-lg hover:shadow-emerald-500/20 active:scale-[0.98] transition-all"
            >
              Add Your First Record
            </button>
          </div>
        )}
      </div>

      {/* Record detail panel */}
      {selectedRecord && (
        <div className="mt-6 p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 animate-scale-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 capitalize flex items-center gap-2">
              <span>{RECORD_TYPES.find((t) => t.value === selectedRecord.record_type)?.icon}</span>
              {selectedRecord.record_type} Details
            </h3>
            <button
              onClick={() => handleDelete(selectedRecord.id)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
            >
              Delete
            </button>
          </div>
          {/* Render data as labeled fields instead of raw JSON */}
          <div className="space-y-3">
            {Object.entries(selectedRecord.data as Record<string, unknown>).map(([key, value]) => (
              <div key={key} className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
                <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider min-w-[100px]">
                  {key.replace(/_/g, " ")}
                </span>
                <span className="text-sm text-zinc-900 dark:text-zinc-100 break-all">
                  {String(value)}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-zinc-400">
            Created {new Date(selectedRecord.created_at).toLocaleString()} · 
            Updated {new Date(selectedRecord.updated_at).toLocaleString()}
          </p>
        </div>
      )}

      {/* Add record modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="max-w-md w-full mx-4 p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl animate-scale-in">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 mb-4 flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-sm">➕</span>
              Add Health Record
            </h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Record Type
                </label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as RecordType)}
                  className="w-full px-4 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {RECORD_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.icon} {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Name
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Diabetes Type 2, Metformin, Penicillin allergy"
                  className="w-full px-4 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Notes (optional)
                </label>
                <textarea
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Additional details..."
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold text-sm hover:shadow-lg hover:shadow-emerald-500/20 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {isSaving ? "Saving..." : "Save Record"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
            <p className="mt-3 text-xs text-zinc-400 dark:text-zinc-500 text-center">
              🔒 Your data is encrypted with AES-256-GCM before storage
            </p>
          </div>
        </div>
      )}

      {/* Encryption notice */}
      <div className="mt-8 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/50 animate-slide-up delay-300">
        <div className="flex gap-3">
          <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
          </svg>
          <div>
            <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
              End-to-end encrypted
            </p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
              All records are encrypted with AES-256-GCM before storage. Only you can access your data.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VaultPage() {
  return (
    <AuthGuard>
      <VaultContent />
    </AuthGuard>
  );
}
