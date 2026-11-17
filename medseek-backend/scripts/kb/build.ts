/**
 * KB step 2 — merge the per-disease extractions into one dataset.
 *
 *   1. Group symptom phrases that differ only by word order / plurals.
 *   2. Ask the model to merge true synonyms among the frequent phrases
 *      ("shortness of breath" = "difficulty breathing").
 *   3. Ask the model to map each rare phrase onto that vocabulary, or keep it.
 *   4. Attach lay synonyms (data/synonyms.json) and the 3D body model's ids.
 *   5. Compute idf and per-disease weights.
 *
 * Output: data/kb/medseek_kb.json (committed) + data/kb/merge_report.json.
 * All model calls are cached, so a re-run with unchanged input is free.
 *
 * Usage: npm run kb:build
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import {
  CACHE_DIR,
  CachedExtraction,
  cachePathFor,
  loadSourceDiseases,
  parseModelJson,
  runClaude,
} from "./extract.js";
import {
  Frequency,
  FREQUENCY_WEIGHT,
  areOpposites,
  cleanPhrase,
  idf,
  lexicalKey,
  linkWeight,
} from "./normalize.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.join(__dirname, "..", "..");
const KB_DIR = path.join(BACKEND_DIR, "data", "kb");
const OUT_PATH = path.join(KB_DIR, "medseek_kb.json");
const REPORT_PATH = path.join(KB_DIR, "merge_report.json");
const SYNONYMS_PATH = path.join(BACKEND_DIR, "data", "synonyms.json");
const BODY_MODEL_PATH = path.join(
  BACKEND_DIR, "..", "medseek-frontend", "src", "components", "HumanBodyModel.tsx"
);

/** A phrase must appear in at least this many diseases to seed the core vocabulary. */
const HEAD_MIN_DF = 3;
const TAIL_BATCH = 80;
const HEAD_MODEL = process.env.KB_HEAD_MODEL ?? "sonnet";
const TAIL_MODEL = process.env.KB_MODEL ?? "haiku";

// ─── Output shape ────────────────────────────────────────────────

export interface KbSymptomLink {
  name: string;
  frequency: Frequency;
  key: boolean;
  weight: number;
}

export interface KbDisease {
  name: string;
  aliases: string[];
  summary: string;
  urgency: "low" | "moderate" | "high" | "emergency";
  prevalence: "very_common" | "common" | "uncommon" | "rare";
  sex: "any" | "male" | "female";
  /** "reference": structured from a scraped page. "model": written from model knowledge, no page text. */
  basis: "reference" | "model";
  source_url: string;
  symptoms: KbSymptomLink[];
}

export interface KbSymptom {
  name: string;
  df: number;
  idf: number;
  synonyms: string[];
}

export interface KnowledgeBase {
  version: string;
  provenance: string;
  stats: Record<string, number>;
  diseases: KbDisease[];
  symptoms: KbSymptom[];
}

// ─── Cached model call ───────────────────────────────────────────

async function cachedJson<T>(
  label: string,
  system: string,
  user: string,
  model: string,
  schema: z.ZodType<T>
): Promise<T> {
  const hash = crypto.createHash("sha1").update(`${model}|${system}|${user}`).digest("hex");
  const file = path.join(CACHE_DIR, `norm-${label}-${hash}.json`);
  if (fs.existsSync(file)) {
    return schema.parse(JSON.parse(fs.readFileSync(file, "utf-8")));
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const reply = await runClaude(system, user, model, 600_000);
      const parsed = schema.parse(parseModelJson(reply));
      fs.writeFileSync(file, JSON.stringify(parsed, null, 2));
      return parsed;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function inBatches<T, R>(items: T[], size: number, concurrency: number, fn: (batch: T[], i: number) => Promise<R>): Promise<R[]> {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  const results: R[] = new Array(batches.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < batches.length) {
        const i = next++;
        results[i] = await fn(batches[i], i);
      }
    })
  );
  return results;
}

