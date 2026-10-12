"use client";

import React, { useState, useEffect, FormEvent } from "react";
import Link from "next/link";
import AuthGuard from "@/components/AuthGuard";
import { getProfile, updateProfile, logout, PatientProfile } from "@/lib/auth";
import { useRouter } from "next/navigation";
import {
  IconSearch,
  IconConsultation,
  IconVault,
  IconActivity,
  IconProfile,
  IconEdit,
  IconWarning,
  IconCheck,
  IconLogout,
  IconChevronRight,
} from "@/components/icons";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function DashboardContent() {
  const router = useRouter();
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Edit form state
  const [age, setAge] = useState<string>("");
  const [sex, setSex] = useState<string>("");
  const [pregnancyStatus, setPregnancyStatus] = useState(false);
  const [conditions, setConditions] = useState<string>("");

  useEffect(() => {
    async function loadProfile() {
      try {
        const p = await getProfile();
        setProfile(p);
        setAge(p.age?.toString() ?? "");
        setSex(p.sex ?? "");
        setPregnancyStatus(p.pregnancy_status ?? false);
        setConditions(p.existing_conditions?.join(", ") ?? "");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load profile record");
      }
    }
    loadProfile();
  }, []);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await updateProfile({
        age: age ? parseInt(age, 10) : null,
        sex: sex || null,
        pregnancy_status: pregnancyStatus,
        existing_conditions: conditions
          ? conditions.split(",").map((c) => c.trim()).filter(Boolean)
          : [],
      });
      setProfile(updated);
      setIsEditing(false);
      setSuccess("Patient profile record updated");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5 sm:py-8">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-3 border-b border-[#e2dcd0]/80 animate-fade-in">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            {getGreeting()}, {profile?.email?.split("@")[0] ?? "Patient"}
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Clinical dashboard & patient demographic summary
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="btn-3d-secondary self-start sm:self-auto px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5"
        >
          <IconLogout size={14} />
          <span>Sign Out</span>
        </button>
      </div>

      {/* Alerts */}
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

      {/* Clinical Workspace Hub */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 mb-5">
        <QuickAction
          href="/"
          Icon={IconSearch}
          label="Search"
          sublabel="Differential analysis"
        />
        <QuickAction
          href="/chat"
          Icon={IconConsultation}
          label="Consultation"
          sublabel="Clinical assistant"
        />
        <QuickAction
          href="/vault"
          Icon={IconVault}
          label="Health Vault"
          sublabel="Encrypted records"
        />
        <QuickAction
          href="/activity"
          Icon={IconActivity}
          label="Audit Ledger"
          sublabel="Security logs"
        />
      </div>

      {/* Profile Card */}
      <div className="p-5 sm:p-6 rounded-2xl glass-panel shadow-sm">
        <div className="flex items-center justify-between mb-4 pb-2.5 border-b border-[#e2dcd0]/80">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <IconProfile size={16} className="text-[#3a5ebb]" />
            Clinical Baseline Profile
          </h2>
          {!isEditing && profile && (
            <button
              onClick={() => setIsEditing(true)}
              className="btn-3d-secondary px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1"
            >
              <IconEdit size={12} />
              <span>Edit Details</span>
            </button>
          )}
        </div>

        {!profile ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : isEditing ? (
          <form onSubmit={handleSave} className="space-y-3.5 animate-fade-in">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="profile-age" className="block text-xs font-semibold text-slate-700 mb-1">
                  Age
                </label>
                <input
                  id="profile-age"
                  type="number"
                  min="0"
                  max="150"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="e.g. 34"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-xs focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label htmlFor="profile-sex" className="block text-xs font-semibold text-slate-700 mb-1">
                  Biological Sex
                </label>
                <select
                  id="profile-sex"
                  value={sex}
                  onChange={(e) => setSex(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-xs focus:outline-none focus:border-blue-600"
                >
                  <option value="">Undisclosed / Prefer not to say</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pregnancyStatus}
                  onChange={(e) => setPregnancyStatus(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600"
                />
                <span className="text-xs font-medium text-slate-700">
                  Currently pregnant (relevant for diagnostic contraindications)
                </span>
              </label>
            </div>

            <div>
              <label htmlFor="profile-conditions" className="block text-xs font-semibold text-slate-700 mb-1">
                Pre-existing Conditions
              </label>
              <textarea
                id="profile-conditions"
                value={conditions}
                onChange={(e) => setConditions(e.target.value)}
                placeholder="e.g. Hypertension, Type 2 Diabetes, Asthma (comma-separated)"
                rows={2}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-xs focus:outline-none focus:border-blue-600 resize-none"
              />
              <p className="mt-0.5 text-[11px] text-slate-400">
                Comma-delimited clinical terms
              </p>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={isSaving}
                className="btn-3d-primary px-4 py-1.5 rounded-lg text-xs"
              >
                {isSaving ? "Updating..." : "Save Record"}
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="btn-3d-secondary px-3.5 py-1.5 rounded-lg text-xs"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-3 animate-fade-in">
            <div className="grid gap-3 sm:grid-cols-2">
              <ProfileField label="Account Email" value={profile.email} />
              <ProfileField label="Age" value={profile.age?.toString() ?? "Unspecified"} />
              <ProfileField label="Biological Sex" value={profile.sex ? profile.sex.charAt(0).toUpperCase() + profile.sex.slice(1) : "Unspecified"} />
              <ProfileField
                label="Pregnancy Status"
                value={profile.pregnancy_status ? "Active Pregnancy" : "Not Pregnant"}
              />
            </div>

            <div>
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                Diagnosed Pre-existing Conditions
              </span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {profile.existing_conditions && profile.existing_conditions.length > 0 ? (
                  profile.existing_conditions.map((c) => (
                    <span
                      key={c}
                      className="px-2.5 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200"
                    >
                      {c}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-400">
                    None recorded on baseline file
                  </span>
                )}
              </div>
            </div>

            <p className="text-[11px] text-slate-400 pt-1 border-t border-slate-100 font-mono">
              Enrolled: {new Date(profile.created_at).toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
        {label}
      </span>
      <p className="mt-0.5 text-xs sm:text-sm font-semibold text-slate-800">
        {value}
      </p>
    </div>
  );
}

function QuickAction({
  href,
  Icon,
  label,
  sublabel,
}: {
  href: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  sublabel: string;
}) {
  return (
    <Link
      href={href}
      className="group glass-card flex items-center gap-2.5 p-3 rounded-xl text-left hover:border-[#3a5ebb]/35"
    >
      <div className="w-8 h-8 rounded-lg glass-chip text-[#3a5ebb] flex items-center justify-center shrink-0">
        <Icon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-slate-900 group-hover:text-[#3a5ebb] transition-colors truncate">
          {label}
        </p>
        <p className="text-[10px] text-slate-500 truncate">{sublabel}</p>
      </div>
      <IconChevronRight size={12} className="text-slate-400 group-hover:text-[#3a5ebb] group-hover:translate-x-0.5 transition-all shrink-0" />
    </Link>
  );
}

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  );
}
