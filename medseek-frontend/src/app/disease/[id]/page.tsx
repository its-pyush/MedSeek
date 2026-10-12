import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDiseaseById, DiseaseDetail } from "@/lib/api";
import UrgencyBadge from "@/components/UrgencyBadge";
import {
  IconArrowLeft,
  IconWarning,
  IconCrosshair,
  IconChevronRight,
} from "@/components/icons";

interface DiseasePageProps {
  params: Promise<{ id: string }>;
}

async function fetchDisease(id: string): Promise<DiseaseDetail | null> {
  try {
    const numericId = parseInt(id, 10);
    if (isNaN(numericId) || numericId < 1) return null;

    const response = await getDiseaseById(numericId);
    return response.data;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: DiseasePageProps): Promise<Metadata> {
  const { id } = await params;
  const disease = await fetchDisease(id);

  if (!disease) {
    return { title: "Condition Not Found" };
  }

  const topSymptoms = disease.symptoms
    .slice(0, 5)
    .map((s) => s.name)
    .join(", ");

  return {
    title: `${disease.name} — Clinical Monograph`,
    description: `Clinical profile for ${disease.name}. Associated indicators: ${topSymptoms}. Triage tier: ${disease.urgency_level}.`,
  };
}

export default async function DiseasePage({ params }: DiseasePageProps) {
  const { id } = await params;
  const disease = await fetchDisease(id);

  if (!disease) {
    notFound();
  }

  const maxWeight =
    disease.symptoms.length > 0
      ? Math.max(...disease.symptoms.map((s) => s.weight))
      : 1;

  const isCritical = disease.urgency_level === "emergency" || disease.urgency_level === "high";

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5 sm:py-8">
      {/* Breadcrumb Navigation */}
      <nav className="flex items-center gap-1.5 text-xs text-slate-500 mb-4 pb-3 border-b border-[#e2dcd0]/80">
        <Link
          href="/"
          className="hover:text-[#3a5ebb] transition-colors flex items-center gap-1"
        >
          <IconArrowLeft size={12} />
          <span>Diagnostic Search</span>
        </Link>
        <IconChevronRight size={10} className="text-slate-400" />
        <span className="text-slate-800 font-semibold capitalize truncate">
          {disease.name.replace(/_/g, " ")}
        </span>
      </nav>

      {/* Disease Monograph Header */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2.5">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 capitalize tracking-tight">
            {disease.name.replace(/_/g, " ")}
          </h1>
          <div className="self-start sm:self-auto shrink-0">
            <UrgencyBadge level={disease.urgency_level} size="md" />
          </div>
        </div>

        {disease.icd11_code && (
          <p className="text-xs text-slate-500 mb-3 flex items-center gap-1.5">
            <span className="font-semibold uppercase tracking-wider text-[10px] text-slate-400">Classification:</span>
            <code className="px-2 py-0.5 rounded-md glass-chip text-[#2a4693] font-mono text-xs font-semibold">
              ICD-11 {disease.icd11_code}
            </code>
          </p>
        )}

        {disease.description && (
          <p className="text-xs sm:text-sm text-slate-700 leading-relaxed max-w-3xl glass-panel p-4 rounded-xl">
            {disease.description}
          </p>
        )}
      </div>

      {/* Urgency Clinical Alert Box */}
      {isCritical && (
        <div
          className={`mb-6 p-4 rounded-2xl border flex gap-3 backdrop-blur-md ${
            disease.urgency_level === "emergency"
              ? "bg-red-50/85 border-red-300/90 text-red-950 shadow-xs"
              : "bg-orange-50/85 border-orange-300/90 text-orange-950 shadow-xs"
          }`}
        >
          <IconWarning size={20} className={disease.urgency_level === "emergency" ? "text-red-700 shrink-0 mt-0.5" : "text-orange-700 shrink-0 mt-0.5"} />
          <div>
            <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider">
              {disease.urgency_level === "emergency"
                ? "Immediate Emergency Triage Protocol"
                : "Elevated Acuity — Physician Evaluation Required"}
            </h2>
            <p className="text-xs mt-1 leading-relaxed opacity-90">
              {disease.urgency_level === "emergency"
                ? "This clinical presentation is associated with acute, potentially life-threatening pathology. Seek urgent medical evaluation at the nearest emergency department."
                : "This condition requires professional diagnostic assessment. Schedule an examination with your healthcare provider for clinical workup."}
            </p>
          </div>
        </div>
      )}

      {/* Associated Diagnostic Indicators (Symptoms) */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2.5 pb-1.5 border-b border-[#e2dcd0]/80">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
            <IconCrosshair size={14} className="text-[#3a5ebb]" />
            <span>Associated Symptom Prevalence ({disease.symptoms.length})</span>
          </h2>
          <span className="text-[11px] text-slate-500 font-mono">
            Normalized Weight
          </span>
        </div>

        <div className="space-y-1.5">
          {disease.symptoms.map((symptom) => {
            const relativeWeight = maxWeight > 0 ? symptom.weight / maxWeight : 0;
            const percentage = Math.round(relativeWeight * 100);

            return (
              <div
                key={symptom.id}
                className="flex items-center gap-2 sm:gap-3 p-2.5 rounded-xl glass-panel"
              >
                <span className="flex-1 text-xs font-medium text-slate-800 capitalize min-w-0 truncate">
                  {symptom.name.replace(/_/g, " ")}
                </span>
                <div className="w-24 sm:w-44 h-1.5 bg-slate-200/70 rounded-full overflow-hidden shrink-0">
                  <div
                    className="h-full rounded-full bg-[#3a5ebb] shadow-[0_0_6px_rgba(58,94,187,0.35)]"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <span className="text-[11px] font-mono font-semibold text-slate-500 w-10 text-right tabular-nums shrink-0">
                  {symptom.weight.toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Back to Diagnostic Search */}
      <div className="pt-2 border-t border-[#e2dcd0]/80 flex items-center justify-between">
        <Link
          href="/"
          className="btn-3d-secondary inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs"
        >
          <IconArrowLeft size={14} />
          <span>Return to Differential Search</span>
        </Link>
      </div>

      {/* Structured Schema Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "MedicalCondition",
            name: disease.name,
            description: disease.description,
            signOrSymptom: disease.symptoms.map((s) => ({
              "@type": "MedicalSignOrSymptom",
              name: s.name,
            })),
          }),
        }}
      />
    </div>
  );
}