// ─── Prompts ─────────────────────────────────────────────────────

const HEAD_SYSTEM = `You maintain the symptom vocabulary of a medical symptom search engine.
You receive a list of symptom terms, one per line, as "term | number of conditions using it".
Merge terms that describe the SAME symptom a patient would report (true synonyms and trivial rewordings only).

Rules:
- Merge "shortness of breath", "difficulty breathing", "breathlessness". Merge "tiredness" with "fatigue".
- Do NOT merge a general term with a more specific one when the location or character differs:
  "pain" vs "chest pain", "rash" vs "itchy rash", "swelling" vs "leg swelling", "fever" vs "night sweats" stay separate.
- Never merge opposites (weight gain / weight loss, constipation / diarrhea, high / low).
- The canonical term is the plainest everyday wording, lowercase, and must be one of the group's members.

Return ONE JSON object and nothing else:
{"groups":[{"canonical":"<term>","members":["<term>","<term>"]}]}
Include only groups with 2 or more members. Every member must be copied exactly from the input.`;

function tailSystem(vocabulary: string[]): string {
  return `You normalise symptom phrases for a medical symptom search engine.

CANONICAL VOCABULARY (one term per line):
${vocabulary.join("\n")}

For each input phrase decide whether it means the SAME symptom as one vocabulary term.
- If yes, map it to that exact vocabulary term.
- If it is more specific, different in body location, or simply not in the vocabulary, answer "KEEP".
- Never map to an opposite (gain/loss, high/low, constipation/diarrhea).
When unsure, answer "KEEP".

Return ONE JSON object and nothing else: {"map":{"<input phrase>":"<vocabulary term or KEEP>"}}
Include every input phrase exactly as given.`;
}

const headSchema = z.object({
  groups: z.array(z.object({ canonical: z.string(), members: z.array(z.string()).min(1) })),
});
const tailSchema = z.object({ map: z.record(z.string()) });

// ─── Build ───────────────────────────────────────────────────────

function loadExtractions(): CachedExtraction[] {
  const out: CachedExtraction[] = [];
  for (const d of loadSourceDiseases()) {
    const file = cachePathFor(d.url);
    if (fs.existsSync(file)) out.push(JSON.parse(fs.readFileSync(file, "utf-8")));
  }
  return out;
}

function bodyModelIds(): string[] {
  if (!fs.existsSync(BODY_MODEL_PATH)) return [];
  const src = fs.readFileSync(BODY_MODEL_PATH, "utf-8");
  const ids = new Set<string>();
  for (const m of src.matchAll(/\{\s*id:\s*"([^"]+)"\s*,\s*name:\s*"[^"]*"\s*,\s*rank/g)) ids.add(m[1]);
  return [...ids];
}

