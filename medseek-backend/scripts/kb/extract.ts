/**
 * KB step 1 — turn the raw disease scrape into structured, MedSeek-worded records.
 *
 * For every unique disease that has a symptoms section, one LLM call produces an
 * original summary, a structured symptom list, and urgency / prevalence / sex
 * estimates. Every response is cached on disk, so re-runs cost nothing and the
 * build is repeatable.
 *
 * Usage:
 *   npm run kb:extract -- --limit 10        # pilot
 *   npm run kb:extract                      # everything (resumes from cache)
 *   npm run kb:extract -- --concurrency 6
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { spawn } from "node:child_process";
import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "..", "data");
const RAW_PATH = path.join(DATA_DIR, "mayo", "mayo_diseases.json");
export const CACHE_DIR = path.join(DATA_DIR, "kb", "cache");

/** Bump when the prompt or schema changes so stale cache entries are ignored. */
const PROMPT_VERSION = "v2";

/**
 * Extraction runs through the Claude Code CLI (`claude -p`), which uses the
 * developer's own Claude login. This is a one-off build step on a developer
 * machine; the deployed app never calls it. Override the model with KB_MODEL.
 */
const KB_MODEL = process.env.KB_MODEL ?? "haiku";

// ─── Types ───────────────────────────────────────────────────────

interface RawEntry {
  display_name: string;
  canonical_name: string;
  url: string;
  is_cross_reference: boolean;
  title: string | null;
  overview: string | null;
  symptoms: string | null;
  when_to_see_a_doctor: string | null;
  risk_factors: string | null;
}

export interface SourceDisease {
  url: string;
  name: string;
  aliases: string[];
  overview: string;
  symptoms: string;
  whenToSeeDoctor: string;
  riskFactors: string;
}

export const extractionSchema = z.object({
  summary: z.string().min(40).max(700),
  symptoms: z
    .array(
      z.object({
        name: z.string().min(2).max(60),
        frequency: z.enum(["common", "sometimes", "rare"]),
        key: z.boolean(),
      })
    )
    .min(1)
    .max(20),
  urgency: z.enum(["low", "moderate", "high", "emergency"]),
  prevalence: z.enum(["very_common", "common", "uncommon", "rare"]),
  sex: z.enum(["any", "male", "female"]),
});

export type Extraction = z.infer<typeof extractionSchema>;

export interface CachedExtraction {
  url: string;
  name: string;
  aliases: string[];
  model: string;
  promptVersion: string;
  /** "reference" = structured from scraped notes; "model" = written from model knowledge (no notes captured). */
  basis?: "reference" | "model";
  result: Extraction;
}

// ─── Source loading ──────────────────────────────────────────────

