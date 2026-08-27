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
  /** The urgency level */
  level: "emergency" | "urgent";
  /** Message to show the user */
  message: string;
}

const ESCALATION_RULES: EscalationRule[] = [
  {
    name: "chest_pain_complex",
    triggerSymptoms: ["chest pain", "chest tightness", "breathlessness", "sweating", "nausea", "pain in left arm"],
    minMatches: 2,
    level: "emergency",
    message: "Your symptoms may indicate a cardiac emergency. Please call emergency services (112/911) or go to the nearest emergency room immediately. Do not drive yourself.",
  },
  {
    name: "stroke_signs",
    triggerSymptoms: ["sudden headache", "slurred speech", "facial drooping", "weakness on one side", "confusion", "vision loss", "dizziness"],
    minMatches: 2,
    level: "emergency",
    message: "Your symptoms may indicate a stroke. Time is critical — call emergency services (112/911) immediately. Remember FAST: Face drooping, Arm weakness, Speech difficulty, Time to call.",
  },
  {
    name: "breathing_emergency",
    triggerSymptoms: ["breathlessness", "difficulty breathing", "blue lips", "gasping", "wheezing", "chest tightness"],
    minMatches: 2,
    level: "emergency",
    message: "Severe breathing difficulty requires immediate medical attention. Call emergency services (112/911) or go to the nearest emergency room now.",
  },
  {
    name: "severe_allergic_reaction",
    triggerSymptoms: ["swelling", "difficulty breathing", "skin rash", "itching", "dizziness", "rapid heartbeat"],
    minMatches: 3,
    level: "emergency",
    message: "These symptoms may indicate a severe allergic reaction (anaphylaxis). If you have an EpiPen, use it now. Call emergency services (112/911) immediately.",
  },
  {
    name: "suicidal_ideation",
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
export function checkEscalation(userMessage: string): EscalationResult {
  const messageLower = userMessage.toLowerCase();

  let highestMatch: EscalationResult = {
    triggered: false,
    level: "none",
    ruleName: null,
    message: null,
  };

  for (const rule of ESCALATION_RULES) {
    const matchCount = rule.triggerSymptoms.filter((symptom) =>
      messageLower.includes(symptom.toLowerCase())
    ).length;

    if (matchCount >= rule.minMatches) {
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
