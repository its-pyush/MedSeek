import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDiseaseById, DiseaseDetail } from "@/lib/api";
import UrgencyBadge from "@/components/UrgencyBadge";

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
    return { title: "Disease Not Found" };
  }

  const topSymptoms = disease.symptoms
    .slice(0, 5)
    .map((s) => s.name)
    .join(", ");

  return {
    title: `${disease.name} — Symptoms, Urgency & Details`,
    description: `Learn about ${disease.name}: common symptoms include ${topSymptoms}. Urgency level: ${disease.urgency_level}. ${disease.description || ""}`.slice(
      0,
      160
    ),
  };
}

export default async function DiseasePage({ params }: DiseasePageProps) {
  const { id } = await params;
  const disease = await fetchDisease(id);

  if (!disease) {
    notFound();
  }

  // Find the max weight for normalization
  const maxWeight =
    disease.symptoms.length > 0
      ? Math.max(...disease.symptoms.map((s) => s.weight))
      : 1;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-slate-500 mb-8">
        <Link
          href="/"
          className="hover:text-blue-600 transition-colors"
        >
          Search
        </Link>
        <svg className="w-4 h-4 text-slate-400" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
            clipRule="evenodd"
          />
        </svg>
        <span className="text-slate-800 font-semibold capitalize">
          {disease.name.replace(/_/g, " ")}
        </span>
      </nav>

      {/* Disease header */}
      <div className="mb-10">
        <div className="flex items-start gap-4 mb-4">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-800 capitalize">
            {disease.name.replace(/_/g, " ")}
          </h1>
          <UrgencyBadge level={disease.urgency_level} size="md" />
        </div>

        {disease.icd11_code && (
          <p className="text-sm text-slate-500 mb-4">
            ICD-11 Code:{" "}
            <code className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-xs border border-slate-200">
              {disease.icd11_code}
            </code>
          </p>
        )}

        {disease.description && (
          <p className="text-lg text-slate-600 leading-relaxed">
            {disease.description}
          </p>
        )}
      </div>

      {/* Urgency info card */}
      {(disease.urgency_level === "high" ||
        disease.urgency_level === "emergency") && (
        <div
          className={`mb-8 p-5 rounded-2xl border ${
            disease.urgency_level === "emergency"
              ? "bg-red-50 border-red-200"
              : "bg-orange-50 border-orange-200"
          }`}
        >
          <div className="flex gap-3">
            <svg
              className={`w-6 h-6 shrink-0 mt-0.5 ${
                disease.urgency_level === "emergency"
                  ? "text-red-600"
                  : "text-orange-600"
              }`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <div>
              <h2
                className={`text-sm font-bold ${
                  disease.urgency_level === "emergency"
                    ? "text-red-900"
                    : "text-orange-900"
                }`}
              >
                {disease.urgency_level === "emergency"
                  ? "Seek Emergency Care"
                  : "Consult a Doctor Soon"}
              </h2>
              <p
                className={`text-sm mt-1 leading-relaxed ${
                  disease.urgency_level === "emergency"
                    ? "text-red-800/80"
                    : "text-orange-800/80"
                }`}
              >
                {disease.urgency_level === "emergency"
                  ? "This condition may require immediate medical attention. If you are experiencing these symptoms, please seek emergency care or call your local emergency number."
                  : "This condition should be evaluated by a healthcare professional. Consider scheduling an appointment with your doctor."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Symptoms section */}
      <div className="mb-10">
        <h2 className="text-xl font-bold text-slate-800 mb-4">
          Associated Symptoms ({disease.symptoms.length})
        </h2>
        <div className="space-y-2">
          {disease.symptoms.map((symptom) => {
            const relativeWeight = maxWeight > 0 ? symptom.weight / maxWeight : 0;
            const percentage = Math.round(relativeWeight * 100);

            return (
              <div
                key={symptom.id}
                className="flex items-center gap-4 p-3.5 rounded-xl bg-white border border-slate-200/80 hover:border-blue-200 transition-colors"
              >
                <span className="flex-1 text-sm font-medium text-slate-800 capitalize">
                  {symptom.name.replace(/_/g, " ")}
                </span>
                <div className="w-32 sm:w-48 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-700"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <span className="text-xs font-mono text-slate-500 w-12 text-right tabular-nums">
                  {symptom.weight.toFixed(3)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Back to search */}
      <Link
        href="/"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-medium text-sm hover:bg-slate-50 hover:text-blue-600 shadow-xs transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Back to search
      </Link>

      {/* JSON-LD Structured Data for SEO */}
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