/** Dedupe the scrape by URL. Includes diseases whose page text was not captured. */
export function loadSourceDiseases(): SourceDisease[] {
  const raw: RawEntry[] = JSON.parse(fs.readFileSync(RAW_PATH, "utf-8"));
  const byUrl = new Map<string, SourceDisease>();

  for (const e of raw) {
    if (!e.url) continue;
    let d = byUrl.get(e.url);
    if (!d) {
      d = {
        url: e.url,
        name: (e.title || e.canonical_name).trim(),
        aliases: [],
        overview: e.overview ?? "",
        symptoms: e.symptoms ?? "",
        whenToSeeDoctor: e.when_to_see_a_doctor ?? "",
        riskFactors: e.risk_factors ?? "",
      };
      byUrl.set(e.url, d);
    }
    const alias = e.display_name?.trim();
    if (
      e.is_cross_reference &&
      alias &&
      alias.length <= 80 &&
      alias.toLowerCase() !== d.name.toLowerCase() &&
      !d.aliases.includes(alias)
    ) {
      d.aliases.push(alias);
    }
  }

  // Conditions the source catalogue does not list at all (see data/kb/curation.json).
  // They have no page, so they get a MedSeek-internal key and are written from model knowledge.
  const curationPath = path.join(DATA_DIR, "kb", "curation.json");
  if (fs.existsSync(curationPath)) {
    const extra: string[] = JSON.parse(fs.readFileSync(curationPath, "utf-8")).extra_conditions ?? [];
    const known = new Set([...byUrl.values()].map((d) => d.name.toLowerCase()));
    for (const name of extra) {
      if (known.has(name.toLowerCase())) continue;
      const key = `medseek:extra/${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      byUrl.set(key, { url: key, name, aliases: [], overview: "", symptoms: "", whenToSeeDoctor: "", riskFactors: "" });
    }
  }

  return [...byUrl.values()].sort((a, b) => a.url.localeCompare(b.url));
}

/** True when the scrape captured no symptom text for this disease (page layout the scraper missed). */
export function lacksReferenceText(d: SourceDisease): boolean {
  return d.symptoms.trim().length === 0;
}

export function cachePathFor(url: string): string {
  const hash = crypto.createHash("sha1").update(`${PROMPT_VERSION}|${url}`).digest("hex");
  return path.join(CACHE_DIR, `${hash}.json`);
}

// ─── Prompt ──────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You convert medical reference notes into a structured record for a symptom search engine.
Return ONE JSON object and nothing else. No markdown, no commentary.

Schema:
{
  "summary": string,      // 2-3 sentences, plain English, written entirely in your own words. Never reuse a sentence or distinctive phrase from the notes.
  "symptoms": [           // 3 to 15 items, the symptoms a patient would notice or report
    { "name": string, "frequency": "common" | "sometimes" | "rare", "key": boolean }
  ],
  "urgency": "low" | "moderate" | "high" | "emergency",
  "prevalence": "very_common" | "common" | "uncommon" | "rare",
  "sex": "any" | "male" | "female"
}

Symptom name rules:
- 1 to 4 words, lowercase, the most standard everyday term: "fever", "headache", "chest pain", "shortness of breath", "nausea", "vomiting", "fatigue", "joint pain", "skin rash", "cough", "diarrhea", "abdominal pain", "dizziness", "weight loss", "blurred vision".
- One concept per item. No severity or timing words (severe, mild, sudden, chronic), no left/right, no parentheses, no "or".
- Symptoms only. No causes, risk factors, test results or complications.
- "frequency": how often people with this condition have the symptom.
- "key": true only for symptoms that are distinctive of this condition rather than shared by many illnesses. At most 4 key symptoms.

urgency (typical case):
- emergency: needs immediate emergency care (heart attack, stroke, anaphylaxis, sepsis).
- high: should be seen by a doctor within about a day, or can become dangerous quickly.
- moderate: needs a doctor's appointment but is not time-critical.
- low: usually self-limiting or manageable with routine care.

prevalence (how often it is seen in the general population):
- very_common: almost everyone gets it or knows someone who has (common cold, tension headache, acne).
- common: seen regularly in primary care (asthma, migraine, urinary tract infection).
- uncommon: most general doctors see it occasionally.
- rare: rare disease, most people never encounter it.

sex: "male" or "female" only if the condition occurs exclusively in that sex, otherwise "any".`;

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function buildUserPrompt(d: SourceDisease): string {
  if (lacksReferenceText(d)) {
    // No notes were captured for this condition: the record is written from the
    // model's general medical knowledge and marked basis = "model".
    return [
      `Condition: ${d.name}`,
      d.overview && `Overview notes: ${clip(d.overview, 1500)}`,
      "No symptom notes are available for this condition. Use well-established, textbook-level medical knowledge only. " +
        "List the symptoms a patient typically reports. If the name is not a medical condition with symptoms, " +
        "still return the JSON with your best general description.",
    ]
      .filter(Boolean)
      .join("\n\n");
  }
  return [
    `Condition: ${d.name}`,
    d.overview && `Overview notes: ${clip(d.overview, 1500)}`,
    `Symptom notes: ${clip(d.symptoms, 5000)}`,
    d.whenToSeeDoctor && `When to seek care: ${clip(d.whenToSeeDoctor, 1500)}`,
    d.riskFactors && `Risk factors: ${clip(d.riskFactors, 800)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Pull the JSON object out of a model reply that may contain reasoning or code fences. */
export function parseModelJson(text: string): unknown {
  const cleaned = text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/gi, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in reply");
  return JSON.parse(cleaned.slice(start, end + 1));
}

// ─── Extraction ──────────────────────────────────────────────────

/** Run one prompt through `claude -p` and return the model's text reply. */
export function runClaude(
  systemPrompt: string,
  userPrompt: string,
  model: string = KB_MODEL,
  timeoutMs = 120_000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "claude",
      [
        "-p",
        "--model", model,
        "--system-prompt", systemPrompt,
        "--tools", "",
        "--output-format", "json",
        "--no-session-persistence",
      ],
      { cwd: os.tmpdir(), stdio: ["pipe", "pipe", "pipe"] }
    );

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);

    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      try {
        const envelope = JSON.parse(stdout) as { is_error?: boolean; result?: string };
        if (envelope.is_error || typeof envelope.result !== "string") {
          throw new Error(envelope.result ?? "empty result");
        }
        resolve(envelope.result);
      } catch (err) {
        reject(new Error(`claude exited ${code}: ${(err as Error).message} ${stderr.slice(0, 200)}`));
      }
    });

    child.stdin.end(userPrompt);
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function extractOne(d: SourceDisease): Promise<Extraction> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const reply = await runClaude(SYSTEM_PROMPT, buildUserPrompt(d));
      return extractionSchema.parse(parseModelJson(reply));
    } catch (error) {
      lastError = error;
      await sleep(3000 * (attempt + 1));
    }
  }
  throw lastError;
}

async function main() {
  const args = process.argv.slice(2);
  const argValue = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const limit = argValue("--limit") ? parseInt(argValue("--limit")!, 10) : undefined;
  const concurrency = parseInt(argValue("--concurrency") ?? "4", 10);

  fs.mkdirSync(CACHE_DIR, { recursive: true });

  let diseases = loadSourceDiseases();
  console.log(`Source diseases: ${diseases.length} (${diseases.filter(lacksReferenceText).length} without captured notes)`);
  if (limit) diseases = diseases.slice(0, limit);

  const todo = diseases.filter((d) => !fs.existsSync(cachePathFor(d.url)));
  console.log(`Cached: ${diseases.length - todo.length} | to extract: ${todo.length} | model: ${KB_MODEL}`);

  let done = 0;
  const failures: { name: string; error: string }[] = [];
  let next = 0;
  let limitHit = false;

  async function worker() {
    while (next < todo.length && !limitHit) {
      const d = todo[next++];
      try {
        const result = await extractOne(d);
        const record: CachedExtraction = {
          url: d.url,
          name: d.name,
          aliases: d.aliases,
          model: KB_MODEL,
          promptVersion: PROMPT_VERSION,
          basis: lacksReferenceText(d) ? "model" : "reference",
          result,
        };
        fs.writeFileSync(cachePathFor(d.url), JSON.stringify(record, null, 2));
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 200) : String(error);
        failures.push({ name: d.name, error: message });
        // A usage limit will fail every remaining call too — stop and let a later run resume.
        if (/limit/i.test(message)) limitHit = true;
      }
      done++;
      if (done % 10 === 0 || done === todo.length) {
        console.log(`  ${done}/${todo.length} (failed: ${failures.length})`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));

  if (limitHit) console.log("\nStopped early: Claude usage limit reached. Re-run later to resume from the cache.");
  console.log(`\nDone. Attempted ${done}, failed ${failures.length}, still to do ${todo.length - done}.`);
  for (const f of failures.slice(0, 30)) console.log(`  FAILED ${f.name}: ${f.error}`);
}

// Only run when executed directly (build.ts imports the helpers above).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
