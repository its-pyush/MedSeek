/**
 * Paper tables: ablation of the ranking formula on the 40 sanity-check cases.
 * In-memory over data/kb/medseek_kb.json (same maths as `npm run kb:check -- --kb`).
 * Run from medseek-backend:  npx tsx ../docs/paper/ablation.mts
 * NOT a clinical evaluation: the cases were written by the developers and the
 * curation was chosen while looking at them.
 */
import fs from "node:fs";
import path from "node:path";

const backend = process.cwd();
const kb = JSON.parse(fs.readFileSync(path.join(backend, "data/kb/medseek_kb.json"), "utf-8"));
const src = fs.readFileSync(path.join(backend, "scripts/kb/check-ranking.ts"), "utf-8");
const CASES: { symptoms: string[]; expect: string[] }[] = eval(src.match(/const CASES: Case\[\] = (\[[\s\S]*?\n\]);/)![1]);
const PROBES: string[][] = eval(src.match(/const ALARM_PROBES = (\[.*\]);/)![1]);

const PRIOR: Record<string, number> = { very_common: 1.0, common: 0.7, uncommon: 0.4, rare: 0.2 };
const FREQ: Record<string, number> = { common: 1.0, sometimes: 0.6, rare: 0.3 };

const trigrams = (text: string) => {
  const out = new Set<string>();
  for (const word of text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ")) {
    const p = `  ${word} `;
    for (let i = 0; i < p.length - 2; i++) out.add(p.slice(i, i + 3));
  }
  return out;
};
const sim = (a: Set<string>, b: Set<string>) => { let s = 0; for (const t of a) if (b.has(t)) s++; return s / (a.size + b.size - s || 1); };

const idfOf = new Map<string, number>(kb.symptoms.map((s: any) => [s.name, s.idf]));
const exact = new Set<string>(kb.symptoms.map((s: any) => s.name));
const synonym = new Map<string, string>();
const fuzzy: { text: Set<string>; name: string }[] = [];
for (const s of kb.symptoms) {
  fuzzy.push({ text: trigrams(s.name), name: s.name });
  for (const syn of s.synonyms) { synonym.set(syn, s.name); fuzzy.push({ text: trigrams(syn), name: s.name }); }
}
const how = { exact: 0, synonym: 0, fuzzy: 0, none: 0 };
const resolve = (input: string, count = false): string | null => {
  const q = input.toLowerCase();
  if (exact.has(q)) { if (count) how.exact++; return q; }
  if (synonym.has(q)) { if (count) how.synonym++; return synonym.get(q)!; }
  const g = trigrams(q);
  let best: { s: number; name: string } | null = null;
  for (const f of fuzzy) { const s = sim(g, f.text); if (s > 0.3 && (!best || s > best.s)) best = { s, name: f.name }; }
  if (count) how[best ? "fuzzy" : "none"]++;
  return best?.name ?? null;
};

interface Variant { label: string; weight: (l: any) => number; coverage: boolean; prior: boolean }
const VARIANTS: Variant[] = [
  { label: "Match count only", weight: () => 1, coverage: false, prior: false },
  { label: "Weights only", weight: (l) => l.weight, coverage: false, prior: false },
  { label: "Weights + coverage", weight: (l) => l.weight, coverage: true, prior: false },
  { label: "Weights + prior", weight: (l) => l.weight, coverage: false, prior: true },
  { label: "Full (deployed)", weight: (l) => l.weight, coverage: true, prior: true },
  { label: "Full, no key boost", weight: (l) => FREQ[l.frequency] * idfOf.get(l.name)!, coverage: true, prior: true },
  { label: "Full, no idf in weight", weight: (l) => FREQ[l.frequency] * (l.key ? 1.25 : 1), coverage: true, prior: true },
];

function rank(symptoms: string[], v: Variant) {
  const q = [...new Set(symptoms.map((s) => resolve(s)).filter((r): r is string => r !== null))];
  const qIdf = q.reduce((n, s) => n + idfOf.get(s)!, 0) || 1;
  const rows: any[] = [];
  for (const d of kb.diseases) {
    const m = d.symptoms.filter((l: any) => q.includes(l.name));
    if (!m.length) continue;
    const base = m.reduce((n: number, l: any) => n + v.weight(l), 0);
    const cov = v.coverage ? m.reduce((n: number, l: any) => n + idfOf.get(l.name)!, 0) / qIdf : 1;
    const evidence = base * cov;
    rows.push({ name: d.name, urgency: d.urgency, evidence, score: evidence * (v.prior ? PRIOR[d.prevalence] : 1), n: m.length, key: m.some((l: any) => l.key) });
  }
  rows.sort((a, b) => b.score - a.score || b.n - a.n || a.name.localeCompare(b.name));
  return { rows, q };
}

