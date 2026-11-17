/**
 * Ranking sanity check — NOT a clinical evaluation.
 *
 * ~40 hand-written cases in everyday language, each with the condition a
 * reasonable person would expect to see, plus a few single-symptom "alarm
 * probes". Use it to compare ranking before and after a change.
 *
 * Usage:
 *   npm run kb:check                                # against the database in .env
 *   npm run kb:check -- --api https://host          # against a running API
 */

interface Case {
  symptoms: string[];
  /** Lower-case substrings; a hit is any result whose name contains one of them. */
  expect: string[];
}

const CASES: Case[] = [
  { symptoms: ["runny nose", "sneezing", "sore throat"], expect: ["common cold"] },
  { symptoms: ["fever", "body aches", "cough", "chills"], expect: ["influenza", "flu"] },
  { symptoms: ["fever", "headache", "joint pain", "rash", "pain behind eyes"], expect: ["dengue"] },
  { symptoms: ["fever", "chills", "sweating", "headache"], expect: ["malaria"] },
  { symptoms: ["burning urination", "frequent urination", "lower abdominal pain"], expect: ["urinary tract infection", "cystitis"] },
  { symptoms: ["chest pain", "sweating", "shortness of breath", "arm pain"], expect: ["heart attack", "acute coronary"] },
  { symptoms: ["face drooping", "slurred speech", "arm weakness"], expect: ["stroke", "transient ischemic", "brain hemorrhage"] },
  { symptoms: ["excessive thirst", "frequent urination", "weight loss", "fatigue"], expect: ["diabetes"] },
  { symptoms: ["headache", "nausea", "sensitivity to light"], expect: ["migraine"] },
  { symptoms: ["wheezing", "shortness of breath", "cough", "chest tightness"], expect: ["asthma"] },
  { symptoms: ["heartburn", "regurgitation", "chest pain"], expect: ["gerd", "acid reflux", "heartburn"] },
  { symptoms: ["diarrhea", "vomiting", "stomach cramps", "fever"], expect: ["gastroenteritis", "food poisoning", "norovirus", "rotavirus"] },
  { symptoms: ["yellow skin", "dark urine", "fatigue", "abdominal pain"], expect: ["hepatitis", "jaundice"] },
  { symptoms: ["cough", "fever", "shortness of breath", "chest pain"], expect: ["pneumonia"] },
  { symptoms: ["cough", "night sweats", "weight loss", "coughing up blood"], expect: ["tuberculosis"] },
  { symptoms: ["itchy rash", "blisters", "fever"], expect: ["chickenpox", "chicken pox"] },
  { symptoms: ["fatigue", "weight gain", "feeling cold", "constipation"], expect: ["hypothyroidism"] },
  { symptoms: ["weight loss", "rapid heartbeat", "sweating", "tremor"], expect: ["hyperthyroidism", "graves"] },
  { symptoms: ["abdominal pain", "nausea", "fever", "loss of appetite"], expect: ["appendicitis", "gastroenteritis", "hepatitis"] },
  { symptoms: ["stiff neck", "fever", "headache", "sensitivity to light"], expect: ["meningitis"] },
  { symptoms: ["pimples", "blackheads"], expect: ["acne"] },
  { symptoms: ["joint pain", "joint stiffness", "joint swelling"], expect: ["arthritis"] },
  { symptoms: ["sneezing", "itchy eyes", "runny nose"], expect: ["hay fever", "allerg"] },
  { symptoms: ["sore throat", "fever", "swollen lymph nodes", "difficulty swallowing"], expect: ["strep", "tonsillitis", "mononucleosis", "sore throat", "pharyngitis"] },
  { symptoms: ["sadness", "loss of interest", "fatigue", "trouble sleeping"], expect: ["depression"] },
  { symptoms: ["fever", "abdominal pain", "headache", "constipation", "weakness"], expect: ["typhoid"] },
  { symptoms: ["itchy skin", "scaly patches", "red patches"], expect: ["psoriasis", "dermatitis", "eczema"] },
  { symptoms: ["flank pain", "blood in urine", "nausea", "painful urination"], expect: ["kidney stone"] },
  { symptoms: ["pale skin", "fatigue", "weakness", "shortness of breath", "dizziness"], expect: ["anemia"] },
  { symptoms: ["dizziness", "spinning sensation", "nausea", "loss of balance"], expect: ["vertigo", "labyrinthitis", "meniere", "vestibular"] },
  { symptoms: ["ear pain", "fever", "hearing loss"], expect: ["ear infection", "otitis"] },
  { symptoms: ["red eye", "itchy eyes", "eye discharge"], expect: ["pink eye", "conjunctivitis"] },
  { symptoms: ["hives", "swelling", "difficulty breathing", "dizziness"], expect: ["anaphylaxis", "allergy"] },
  { symptoms: ["stomach pain", "nausea", "bloating", "heartburn"], expect: ["peptic ulcer", "gastritis", "indigestion", "dyspepsia"] },
  { symptoms: ["rectal bleeding", "anal itching", "painful bowel movements"], expect: ["hemorrhoid", "hemmorhoid", "anal fissure"] },
  { symptoms: ["leg swelling", "leg pain", "warm skin"], expect: ["deep vein thrombosis", "cellulitis"] },
  { symptoms: ["worry", "restlessness", "rapid heartbeat", "trouble sleeping"], expect: ["anxiety"] },
  { symptoms: ["snoring", "daytime sleepiness", "morning headache"], expect: ["sleep apnea"] },
  { symptoms: ["loss of taste", "loss of smell", "fever", "cough"], expect: ["covid", "coronavirus"] },
  { symptoms: ["painful blisters", "burning pain", "rash"], expect: ["shingles"] },
];

