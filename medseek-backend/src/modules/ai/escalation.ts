/**
 * Red-flag symptom escalation logic.
 *
 * Detects symptom combinations that require immediate medical attention
 * and returns appropriate escalation responses. This is a hard stop —
 * when triggered, the AI chat should direct the user to emergency care
 * rather than continuing to chat.
 */

// ─── Red-Flag Patterns ──────────────────────────────────────────

interface EscalationRule {
  /** Descriptive name for the rule */
  name: string;
  /** Symptoms that trigger this rule (any subset match triggers it) */
  triggerSymptoms: string[];
  /** Minimum number of trigger symptoms that must match */
  minMatches: number;
  /** Phrases that trigger the rule on their own, whatever else is said */
  directPhrases?: string[];
  /** If set, at least one of these must be present for a combination match to count */
  requireAnyOf?: string[];
  /** The urgency level */
  level: "emergency" | "urgent";
  /** Message to show the user */
  message: string;
}

const ESCALATION_RULES: EscalationRule[] = [
  {
    name: "chest_pain_complex",
    directPhrases: ["heart attack", "crushing chest pain", "chest pain spreading to my arm", "chest pain spreading to my jaw"],
    // Sweating + nausea alone is a stomach bug far more often than a heart attack
    requireAnyOf: ["chest pain", "chest tightness", "chest pressure", "pain in left arm", "pain in my left arm"],
    triggerSymptoms: ["chest pain", "chest tightness", "breathlessness", "sweating", "nausea", "pain in left arm"],
    minMatches: 2,
    level: "emergency",
    message: "Your symptoms may indicate a cardiac emergency. Please call emergency services (112/911) or go to the nearest emergency room immediately. Do not drive yourself.",
  },
  {
    name: "stroke_signs",
    directPhrases: ["having a stroke", "face drooping", "face is drooping", "can't move one side", "cannot move one side"],
    requireAnyOf: ["slurred speech", "facial drooping", "weakness on one side", "vision loss", "sudden headache"],
    triggerSymptoms: ["sudden headache", "slurred speech", "facial drooping", "weakness on one side", "confusion", "vision loss", "dizziness"],
    minMatches: 2,
    level: "emergency",
    message: "Your symptoms may indicate a stroke. Time is critical — call emergency services (112/911) immediately. Remember FAST: Face drooping, Arm weakness, Speech difficulty, Time to call.",
  },
  {
    name: "breathing_emergency",
    directPhrases: ["can't breathe", "cant breathe", "cannot breathe", "unable to breathe", "struggling to breathe", "choking", "lips are blue", "turning blue"],
    triggerSymptoms: ["breathlessness", "difficulty breathing", "blue lips", "gasping", "wheezing", "chest tightness"],
    minMatches: 2,
    level: "emergency",
    message: "Severe breathing difficulty requires immediate medical attention. Call emergency services (112/911) or go to the nearest emergency room now.",
  },
  {
    name: "severe_allergic_reaction",
    directPhrases: ["anaphylaxis", "throat is closing", "throat closing", "tongue is swelling", "swollen tongue"],
    // Rash + itching + swelling without any breathing or circulation sign is not anaphylaxis
    requireAnyOf: ["difficulty breathing", "dizziness", "rapid heartbeat"],
    triggerSymptoms: ["swelling", "difficulty breathing", "skin rash", "itching", "dizziness", "rapid heartbeat"],
    minMatches: 3,
    level: "emergency",
    message: "These symptoms may indicate a severe allergic reaction (anaphylaxis). If you have an EpiPen, use it now. Call emergency services (112/911) immediately.",
  },
  {
    name: "suicidal_ideation",
    directPhrases: [
      "kill myself", "killing myself", "suicide", "suicidal", "end my life", "ending my life",
      "take my own life", "want to die", "don't want to live", "dont want to live",
      "do not want to live", "hurt myself", "harm myself", "better off dead", "overdose on purpose",
    ],
    triggerSymptoms: ["suicidal thoughts", "self harm", "wanting to die", "hopelessness", "no reason to live"],
    minMatches: 1,
    level: "emergency",
    message: "If you are having thoughts of self-harm or suicide, please reach out immediately. Crisis helpline (India): iCall 9152987821 | Vandrevala Foundation 1860-2662-345 | US: 988 Suicide & Crisis Lifeline. You are not alone.",
  },
  {
    name: "high_fever_with_stiffness",
    triggerSymptoms: ["high fever", "stiff neck", "severe headache", "confusion", "sensitivity to light"],
    minMatches: 3,
    level: "urgent",
    message: "These symptoms could indicate meningitis or another serious infection. Please seek urgent medical care within the next few hours — do not wait.",
  },
  {
    name: "severe_abdominal",
    directPhrases: ["vomiting blood", "throwing up blood", "coughing up blood", "black tarry stool"],
    triggerSymptoms: ["severe abdominal pain", "vomiting blood", "blood in stool", "high fever", "rigid abdomen"],
    minMatches: 2,
    level: "urgent",
    message: "These symptoms may indicate a serious abdominal condition that needs prompt medical evaluation. Please visit an emergency room or urgent care facility as soon as possible.",
  },
];

