import { describe, it, expect } from "vitest";
import { areasFor, check, loadValidAreaIds } from "./areas.js";

const { parentOf, valid } = loadValidAreaIds();
const areas = (name: string) => areasFor(name, parentOf);

describe("symptom body areas", () => {
  it("puts a symptom on the most specific part named in it", () => {
    expect(areas("knee swelling")).toEqual(["knee"]);
    expect(areas("chest pain")).toEqual(["chest"]);
    expect(areas("blurred vision")).toEqual(["eyes"]);
  });

  it("uses a group for symptoms with no place on the body", () => {
    expect(areas("fever")).toEqual(["general"]);
    expect(areas("anxiety")).toEqual(["mind"]);
    expect(areas("skin rash")).toEqual(["skin"]);
  });

  it("does not match body words hidden inside other words", () => {
    expect(areas("erectile dysfunction")).toEqual(["genital"]); // not "rect"
    expect(areas("gasping during sleep")).not.toContain("above_pubic_bone"); // not "urin"
    expect(areas("difficulty rising from chair")).not.toContain("scalp"); // not "hair"
  });

  it("only produces known area ids", () => {
    for (const name of ["heartburn", "swelling lymph nodes", "cold hands and feet", "jaundice"]) {
      for (const id of areas(name)) expect(valid.has(id)).toBe(true);
    }
  });

  it("covers every symptom in the knowledge base", () => {
    expect(check()).toEqual([]);
  });
});