async function main() {
  const records = loadExtractions();
  console.log(`Extractions loaded: ${records.length}`);
  if (records.length === 0) throw new Error("No extractions in cache — run kb:extract first");

  // 1. Lexical grouping ------------------------------------------------
  // lexical key → { surface form → count }, and the set of diseases using it
  const surfaceCounts = new Map<string, Map<string, number>>();
  const keyDiseases = new Map<string, Set<string>>();

  for (const r of records) {
    for (const s of r.result.symptoms) {
      const surface = cleanPhrase(s.name);
      const key = lexicalKey(s.name);
      if (!key) continue;
      if (!surfaceCounts.has(key)) surfaceCounts.set(key, new Map());
      const forms = surfaceCounts.get(key)!;
      forms.set(surface, (forms.get(surface) ?? 0) + 1);
      if (!keyDiseases.has(key)) keyDiseases.set(key, new Set());
      keyDiseases.get(key)!.add(r.url);
    }
  }

  // Representative surface form per lexical group = most frequent, ties → shortest, then alphabetical
  const repOf = new Map<string, string>();
  for (const [key, forms] of surfaceCounts) {
    const best = [...forms.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].length - b[0].length || a[0].localeCompare(b[0])
    )[0][0];
    repOf.set(key, best);
  }

  const groups = [...repOf.entries()]
    .map(([key, rep]) => ({ key, rep, df: keyDiseases.get(key)!.size }))
    .sort((a, b) => b.df - a.df || a.rep.localeCompare(b.rep));

  const head = groups.filter((g) => g.df >= HEAD_MIN_DF);
  const tail = groups.filter((g) => g.df < HEAD_MIN_DF);
  console.log(`Distinct phrases: ${groups.length} (head ${head.length}, tail ${tail.length})`);

  // 2. Merge synonyms inside the head ----------------------------------
  // canonicalOf: representative phrase → canonical symptom name
  const canonicalOf = new Map<string, string>();
  for (const g of groups) canonicalOf.set(g.rep, g.rep);

  const headReps = new Set(head.map((g) => g.rep));
  const headMerge = await cachedJson(
    "head",
    HEAD_SYSTEM,
    head.map((g) => `${g.rep} | ${g.df}`).join("\n"),
    HEAD_MODEL,
    headSchema
  );

  const rejectedMerges: { from: string; to: string; reason: string }[] = [];
  const headMerges: { canonical: string; members: string[] }[] = [];
  for (const group of headMerge.groups) {
    const canonical = cleanPhrase(group.canonical);
    if (!headReps.has(canonical)) continue;
    const accepted: string[] = [];
    for (const raw of group.members) {
      const member = cleanPhrase(raw);
      if (member === canonical || !headReps.has(member)) continue;
      if (areOpposites(member, canonical)) {
        rejectedMerges.push({ from: member, to: canonical, reason: "opposites" });
        continue;
      }
      canonicalOf.set(member, canonical);
      accepted.push(member);
    }
    if (accepted.length) headMerges.push({ canonical, members: accepted });
  }

  // Resolve chains (a → b → c)
  const resolve = (name: string): string => {
    let current = name;
    for (let i = 0; i < 5; i++) {
      const next = canonicalOf.get(current);
      if (!next || next === current) break;
      current = next;
    }
    return current;
  };

  const vocabulary = [...new Set(head.map((g) => resolve(g.rep)))].sort();
  const vocabSet = new Set(vocabulary);
  console.log(`Core vocabulary after merging: ${vocabulary.length}`);

  // 3. Map tail phrases onto the vocabulary ----------------------------
  const system = tailSystem(vocabulary);
  const mapOntoVocabulary = async (phrases: string[], label: string): Promise<Map<string, string>> => {
    const result = new Map<string, string>();
    let done = 0;
    await inBatches(phrases, TAIL_BATCH, 5, async (batch) => {
      const reply = await cachedJson(label, system, batch.join("\n"), TAIL_MODEL, tailSchema);
      for (const phrase of batch) {
        const target = cleanPhrase(reply.map[phrase] ?? "KEEP");
        if (vocabSet.has(target) && target !== phrase) {
          if (areOpposites(phrase, target)) {
            rejectedMerges.push({ from: phrase, to: target, reason: "opposites" });
          } else {
            result.set(phrase, target);
          }
        }
      }
      done += batch.length;
      console.log(`  ${label}: ${Math.min(done, phrases.length)}/${phrases.length}`);
    });
    return result;
  };

  const tailMap = await mapOntoVocabulary(tail.map((g) => g.rep), "tail");
  for (const [phrase, target] of tailMap) canonicalOf.set(phrase, target);

  // 4. Assemble symptoms and disease links -----------------------------
  const synonymsOf = new Map<string, Set<string>>();
  const addSynonym = (canonical: string, text: string) => {
    const t = text.toLowerCase().trim();
    if (!t || t === canonical) return;
    if (!synonymsOf.has(canonical)) synonymsOf.set(canonical, new Set());
    synonymsOf.get(canonical)!.add(t);
  };

  // every surface form that is not the canonical name becomes a synonym
  for (const [key, forms] of surfaceCounts) {
    const canonical = resolve(repOf.get(key)!);
    for (const surface of forms.keys()) addSynonym(canonical, surface);
  }

  const diseases: KbDisease[] = [];
  for (const r of records) {
    const links = new Map<string, { frequency: Frequency; key: boolean }>();
    for (const s of r.result.symptoms) {
      const key = lexicalKey(s.name);
      if (!key) continue;
      const canonical = resolve(repOf.get(key)!);
      const existing = links.get(canonical);
      if (!existing) {
        links.set(canonical, { frequency: s.frequency, key: s.key });
      } else {
        if (FREQUENCY_WEIGHT[s.frequency] > FREQUENCY_WEIGHT[existing.frequency]) existing.frequency = s.frequency;
        existing.key = existing.key || s.key;
      }
    }
    if (links.size === 0) continue;
    diseases.push({
      name: r.name,
      aliases: r.aliases,
      summary: r.result.summary,
      urgency: r.result.urgency,
      prevalence: r.result.prevalence,
      sex: r.result.sex,
      basis: r.basis ?? "reference",
      source_url: r.url,
      symptoms: [...links.entries()].map(([name, v]) => ({ name, frequency: v.frequency, key: v.key, weight: 0 })),
    });
  }

  // Editorial curation (data/kb/curation.json) --------------------------
  const curation = JSON.parse(fs.readFileSync(path.join(KB_DIR, "curation.json"), "utf-8"));
  const countDf = () => {
    const m = new Map<string, number>();
    for (const d of diseases) for (const s of d.symptoms) m.set(s.name, (m.get(s.name) ?? 0) + 1);
    return m;
  };

  // (a) Drop catalogue entries that are a symptom rather than a condition.
  const dfBefore = countDf();
  const droppedSymptomEntries: string[] = [];
  for (let i = diseases.length - 1; i >= 0; i--) {
    const bare = cleanPhrase(diseases[i].name);
    const canonical = resolve(repOf.get(lexicalKey(bare)) ?? bare);
    if ((dfBefore.get(canonical) ?? 0) >= curation.symptom_entry_min_df) {
      droppedSymptomEntries.push(diseases[i].name);
      diseases.splice(i, 1);
    }
  }

  // (b) Staged / recurrent cancer entries rank as rare; (c) regional prevalence.
  const rarePattern = new RegExp(curation.force_rare_name_pattern, "i");
  const regional: Record<string, string> = curation.regional_prevalence;
  let prevalenceOverrides = 0;
  for (const d of diseases) {
    const override = rarePattern.test(d.name) ? "rare" : regional[d.name];
    if (override && override !== d.prevalence && !d.name.startsWith("_")) {
      d.prevalence = override as KbDisease["prevalence"];
      prevalenceOverrides++;
    }
  }
  console.log(`Curation: dropped ${droppedSymptomEntries.length} symptom entries, ${prevalenceOverrides} prevalence overrides`);

  const df = countDf();

  const N = diseases.length;
  for (const d of diseases) {
    for (const s of d.symptoms) {
      s.weight = Number(linkWeight(s.frequency, s.key, idf(N, df.get(s.name)!)).toFixed(4));
    }
    d.symptoms.sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name));
  }

  const symptomNames = new Set(df.keys());

  // 5. Lay synonyms + 3D body model ids --------------------------------
  // Both are phrases written for the old vocabulary; map them onto the new one.
  const extraPhrases = new Map<string, string[]>(); // cleaned phrase → synonyms to attach
  if (fs.existsSync(SYNONYMS_PATH)) {
    const lay: Record<string, string[]> = JSON.parse(fs.readFileSync(SYNONYMS_PATH, "utf-8"));
    for (const [key, list] of Object.entries(lay)) {
      const phrase = cleanPhrase(key);
      extraPhrases.set(phrase, [...(extraPhrases.get(phrase) ?? []), ...list]);
    }
  }
  const bodyIds = bodyModelIds();
  for (const id of bodyIds) {
    const phrase = cleanPhrase(id);
    // keep the raw id (underscores → spaces) searchable as well
    extraPhrases.set(phrase, [...(extraPhrases.get(phrase) ?? []), id.replace(/_/g, " ")]);
  }

  // phrases that already are a symptom (or a known surface form) need no model call
  const knownSurface = new Map<string, string>();
  for (const name of symptomNames) knownSurface.set(name, name);
  for (const [canonical, set] of synonymsOf) {
    if (!symptomNames.has(canonical)) continue;
    for (const s of set) if (!knownSurface.has(s)) knownSurface.set(s, canonical);
  }

  // Hand-mapped body picker ids take priority over anything the model would guess.
  for (const [phrase, target] of Object.entries(curation.body_model_aliases as Record<string, string>)) {
    if (symptomNames.has(target)) knownSurface.set(cleanPhrase(phrase), target);
  }

  const unresolvedExtras = [...extraPhrases.keys()].filter((p) => !knownSurface.has(p)).sort();
  const extraMap = await mapOntoVocabulary(unresolvedExtras, "extras");

  let extrasAttached = 0;
  const unmappedBodyIds: string[] = [];
  for (const [phrase, list] of extraPhrases) {
    const target = knownSurface.get(phrase) ?? extraMap.get(phrase);
    if (target && symptomNames.has(target)) {
      addSynonym(target, phrase);
      for (const s of list) addSynonym(target, s);
      extrasAttached++;
    } else if (bodyIds.some((id) => cleanPhrase(id) === phrase)) {
      unmappedBodyIds.push(phrase);
    }
  }

  // A synonym must point to exactly one symptom, and must not shadow a canonical name.
  const synonymOwner = new Map<string, string>();
  const symptoms: KbSymptom[] = [...symptomNames]
    .sort((a, b) => df.get(b)! - df.get(a)! || a.localeCompare(b))
    .map((name) => {
      const synonyms = [...(synonymsOf.get(name) ?? [])]
        .filter((s) => !symptomNames.has(s) && !synonymOwner.has(s))
        .sort();
      for (const s of synonyms) synonymOwner.set(s, name);
      return { name, df: df.get(name)!, idf: Number(idf(N, df.get(name)!).toFixed(4)), synonyms };
    });

  diseases.sort((a, b) => a.name.localeCompare(b.name));

  const kb: KnowledgeBase = {
    version: "kb_v1",
    provenance:
      "Derived from public disease reference pages. Summaries, symptom lists, urgency and prevalence " +
      "were generated by a language model and are estimates, not clinical data.",
    stats: {
      diseases: diseases.length,
      diseases_model_written: diseases.filter((d) => d.basis === "model").length,
      symptoms: symptoms.length,
      links: diseases.reduce((n, d) => n + d.symptoms.length, 0),
      synonyms: symptoms.reduce((n, s) => n + s.synonyms.length, 0),
    },
    diseases,
    symptoms,
  };

  fs.mkdirSync(KB_DIR, { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(kb, null, 1));
  fs.writeFileSync(
    REPORT_PATH,
    JSON.stringify(
      {
        head_merges: headMerges,
        tail_merges: [...tailMap.entries()].map(([from, to]) => ({ from, to })),
        rejected: rejectedMerges,
        dropped_symptom_entries: droppedSymptomEntries.sort(),
        prevalence_overrides: prevalenceOverrides,
        extras_attached: extrasAttached,
        body_model_ids_unmapped: unmappedBodyIds,
      },
      null,
      1
    )
  );

  console.log("\nKnowledge base written:", OUT_PATH);
  console.log(kb.stats);
  console.log(`Head merges: ${headMerges.length} | tail merges: ${tailMap.size} | rejected: ${rejectedMerges.length}`);
  console.log(`Body model ids without a match: ${unmappedBodyIds.length}`, unmappedBodyIds);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