/** Single vague symptoms: how alarming is the answer? */
const ALARM_PROBES = [["vomiting"], ["headache"], ["fever"], ["fatigue"], ["cough"], ["nausea"]];

interface Hit { name: string; urgency_level: string; relevance_rank?: number }

/** The service returns a page grouped by risk; the check wants relevance order back. */
const byRelevance = <T extends Hit>(hits: T[]): T[] =>
  hits.every((h) => h.relevance_rank !== undefined)
    ? [...hits].sort((a, b) => a.relevance_rank! - b.relevance_rank!)
    : hits;
interface Outcome { results: Hit[]; dontRuleOut: Hit[]; unresolved: number }

type Runner = (symptoms: string[]) => Promise<Outcome>;

async function apiRunner(base: string): Promise<Runner> {
  return async (symptoms) => {
    const res = await fetch(`${base}/api/search?symptoms=${encodeURIComponent(symptoms.join(","))}&limit=20`);
    if (!res.ok) throw new Error(`API ${res.status}`);
    const body = await res.json() as {
      data: Hit[]; dont_rule_out: Hit[]; meta: { resolved_symptoms: { match_type: string }[] };
    };
    return {
      results: byRelevance(body.data),
      dontRuleOut: body.dont_rule_out,
      unresolved: body.meta.resolved_symptoms.filter((r) => r.match_type === "none").length,
    };
  };
}

async function dbRunner(): Promise<{ run: Runner; close: () => Promise<void> }> {
  const { searchDiseases } = await import("../../src/modules/search/service.js");
  const { pool } = await import("../../src/db/index.js");
  return {
    run: async (symptoms) => {
      const r = await searchDiseases(symptoms.map((s) => s.toLowerCase()), 20, 0);
      return {
        results: byRelevance(r.results),
        dontRuleOut: r.dont_rule_out,
        unresolved: r.resolved_symptoms.filter((x) => x.match_type === "none").length,
      };
    },
    close: () => pool.end(),
  };
}

/**
 * In-memory runner over data/kb/medseek_kb.json — same resolution order and
 * score formula as the search service, so a new knowledge base can be checked
 * BEFORE it is seeded. Trigram similarity approximates Postgres pg_trgm.
 */
