"use client";

import React, { useState, useEffect, useCallback, FormEvent } from "react";
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
import {
  IconVault,
  IconPlus,
  IconTrash,
  IconCondition,
  IconMedication,
  IconAllergy,
  IconReport,
  IconLockShield,
  IconClose,
  IconCheck,
  IconWarning,
  IconChevronRight,
  IconCalendar,
  IconTag,
  IconFileNotes,
  VaultIllustration,
} from "@/components/icons";

interface RecordTypeConfig {
  value: RecordType;
  label: string;
  sublabel: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  accentColor: string;
  badgeClass: string;
}

const RECORD_TYPES: RecordTypeConfig[] = [
  {
    value: "condition",
    label: "Conditions",
    sublabel: "Diagnoses & Chronic Status",
    Icon: IconCondition,
    accentColor: "text-blue-600 bg-blue-50 border-blue-200",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
  },
  {
    value: "medication",
    label: "Medications",
    sublabel: "Prescriptions & Dosage",
    Icon: IconMedication,
    accentColor: "text-emerald-600 bg-emerald-50 border-emerald-200",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  {
    value: "allergy",
    label: "Allergies",
    sublabel: "Immunological Sensitivities",
    Icon: IconAllergy,
    accentColor: "text-amber-600 bg-amber-50 border-amber-200",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
  },
  {
    value: "report",
    label: "Lab Reports",
    sublabel: "Diagnostic Workups & Panels",
    Icon: IconReport,
    accentColor: "text-sky-700 bg-sky-50 border-sky-200",
    badgeClass: "bg-sky-50 text-sky-800 border-sky-200",
  },
];

function getRecordConfig(type: string): RecordTypeConfig {
  const match = RECORD_TYPES.find((t) => t.value === type);
  return match || RECORD_TYPES[0];
}

function getRecordFieldIcon(key: string) {
  const lower = key.toLowerCase();
  if (lower.includes("name") || lower.includes("title") || lower.includes("condition")) {
    return IconTag;
  }
  if (lower.includes("date") || lower.includes("time")) {
    return IconCalendar;
  }
  if (lower.includes("note") || lower.includes("desc") || lower.includes("dosage")) {
    return IconFileNotes;
  }
  return IconLockShield;
}

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
      setError("Failed to retrieve encrypted health records");
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
      setError("Failed to decrypt health record");
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Permanently purge this encrypted record from your vault?")) return;
    try {
      await deleteRecord(id);
      setSelectedRecord(null);
      setSuccess("Record purged from encrypted vault");
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
      setSuccess("Health record encrypted and secured");
      setTimeout(() => setSuccess(null), 3000);
      loadRecords();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record entry");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5 sm:py-8">
      {/* Vault Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-3.5 border-b border-[#e2dcd0]/80 animate-fade-in">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-xl glass-chip flex items-center justify-center text-[#3a5ebb] shrink-0 shadow-2xs">
              <IconVault size={18} />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Patient Health Vault
            </h1>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 ml-1.5">
              <IconLockShield size={12} />
              <span>AES-256 Encrypted</span>
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Encrypted personal health record repository for conditions, medications, allergies, and lab reports.
          </p>
        </div>

        <button
          onClick={() => setShowAddForm(true)}
          className="btn-3d-primary self-start sm:self-auto px-3.5 py-1.5 rounded-lg text-xs flex items-center gap-1.5"
        >
          <IconPlus size={14} />
          <span>Add Record</span>
        </button>
      </div>

      {/* Notifications */}
      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50/90 backdrop-blur-xs border border-red-200 text-red-700 text-xs flex items-center gap-2 animate-shake">
          <IconWarning size={14} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 rounded-xl bg-emerald-50/90 backdrop-blur-xs border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 animate-slide-up">
          <IconCheck size={14} className="text-emerald-600 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Clinical Category Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 mb-5">
        <button
          onClick={() => setActiveType(undefined)}
          className={`p-3 rounded-xl border text-left transition-all ${
            !activeType
              ? "bg-[#3a5ebb] text-white border-[#2e4d9c] shadow-[0_4px_16px_rgba(58,94,187,0.3)] ring-2 ring-[#3a5ebb]/20"
              : "glass-card text-slate-700 hover:border-[#3a5ebb]/35"
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <IconVault size={16} className={!activeType ? "text-white" : "text-slate-500"} />
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${!activeType ? "bg-[#2a4693] text-blue-100" : "bg-white/80 text-slate-600 border border-slate-200/60"}`}>
              {total}
            </span>
          </div>
          <div className="text-xs font-semibold">All Records</div>
          <div className={`text-[10px] truncate ${!activeType ? "text-blue-100" : "text-slate-400"}`}>
            Full Ledger
          </div>
        </button>

        {RECORD_TYPES.map((t) => {
          const { Icon } = t;
          const isSelected = activeType === t.value;
          return (
            <button
              key={t.value}
              onClick={() => setActiveType(t.value)}
              className={`p-3 rounded-xl border text-left transition-all ${
                isSelected
                  ? "bg-[#3a5ebb] text-white border-[#2e4d9c] shadow-[0_4px_16px_rgba(58,94,187,0.3)] ring-2 ring-[#3a5ebb]/20"
                  : "glass-card text-slate-700 hover:border-[#3a5ebb]/35"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <Icon size={16} className={isSelected ? "text-white" : t.accentColor.split(" ")[0]} />
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${isSelected ? "bg-[#2a4693] text-blue-100" : "bg-white/80 text-slate-600 border border-slate-200/60"}`}>
                  {records.filter(r => r.record_type === t.value).length}
                </span>
              </div>
              <div className="text-xs font-semibold">{t.label}</div>
              <div className={`text-[10px] truncate ${isSelected ? "text-blue-100" : "text-slate-400"}`}>
                {t.sublabel.split("&")[0]}
              </div>
            </button>
          );
        })}
      </div>

      {/* Record Ledger */}
      <div className="space-y-2">
        {records.map((r) => {
          const config = getRecordConfig(r.record_type);
          const { Icon } = config;
          const isSelected = selectedRecord?.id === r.id;

          return (
            <button
              key={r.id}
              onClick={() => handleViewRecord(r.id)}
              className={`w-full text-left p-3 rounded-lg border transition-all ${
                isSelected
                  ? "border-blue-500 bg-blue-50/40 shadow-xs"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${config.accentColor}`}>
                    <Icon size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs sm:text-sm font-semibold text-slate-900 capitalize truncate">
                        {config.label} Specification
                      </p>
                      <span className={`text-[10px] px-2 py-0.2 rounded border font-medium uppercase tracking-wider ${config.badgeClass}`}>
                        {r.record_type}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5">
                      <span className="flex items-center gap-1 font-mono">
                        <IconCalendar size={11} className="text-slate-400" />
                        <span>Modified {new Date(r.updated_at.replace(' ', 'T')).toLocaleDateString()}</span>
                      </span>
                      <span className="flex items-center gap-1 text-slate-400 font-mono text-[10px]">
                        <IconLockShield size={10} className="text-emerald-600" />
                        <span>Encrypted Hash #{r.id}</span>
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs font-semibold text-slate-400">
                  <span className="hidden sm:inline text-[11px] text-slate-500">Inspect</span>
                  <IconChevronRight size={14} className="text-slate-400" />
                </div>
              </div>
            </button>
          );
        })}

        {/* Empty State with Homegrown Vault Illustration */}
        {records.length === 0 && (
          <div className="text-center py-10 px-4 bg-white rounded-xl border border-slate-200">
            <div className="flex justify-center mb-3">
              <VaultIllustration size={64} className="text-blue-600" />
            </div>
            <h3 className="text-sm font-bold text-slate-800 mb-1">
              Encrypted Vault is Empty
            </h3>
            <p className="text-xs text-slate-500 mb-3 max-w-sm mx-auto leading-relaxed">
              No entries filed under this category. Maintain your personal health record by indexing medical conditions, prescriptions, or sensitivities.
            </p>
            <button
              onClick={() => setShowAddForm(true)}
              className="btn-3d-primary px-3.5 py-1.5 rounded-lg text-xs inline-flex items-center gap-1.5"
            >
              <IconPlus size={13} />
              <span>Record First Entry</span>
            </button>
          </div>
        )}
      </div>

      {/* Selected Record Detail Panel (EHR Monograph Style) */}
      {selectedRecord && (
        <div className="mt-5 p-4 rounded-xl bg-white border border-slate-200 shadow-xs animate-scale-in">
          <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded flex items-center justify-center border ${getRecordConfig(selectedRecord.record_type).accentColor}`}>
                {React.createElement(getRecordConfig(selectedRecord.record_type).Icon, { size: 14 })}
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 capitalize">
                  {selectedRecord.record_type} Record Specification
                </h3>
                <p className="text-[10px] text-slate-400 font-mono">
                  Vault ID #{selectedRecord.id} · Verification Signature Valid
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleDelete(selectedRecord.id)}
                className="btn-3d-danger px-2.5 py-1 rounded text-xs flex items-center gap-1"
              >
                <IconTrash size={13} />
                <span>Purge Record</span>
              </button>
              <button
                onClick={() => setSelectedRecord(null)}
                className="p-1 rounded text-slate-400 hover:text-slate-700"
                aria-label="Close detail view"
              >
                <IconClose size={15} />
              </button>
            </div>
          </div>

          {/* Structured Clinical Field Grid */}
          <div className="space-y-2">
            {Object.entries(selectedRecord.data as Record<string, unknown>).map(([key, value]) => {
              const FieldIcon = getRecordFieldIcon(key);
              return (
                <div key={key} className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 p-2.5 rounded bg-slate-50 border border-slate-100 text-xs">
                  <div className="flex items-center gap-1.5 min-w-[130px] shrink-0 text-slate-500">
                    <FieldIcon size={13} className="text-slate-400 shrink-0" />
                    <span className="font-semibold uppercase tracking-wider text-[10px]">
                      {key.replace(/_/g, " ")}
                    </span>
                  </div>
                  <span className="text-slate-900 break-all font-medium">
                    {String(value)}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 font-mono">
            <span className="flex items-center gap-1">
              <IconCalendar size={11} />
              <span>Created {new Date(selectedRecord.created_at.replace(' ', 'T')).toLocaleString()}</span>
            </span>
            <span className="flex items-center gap-1">
              <IconLockShield size={11} className="text-emerald-600" />
              <span>Updated {new Date(selectedRecord.updated_at.replace(' ', 'T')).toLocaleString()}</span>
            </span>
          </div>
        </div>
      )}

      {/* Add Record Modal with Custom Category Tiles */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/35 animate-fade-in">
          <div className="max-w-lg w-full p-4 sm:p-5 rounded-xl bg-white border border-slate-200 shadow-xl animate-scale-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3.5 pb-2.5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
                  <IconPlus size={15} />
                </div>
                <h2 className="text-sm font-bold text-slate-900">
                  Add Encrypted Health Record
                </h2>
              </div>
              <button
                onClick={() => setShowAddForm(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
                aria-label="Close modal"
              >
                <IconClose size={16} />
              </button>
            </div>

            <form onSubmit={handleAdd} className="space-y-3.5">
              {/* Category Selector Visual Grid */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Record Category
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {RECORD_TYPES.map((t) => {
                    const { Icon } = t;
                    const isChosen = newType === t.value;
                    return (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setNewType(t.value)}
                        className={`p-2.5 rounded-lg border text-left transition-all flex items-start gap-2 ${
                          isChosen
                            ? "bg-blue-50 border-blue-500 ring-1 ring-blue-400"
                            : "bg-white border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        <div className={`w-6 h-6 rounded flex items-center justify-center shrink-0 border ${t.accentColor}`}>
                          <Icon size={14} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-900">{t.label}</p>
                          <p className="text-[10px] text-slate-500 truncate">{t.sublabel}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Title / Diagnosis Input with SVG */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Title / Condition / Formulation
                </label>
                <div className="relative">
                  <div className="absolute left-2.5 top-2.5 text-slate-400">
                    <IconTag size={14} />
                  </div>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Type 2 Diabetes, Metformin 500mg, Penicillin allergy"
                    className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 placeholder:text-slate-400 text-xs focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              {/* Clinical Notes Textarea with SVG */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Clinical Details & Specifications
                </label>
                <div className="relative">
                  <div className="absolute left-2.5 top-2.5 text-slate-400">
                    <IconFileNotes size={14} />
                  </div>
                  <textarea
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    placeholder="Document dosage, intake schedule, attending physician, onset date..."
                    rows={3}
                    className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 placeholder:text-slate-400 text-xs focus:outline-none focus:border-blue-600 resize-none"
                  />
                </div>
              </div>

              {/* Cryptographic Assurance Badge */}
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center gap-2 text-[11px] text-slate-600">
                <IconLockShield size={14} className="text-emerald-600 shrink-0" />
                <span>Records are protected with client-side symmetric AES-256 encryption.</span>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="btn-3d-primary flex-1 py-2 rounded-lg text-xs flex items-center justify-center gap-1.5"
                >
                  <IconCheck size={14} />
                  <span>{isSaving ? "Encrypting & Recording..." : "Secure Record"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="btn-3d-secondary px-3.5 py-2 rounded-lg text-xs"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
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
