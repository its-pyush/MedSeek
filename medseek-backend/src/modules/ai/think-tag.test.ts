import { describe, it, expect } from "vitest";
import { stripThinkTags } from "./service.js";

describe("stripThinkTags", () => {
  it("returns empty string if input is empty or nullish", () => {
    expect(stripThinkTags("")).toBe("");
    expect(stripThinkTags(null as unknown as string)).toBe("");
  });

  it("leaves text without think tags intact", () => {
    const text = "Normal medical guidance without reasoning block.";
    expect(stripThinkTags(text)).toBe(text);
  });

  it("strips standard <think>...</think> blocks", () => {
    const input = "<think>Analyzing patient symptoms and prior medication.</think>You should consult your cardiologist.";
    expect(stripThinkTags(input)).toBe("You should consult your cardiologist.");
  });

  it("strips multiline <think> blocks", () => {
    const input = `
<think>
Step 1: Check patient profile.
Step 2: Compare against guidelines.
Step 3: Draft recommendation.
</think>

Based on your medication history, Lisinopril is typically taken in the morning.`;

    expect(stripThinkTags(input)).toBe(
      "Based on your medication history, Lisinopril is typically taken in the morning."
    );
  });

  it("strips case-insensitive <THINK> tags", () => {
    const input = "<THINK>Internal deliberation</THINK>Please monitor your blood pressure.";
    expect(stripThinkTags(input)).toBe("Please monitor your blood pressure.");
  });

  it("strips multiple distinct think blocks", () => {
    const input = "<think>First check</think>Hello! <think>Second check</think>How can I help you today?";
    expect(stripThinkTags(input)).toBe("Hello! How can I help you today?");
  });

  it("strips unclosed trailing <think> block if generation was truncated", () => {
    const input = "Valid response text before reasoning cut off. <think>Dangling thought that didn't close";
    expect(stripThinkTags(input)).toBe("Valid response text before reasoning cut off.");
  });
});
