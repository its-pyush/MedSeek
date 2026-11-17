import { describe, it, expect } from "vitest";

import { checkEscalation, mentions } from "./escalation.js";

const fires = (text: string) => checkEscalation(text);

describe("escalation — phrases that must trigger on their own", () => {
  it.each([
    ["I want to kill myself", "suicidal_ideation"],
    ["sometimes I think about suicide", "suicidal_ideation"],
    ["I don't want to live anymore", "suicidal_ideation"],
    ["I think I'm having a heart attack", "chest_pain_complex"],
    ["help I can't breathe", "breathing_emergency"],
    ["I can’t breathe", "breathing_emergency"],
    ["my face is drooping on the left", "stroke_signs"],
    ["I am vomiting blood", "severe_abdominal"],
    ["my throat is closing after eating peanuts", "severe_allergic_reaction"],
  ])("%s → %s", (text, rule) => {
    const result = fires(text);
    expect(result.triggered).toBe(true);
    expect(result.ruleName).toBe(rule);
  });
});

describe("escalation — symptom combinations", () => {
  it("fires on chest pain with sweating", () => {
    expect(fires("I have sudden severe chest pain and profuse sweating").ruleName).toBe("chest_pain_complex");
  });

  it("fires on slurred speech with confusion", () => {
    expect(fires("slurred speech and confusion since this morning").ruleName).toBe("stroke_signs");
  });

  it("fires on rash, swelling and difficulty breathing", () => {
    expect(fires("skin rash, swelling and difficulty breathing").ruleName).toBe("severe_allergic_reaction");
  });
});

describe("escalation — must NOT trigger", () => {
  it.each([
    "I have sweating and nausea after dinner",
    "itching, skin rash and some swelling on my arm",
    "I feel dizziness and confusion when I skip meals",
    "I have no chest pain, just sweating at night",
    "I am not suicidal, just tired",
    "How to relieve headache?",
    "What blood pressure pill do I take?",
  ])("%s", (text) => {
    expect(fires(text).triggered).toBe(false);
  });
});

describe("mentions()", () => {
  it("ignores a negated phrase but finds a later un-negated one", () => {
    expect(mentions("no chest pain", "chest pain")).toBe(false);
    expect(mentions("no chest pain yesterday. today real chest pain", "chest pain")).toBe(true);
  });

  it("does not let a negation cross into the next clause", () => {
    expect(mentions("no fever but chest pain since noon", "chest pain")).toBe(true);
    expect(mentions("not sleeping well, chest pain at night", "chest pain")).toBe(true);
  });
});
