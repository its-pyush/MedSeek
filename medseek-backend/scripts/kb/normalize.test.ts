import { describe, it, expect } from "vitest";

import { areOpposites, cleanPhrase, idf, lexicalKey, linkWeight } from "./normalize.js";

describe("KB phrase normalisation", () => {
  it("strips severity words, punctuation and parentheses", () => {
    expect(cleanPhrase("Severe Chest Pain (angina)")).toBe("chest pain");
    expect(cleanPhrase("sudden, intense headache")).toBe("headache");
  });

  it("keeps a phrase that is only a qualifier", () => {
    expect(cleanPhrase("chronic")).toBe("chronic");
  });

  it("unifies common spelling variants", () => {
    expect(cleanPhrase("diarrhoea")).toBe("diarrhea");
    expect(cleanPhrase("tiredness")).toBe("fatigue");
  });

  it("groups word-order and plural variants under one key", () => {
    expect(lexicalKey("pain in the chest")).toBe(lexicalKey("chest pains"));
    expect(lexicalKey("loss of weight")).toBe(lexicalKey("weight loss"));
  });

  it("does not group different symptoms", () => {
    expect(lexicalKey("chest pain")).not.toBe(lexicalKey("back pain"));
  });
});

describe("opposite-meaning guard", () => {
  it("blocks merges across opposites", () => {
    expect(areOpposites("weight gain", "weight loss")).toBe(true);
    expect(areOpposites("high blood pressure", "low blood pressure")).toBe(true);
    expect(areOpposites("constipation", "diarrhea")).toBe(true);
    expect(areOpposites("hyperthyroid symptoms", "hypothyroid symptoms")).toBe(true);
  });

  it("allows genuine synonyms", () => {
    expect(areOpposites("shortness of breath", "difficulty breathing")).toBe(false);
    expect(areOpposites("stomach pain", "abdominal pain")).toBe(false);
  });
});

describe("weights", () => {
  it("gives rarer symptoms a higher idf and never returns zero", () => {
    expect(idf(900, 1)).toBeGreaterThan(idf(900, 300));
    expect(idf(900, 900)).toBeGreaterThan(0);
  });

  it("scales by frequency and boosts key symptoms", () => {
    const base = idf(900, 30);
    expect(linkWeight("common", false, base)).toBeCloseTo(base);
    expect(linkWeight("sometimes", false, base)).toBeCloseTo(base * 0.6);
    expect(linkWeight("rare", false, base)).toBeCloseTo(base * 0.3);
    expect(linkWeight("common", true, base)).toBeCloseTo(base * 1.25);
  });
});
