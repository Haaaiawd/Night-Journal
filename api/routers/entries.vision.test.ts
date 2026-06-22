/**
 * Tests for vision response parsing. The vision model is asked to return JSON
 * containing `usable_diary_material`; these tests ensure we extract that field
 * when present and gracefully fall back to the raw response otherwise.
 */

import { describe, it, expect } from "vitest";
import { extractUsableDiaryMaterial } from "./entries";

describe("extractUsableDiaryMaterial", () => {
  it("extracts usable_diary_material from a well-formed JSON response", () => {
    const raw = JSON.stringify({
      objective_description: "A cup of coffee on a wooden table",
      emotional_summary: "Calm morning vibe",
      usable_diary_material: "Morning coffee, quiet light through the window.",
    });

    expect(extractUsableDiaryMaterial(raw)).toBe(
      "Morning coffee, quiet light through the window.",
    );
  });

  it("extracts from JSON wrapped in prose and code fences", () => {
    const raw = `好的，这是分析结果：
\`\`\`json
{"objective_description":"x","emotional_summary":"y","usable_diary_material":"use this"}
\`\`\`
希望对你有帮助。`;

    expect(extractUsableDiaryMaterial(raw)).toBe("use this");
  });

  it("returns null when usable_diary_material is missing", () => {
    const raw = JSON.stringify({
      objective_description: "Only description",
      emotional_summary: "Only summary",
    });

    expect(extractUsableDiaryMaterial(raw)).toBeNull();
  });

  it("returns null when usable_diary_material is empty or whitespace", () => {
    expect(
      extractUsableDiaryMaterial(JSON.stringify({ usable_diary_material: "" })),
    ).toBeNull();
    expect(
      extractUsableDiaryMaterial(JSON.stringify({ usable_diary_material: "   " })),
    ).toBeNull();
  });

  it("falls back to null for non-JSON text", () => {
    const raw = "This is just a plain description of the image.";
    expect(extractUsableDiaryMaterial(raw)).toBeNull();
  });

  it("handles empty or blank input", () => {
    expect(extractUsableDiaryMaterial("")).toBeNull();
    expect(extractUsableDiaryMaterial("   ")).toBeNull();
  });

  it("trims whitespace from the extracted material", () => {
    const raw = JSON.stringify({
      usable_diary_material: "  surrounded by spaces  ",
    });
    expect(extractUsableDiaryMaterial(raw)).toBe("surrounded by spaces");
  });
});
