"use client";

import { useState, useEffect, FormEvent } from "react";
import Link from "next/link";
import AuthGuard from "@/components/AuthGuard";
import { getProfile, updateProfile, logout, PatientProfile } from "@/lib/auth";
import { useRouter } from "next/navigation";

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
        setError(err instanceof Error ? err.message : "Failed to load profile");
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
      setSuccess("Profile updated successfully");
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
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8 animate-fade-in">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800">
            {getGreeting()} 👋
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            {profile?.email ?? "Manage your health profile and data"}
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="self-start sm:self-auto px-4 py-2 rounded-xl text-sm font-medium text-slate-600 bg-slate-100 border border-slate-200 hover:bg-red-50 hover:text-red-700 hover:border-red-200 transition-all"
        >
          Sign out
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm animate-shake">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm animate-slide-up">
          ✓ {success}
        </div>
      )}

      {/* Quick Actions Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
        <QuickAction
          href="/"
          icon="🔍"
          label="Search"
          sublabel="Find conditions"
          delay={0}
        />
        <QuickAction
          href="/chat"
          icon="💬"
          label="AI Chat"
          sublabel="Health insights"
          delay={100}
        />
        <QuickAction
          href="/vault"
          icon="🔒"
          label="Vault"
          sublabel="Health records"
          delay={200}
        />
        <QuickAction
          href="/activity"
          icon="📊"
          label="Activity"
          sublabel="Access log"
          delay={300}
        />
      </div>

      {/* Profile Card */}
      <div className="p-4 sm:p-6 rounded-2xl bg-white border border-slate-200/80 shadow-xs animate-slide-up delay-200">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-sm">👤</span>
            Health Profile
          </h2>
          {!isEditing && profile && (
            <button
              onClick={() => setIsEditing(true)}
              className="px-4 py-1.5 rounded-lg text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200/80 transition-colors"
            >
              Edit
            </button>
          )}
        </div>

        {!profile ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
            ))}
          </div>
        ) : isEditing ? (
          <form onSubmit={handleSave} className="space-y-5 animate-fade-in">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="profile-age" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Age
                </label>
                <input
                  id="profile-age"
                  type="number"
                  min="0"
                  max="150"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="Your age"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div>
                <label htmlFor="profile-sex" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Sex
                </label>
                <select
                  id="profile-sex"
                  value={sex}
                  onChange={(e) => setSex(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  <option value="">Prefer not to say</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pregnancyStatus}
                  onChange={(e) => setPregnancyStatus(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-slate-700">
                  Currently pregnant
                </span>
              </label>
            </div>

            <div>
              <label htmlFor="profile-conditions" className="block text-sm font-medium text-slate-700 mb-1.5">
                Existing conditions
              </label>
              <textarea
                id="profile-conditions"
                value={conditions}
                onChange={(e) => setConditions(e.target.value)}
                placeholder="e.g. Diabetes, Hypertension, Asthma (comma-separated)"
                rows={3}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
              />
              <p className="mt-1 text-xs text-slate-400">
                Separate multiple conditions with commas
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={isSaving}
                className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm hover:shadow-md hover:shadow-blue-600/20 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {isSaving ? "Saving..." : "Save changes"}
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4 animate-fade-in">
            <div className="grid gap-4 sm:grid-cols-2">
              <ProfileField label="Email" value={profile.email} />
              <ProfileField label="Age" value={profile.age?.toString() ?? "Not set"} />
              <ProfileField label="Sex" value={profile.sex ? profile.sex.charAt(0).toUpperCase() + profile.sex.slice(1) : "Not set"} />
              <ProfileField
                label="Pregnancy status"
                value={profile.pregnancy_status ? "Yes" : "No"}
              />
            </div>
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Existing conditions
              </span>
              <div className="mt-2 flex flex-wrap gap-2">
                {profile.existing_conditions && profile.existing_conditions.length > 0 ? (
                  profile.existing_conditions.map((c) => (
                    <span
                      key={c}
                      className="px-3 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200/80"
                    >
                      {c}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-slate-400">
                    None recorded
                  </span>
                )}
              </div>
            </div>
            <p className="text-xs text-slate-400 pt-2">
              Member since{" "}
              {new Date(profile.created_at).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-Components ──────────────────────────────────────────────

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
        {label}
      </span>
      <p className="mt-0.5 text-sm font-semibold text-slate-800">
        {value}
      </p>
    </div>
  );
}

function QuickAction({
  href,
  icon,
  label,
  sublabel,
  delay,
}: {
  href: string;
  icon: string;
  label: string;
  sublabel: string;
  delay: number;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 p-4 rounded-2xl border border-slate-200/80 bg-white/90 hover:border-blue-300 hover:shadow-md hover:shadow-blue-500/5 hover:-translate-y-0.5 transition-all animate-slide-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className="text-2xl group-hover:scale-110 transition-transform">{icon}</span>
      <div>
        <p className="text-sm font-bold text-slate-800 group-hover:text-blue-600 transition-colors">{label}</p>
        <p className="text-xs text-slate-500">{sublabel}</p>
      </div>
    </Link>
  );
}

// ─── Page Export ──────────────────────────────────────────────────

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  );
}