const wilson = (k: number, n: number) => {
  const z = 1.96, p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return `${(100 * (c - h) / d).toFixed(0)}-${(100 * (c + h) / d).toFixed(0)}`;
};

for (const c of CASES) for (const s of c.symptoms) resolve(s, true);
console.log("Symptom resolution over", CASES.reduce((n, c) => n + c.symptoms.length, 0), "entered symptoms:", how);
console.log("Symptoms per case:", Math.min(...CASES.map(c => c.symptoms.length)), "-", Math.max(...CASES.map(c => c.symptoms.length)));

console.log("\nvariant | top1 | top3 | top10 | MRR | wilson top1 | wilson top3 | urgent in top5 over 6 probes");
const firstPlace = new Map<string, boolean[]>();
for (const v of VARIANTS) {
  let t1 = 0, t3 = 0, t10 = 0, mrr = 0;
  const hits: boolean[] = [];
  for (const c of CASES) {
    const r = rank(c.symptoms, v).rows.findIndex((x) => c.expect.some((e) => x.name.toLowerCase().includes(e)));
    hits.push(r === 0);
    if (r === 0) t1++; if (r >= 0 && r < 3) t3++; if (r >= 0 && r < 10) t10++; if (r >= 0) mrr += 1 / (r + 1);
  }
  firstPlace.set(v.label, hits);
  let urgent = 0;
  for (const p of PROBES) urgent += rank(p, v).rows.slice(0, 5).filter((x) => x.urgency === "high" || x.urgency === "emergency").length;
  console.log(`${v.label.padEnd(24)} | ${t1} | ${t3} | ${t10} | ${(mrr / CASES.length).toFixed(3)} | ${wilson(t1, 40)} | ${wilson(t3, 40)} | ${urgent}/30`);
}

// Exact two-sided McNemar (binomial) test on first-place hits, each variant vs the deployed formula.
const choose = (n: number, k: number) => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r; };
console.log("\nFirst place, variant vs deployed: only variant right | only deployed right | exact McNemar p");
const ref = firstPlace.get("Full (deployed)")!;
for (const [label, hits] of firstPlace) {
  if (label === "Full (deployed)") continue;
  let b = 0, c = 0;
  hits.forEach((h, i) => { if (h && !ref[i]) b++; if (!h && ref[i]) c++; });
  const n = b + c; let tail = 0;
  for (let i = 0; i <= Math.min(b, c); i++) tail += choose(n, i) / 2 ** n;
  console.log(`${label.padEnd(24)} | ${b} | ${c} | ${n === 0 ? "1.000" : Math.min(1, 2 * tail).toFixed(3)}`);
}

console.log("\nProbes, deployed formula: symptom | candidates | urgent in top 5 | warnings");
const full = VARIANTS[4];
for (const p of PROBES) {
  const { rows, q } = rank(p, full);
  const page = new Set(rows.slice(0, 20).map((r) => r.name));
  const warn = rows.filter((r) => !page.has(r.name) && (r.urgency === "high" || r.urgency === "emergency") && (q.length <= 1 ? r.key : r.n >= 2))
    .sort((a, b) => b.evidence - a.evidence).slice(0, 3);
  console.log(`${p[0]} | ${rows.length} | ${rows.slice(0, 5).filter((x) => x.urgency === "high" || x.urgency === "emergency").length} | ${warn.length}`);
}

// Worked example used in Section V of the paper.
{
  const q = ["runny nose", "sneezing", "sore throat"];
  const qIdf = q.reduce((n, s) => n + idfOf.get(s)!, 0);
  console.log(`\nWorked example: ${q.join(", ")} -> ${rank(q, full).rows.length} conditions match`);
  for (const name of ["Common cold", "Hay fever"]) {
    const d = kb.diseases.find((x: any) => x.name === name);
    const m = d.symptoms.filter((l: any) => q.includes(l.name));
    const base = m.reduce((n: number, l: any) => n + l.weight, 0);
    const cov = m.reduce((n: number, l: any) => n + idfOf.get(l.name)!, 0) / qIdf;
    console.log(`${name}: weights ${base.toFixed(2)} x coverage ${cov.toFixed(2)} x prior ${PRIOR[d.prevalence]} = ${(base * cov * PRIOR[d.prevalence]).toFixed(2)}`);
  }
}