// ─── Escalation Check ───────────────────────────────────────────

export interface EscalationResult {
  triggered: boolean;
  level: "emergency" | "urgent" | "none";
  ruleName: string | null;
  message: string | null;
}

/**
 * Check a user's message for red-flag symptom patterns.
 * Returns the highest-priority escalation if any rules match.
 */
const NEGATIONS = ["no", "not", "never", "without", "dont", "don't", "doesnt", "doesn't", "didnt", "didn't", "isnt", "isn't", "wasnt", "wasn't", "denies", "deny"];

/**
 * True if `phrase` occurs in `text` at least once without a negation word in
 * the three words before it ("no chest pain", "I am not suicidal").
 * Exception: "don't want to live" style phrases carry their own negation and
 * are listed in full in the rules, so they still match.
 */
export function mentions(text: string, phrase: string): boolean {
  const needle = phrase.toLowerCase();
  let from = 0;
  for (;;) {
    const at = text.indexOf(needle, from);
    if (at === -1) return false;
    // A negation only reaches to the end of its own clause:
    // "no fever but chest pain" must still count as chest pain.
    const clause = text.slice(0, at).split(/[,.;!?]|\bbut\b|\bhowever\b|\bthough\b/).pop() ?? "";
    const before = clause
      .replace(/[^a-z'\s]/g, " ")
      .trim()
      .split(/\s+/)
      .slice(-3);
    if (!before.some((w) => NEGATIONS.includes(w))) return true;
    from = at + needle.length;
  }
}

/**
 * Check a user's message for red-flag symptom patterns.
 * Returns the highest-priority escalation if any rules match.
 *
 * A rule fires when one of its direct phrases is present, or when enough of
 * its trigger symptoms are present together (and, where the rule asks for it,
 * at least one of the defining symptoms is among them).
 */
export function checkEscalation(userMessage: string): EscalationResult {
  // Normalise curly apostrophes so "can’t breathe" matches "can't breathe"
  const messageLower = userMessage.toLowerCase().replace(/[\u2018\u2019]/g, "'");

  let highestMatch: EscalationResult = {
    triggered: false,
    level: "none",
    ruleName: null,
    message: null,
  };

  for (const rule of ESCALATION_RULES) {
    const direct = (rule.directPhrases ?? []).some((p) => mentions(messageLower, p));

    const matchCount = rule.triggerSymptoms.filter((symptom) => mentions(messageLower, symptom)).length;
    const hasRequired =
      !rule.requireAnyOf || rule.requireAnyOf.some((p) => mentions(messageLower, p));
    const combination = matchCount >= rule.minMatches && hasRequired;

    if (direct || combination) {
      // Emergency always takes priority over urgent
      if (
        !highestMatch.triggered ||
        (rule.level === "emergency" && highestMatch.level !== "emergency")
      ) {
        highestMatch = {
          triggered: true,
          level: rule.level,
          ruleName: rule.name,
          message: rule.message,
        };
      }
    }
  }

  return highestMatch;
}

/**
 * Build the escalation disclaimer text that should precede AI responses.
 */
export function getRecurringDisclaimer(): string {
  return (
    "⚕️ **Medical Disclaimer**: I am an AI assistant, not a doctor. " +
    "The information I provide is for general health awareness only and " +
    "should not be used as a substitute for professional medical advice, " +
    "diagnosis, or treatment. Always consult a qualified healthcare " +
    "professional for medical decisions."
  );
}