async function kbRunner(): Promise<Runner> {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const { PREVALENCE_PRIOR, selectDontRuleOut, groupByRisk } = await import("../../src/modules/search/service.js");
  const here = path.dirname(fileURLToPath(import.meta.url));
  const kb = JSON.parse(fs.readFileSync(path.join(here, "..", "..", "data", "kb", "medseek_kb.json"), "utf-8"));

  const trigrams = (text: string) => {
    const out = new Set<string>();
    for (const word of text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ")) {
      const padded = `  ${word} `;
      for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3));
    }
    return out;
  };
  const similarity = (a: Set<string>, b: Set<string>) => {
    let shared = 0;
    for (const t of a) if (b.has(t)) shared++;
    return shared / (a.size + b.size - shared || 1);
  };

  const idfOf = new Map<string, number>(kb.symptoms.map((s: { name: string; idf: number }) => [s.name, s.idf]));
  const exact = new Map<string, string>();
  const synonym = new Map<string, string>();
  const fuzzy: { text: Set<string>; name: string }[] = [];
  for (const s of kb.symptoms) {
    exact.set(s.name, s.name);
    fuzzy.push({ text: trigrams(s.name), name: s.name });
    for (const syn of s.synonyms) {
      synonym.set(syn, s.name);
      fuzzy.push({ text: trigrams(syn), name: s.name });
    }
  }
  const resolve = (input: string): string | null => {
    const q = input.toLowerCase();
    if (exact.has(q)) return q;
    if (synonym.has(q)) return synonym.get(q)!;
    const grams = trigrams(q);
    let best: { sim: number; name: string } | null = null;
    for (const f of fuzzy) {
      const sim = similarity(grams, f.text);
      if (sim > 0.3 && (!best || sim > best.sim)) best = { sim, name: f.name };
    }
    return best?.name ?? null;
  };

  return async (symptoms) => {
    const resolved = symptoms.map(resolve);
    const query = [...new Set(resolved.filter((r): r is string => r !== null))];
    const queryIdf = query.reduce((n, s) => n + idfOf.get(s)!, 0) || 1;

    const rows = [];
    for (const [i, d] of kb.diseases.entries()) {
      const matched = d.symptoms.filter((l: { name: string }) => query.includes(l.name));
      if (matched.length === 0) continue;
      const base = matched.reduce((n: number, l: { weight: number }) => n + l.weight, 0);
      const matchedIdf = matched.reduce((n: number, l: { name: string }) => n + idfOf.get(l.name)!, 0);
      const evidence = base * (matchedIdf / queryIdf);
      rows.push({
        id: i, name: d.name, description: null, urgency_level: d.urgency, prevalence: d.prevalence,
        evidence, score: evidence * PREVALENCE_PRIOR[d.prevalence],
        match_count: matched.length, has_key: matched.some((l: { key: boolean }) => l.key),
        matched_symptoms: matched.map((l: { name: string }) => l.name), total_symptoms: d.symptoms.length,
      });
    }
    rows.sort((a, b) => b.score - a.score || b.match_count - a.match_count || a.name.localeCompare(b.name));
    const page = rows.slice(0, 20);
    return {
      results: PRESERVE_RELEVANCE ? page : groupByRisk(page),
      dontRuleOut: selectDontRuleOut(rows, new Set(page.map((r) => r.id)), query.length),
      unresolved: resolved.filter((r) => r === null).length,
    };
  };
}

/** The check measures relevance, so it looks at the page before risk grouping. */
const PRESERVE_RELEVANCE = true;

async function main() {
  if (process.argv.includes("--kb")) {
    await report(await kbRunner());
    return;
  }
  const apiIdx = process.argv.indexOf("--api");
  let run: Runner;
  let close = async () => {};
  if (apiIdx >= 0) {
    run = await apiRunner(process.argv[apiIdx + 1].replace(/\/+$/, ""));
  } else {
    const db = await dbRunner();
    run = db.run;
    close = db.close;
  }

  await report(run);
  await close();
}

async function report(run: Runner) {
  let top1 = 0, top3 = 0, top10 = 0, unresolved = 0, totalSymptoms = 0;
  const misses: string[] = [];

  for (const c of CASES) {
    const out = await run(c.symptoms);
    const rank = out.results.findIndex((r) => c.expect.some((e) => r.name.toLowerCase().includes(e)));
    if (rank === 0) top1++;
    if (rank >= 0 && rank < 3) top3++;
    if (rank >= 0 && rank < 10) top10++;
    unresolved += out.unresolved;
    totalSymptoms += c.symptoms.length;
    if (rank < 0 || rank >= 3) {
      misses.push(`  [${rank < 0 ? "–" : rank + 1}] ${c.symptoms.join(", ")} → wanted ${c.expect[0]}; got ${out.results.slice(0, 3).map((r) => r.name).join(" | ")}`);
    }
  }

  const n = CASES.length;
  const pct = (x: number) => `${((100 * x) / n).toFixed(0)}%`;
  console.log(`\nCases: ${n}`);
  console.log(`Top-1: ${top1} (${pct(top1)})   Top-3: ${top3} (${pct(top3)})   Top-10: ${top10} (${pct(top10)})`);
  console.log(`Symptoms not recognised: ${unresolved}/${totalSymptoms}`);
  if (misses.length) console.log(`\nNot in top 3:\n${misses.join("\n")}`);

  console.log("\nAlarm probes (single vague symptom):");
  for (const probe of ALARM_PROBES) {
    const out = await run(probe);
    const top5 = out.results.slice(0, 5);
    const urgentTop5 = top5.filter((r) => r.urgency_level === "emergency" || r.urgency_level === "high").length;
    console.log(`  ${probe[0].padEnd(9)} warnings: ${String(out.dontRuleOut.length).padStart(3)} | urgent in top 5: ${urgentTop5} | top 3: ${top5.slice(0, 3).map((r) => r.name).join(" | ")}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
