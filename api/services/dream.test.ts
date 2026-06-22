/**
 * Tests for Dream response parsing — the most failure-prone part of the
 * Dream mechanism, since it depends on LLM output shape.
 *
 * Covers:
 * - well-formed response with all fields
 * - response wrapped in prose / code fences (realistic LLM output)
 * - missing shortTermMemories array
 * - invalid category falls back to "other"
 * - out-of-range importance clamps to [1,5]
 * - empty / non-JSON content returns null
 * - profile fields preserve only strings, ignore non-strings
 */

import { describe, it, expect } from "vitest";
import { parseDreamResponse } from "./dream";

describe("parseDreamResponse", () => {
  it("parses a well-formed response", () => {
    const content = JSON.stringify({
      profile: {
        persona: "内省、敏感",
        relationships: "养了只黑猫",
        emotionalTone: "近期偏疲惫",
        languageStyle: "短句多",
        summary: "一个写代码的人",
      },
      shortTermMemories: [
        { content: "最近在赶项目", category: "focus", importance: 4 },
        { content: "情绪偏低", category: "mood", importance: 3 },
      ],
    });

    const result = parseDreamResponse(content);
    expect(result).not.toBeNull();
    expect(result!.profile.persona).toBe("内省、敏感");
    expect(result!.profile.summary).toBe("一个写代码的人");
    expect(result!.shortTermMemories).toHaveLength(2);
    expect(result!.shortTermMemories[0]).toEqual({
      content: "最近在赶项目",
      category: "focus",
      importance: 4,
    });
  });

  it("extracts JSON from surrounding prose / code fences", () => {
    const content = `好的，这是更新后的画像：
\`\`\`json
{"profile":{"summary":"测试"},"shortTermMemories":[]}
\`\`\`
希望对你有帮助。`;

    const result = parseDreamResponse(content);
    expect(result).not.toBeNull();
    expect(result!.profile.summary).toBe("测试");
    expect(result!.shortTermMemories).toEqual([]);
  });

  it("handles missing shortTermMemories (treats as empty)", () => {
    const content = JSON.stringify({ profile: { summary: "只有画像" } });
    const result = parseDreamResponse(content);
    expect(result).not.toBeNull();
    expect(result!.shortTermMemories).toEqual([]);
  });

  it("falls back to 'other' for unknown category", () => {
    const content = JSON.stringify({
      profile: {},
      shortTermMemories: [{ content: "x", category: "bogus", importance: 3 }],
    });
    const result = parseDreamResponse(content);
    expect(result!.shortTermMemories[0].category).toBe("other");
  });

  it("clamps out-of-range importance to valid bounds", () => {
    const content = JSON.stringify({
      profile: {},
      shortTermMemories: [
        { content: "too high", category: "mood", importance: 9 },
        { content: "too low", category: "mood", importance: 0 },
        { content: "non-number", category: "mood", importance: "high" },
      ],
    });
    const result = parseDreamResponse(content);
    expect(result!.shortTermMemories[0].importance).toBe(5); // 9 clamped up to max
    expect(result!.shortTermMemories[1].importance).toBe(1); // 0 clamped down to min
    expect(result!.shortTermMemories[2].importance).toBe(3); // non-number -> default
  });

  it("returns null for non-JSON content", () => {
    expect(parseDreamResponse("just some text, no json")).toBeNull();
  });

  it("returns null for empty content", () => {
    expect(parseDreamResponse("")).toBeNull();
  });

  it("ignores non-string profile fields", () => {
    const content = JSON.stringify({
      profile: { persona: 123, summary: "valid" },
      shortTermMemories: [],
    });
    const result = parseDreamResponse(content);
    expect(result!.profile.persona).toBeUndefined();
    expect(result!.profile.summary).toBe("valid");
  });

  it("skips short-term memory items with empty content", () => {
    const content = JSON.stringify({
      profile: {},
      shortTermMemories: [
        { content: "", category: "mood", importance: 3 },
        { content: "   ", category: "mood", importance: 3 },
        { content: "valid", category: "mood", importance: 3 },
      ],
    });
    const result = parseDreamResponse(content);
    expect(result!.shortTermMemories).toHaveLength(1);
    expect(result!.shortTermMemories[0].content).toBe("valid");
  });

  it("truncates profile fields exceeding length cap", () => {
    const longText = "A".repeat(600);
    const content = JSON.stringify({
      profile: { persona: longText, summary: longText },
      shortTermMemories: [],
    });
    const result = parseDreamResponse(content);
    expect(result!.profile.persona!.length).toBe(500);
    expect(result!.profile.summary!.length).toBe(500);
  });

  it("truncates short-term memory content exceeding cap", () => {
    const longContent = "B".repeat(300);
    const content = JSON.stringify({
      profile: {},
      shortTermMemories: [{ content: longContent, category: "mood", importance: 3 }],
    });
    const result = parseDreamResponse(content);
    expect(result!.shortTermMemories[0].content.length).toBe(200);
  });

  it("caps short-term memories at max count", () => {
    const items = Array.from({ length: 15 }, (_, i) => ({
      content: `memory ${i}`,
      category: "mood",
      importance: 3,
    }));
    const content = JSON.stringify({ profile: {}, shortTermMemories: items });
    const result = parseDreamResponse(content);
    expect(result!.shortTermMemories.length).toBeLessThanOrEqual(10);
  });
});
