/**
 * Pure helpers for the KB build: phrase cleaning, lexical grouping,
 * the opposite-meaning guard, and the weighting formula.
 * No I/O here so everything is unit-testable.
 */

export type Frequency = "common" | "sometimes" | "rare";

const SEVERITY_WORDS = new Set([
  "severe", "mild", "sudden", "chronic", "persistent", "intense", "extreme",
  "slight", "occasional", "constant", "ongoing", "unexplained",
]);

const STOPWORDS = new Set(["of", "in", "the", "a", "an", "on", "to", "and", "with", "your", "or", "at"]);

const SPELLING: Record<string, string> = {
  diarrhoea: "diarrhea",
  tiredness: "fatigue",
  swollen: "swelling",
  itchy: "itching",
  itchiness: "itching",
  vomitting: "vomiting",
};

/** Lowercase, strip punctuation and severity qualifiers, fix a few spellings. */
export function cleanPhrase(raw: string): string {
  const tokens = raw
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9\s'-]/g, " ")
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => SPELLING[t] ?? t);

  const kept = tokens.filter((t) => !SEVERITY_WORDS.has(t));
  return (kept.length > 0 ? kept : tokens).join(" ").trim();
}

function stem(token: string): string {
  if (token.length > 3 && token.endsWith("s") && !/(ss|us|is)$/.test(token)) {
    return token.slice(0, -1);
  }
  return token;
}

/**
 * Order- and plural-insensitive key: "pain in chest" and "chest pains"
 * both become "chest pain".
 */
export function lexicalKey(phrase: string): string {
  return cleanPhrase(phrase)
    .split(" ")
    .filter((t) => t && !STOPWORDS.has(t))
    .map(stem)
    .sort()
    .join(" ");
}

const OPPOSITES: [string, string][] = [
  ["gain", "loss"],
  ["high", "low"],
  ["increased", "decreased"],
  ["increase", "decrease"],
  ["more", "less"],
  ["fast", "slow"],
  ["rapid", "slow"],
  ["hot", "cold"],
  ["heavy", "light"],
  ["constipation", "diarrhea"],
  ["hyper", "hypo"],
  ["excessive", "reduced"],
  ["frequent", "infrequent"],
  ["dry", "wet"],
  ["upper", "lower"],
];

/** True when two phrases contain opposite-meaning words and must never be merged. */
export function areOpposites(a: string, b: string): boolean {
  const ta = new Set(cleanPhrase(a).split(" "));
  const tb = new Set(cleanPhrase(b).split(" "));
  const has = (set: Set<string>, word: string) =>
    set.has(word) || [...set].some((t) => t.startsWith(word) && (word === "hyper" || word === "hypo"));

  return OPPOSITES.some(
    ([x, y]) => (has(ta, x) && has(tb, y)) || (has(ta, y) && has(tb, x))
  );
}

export const FREQUENCY_WEIGHT: Record<Frequency, number> = {
  common: 1.0,
  sometimes: 0.6,
  rare: 0.3,
};

export const KEY_BOOST = 1.25;

/** How rare a symptom is across the knowledge base. Always > 0. */
export function idf(totalDiseases: number, diseasesWithSymptom: number): number {
  return Math.log(1 + totalDiseases / Math.max(1, diseasesWithSymptom));
}

/** Weight of one symptom for one disease. */
export function linkWeight(frequency: Frequency, isKey: boolean, symptomIdf: number): number {
  return FREQUENCY_WEIGHT[frequency] * symptomIdf * (isKey ? KEY_BOOST : 1);
}
