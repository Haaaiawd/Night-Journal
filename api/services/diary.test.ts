/**
 * Tests for the diary user-message builder. Verifies placeholder replacement,
 * legacy fallback behavior, and the shape of rendered content blocks.
 */

import { describe, it, expect } from "vitest";
import { buildDiaryUserMessage, DIARY_PLACEHOLDERS } from "./diary";

const baseContext = {
  date: "2026-06-22",
  language: "zh",
  style: "温柔真实",
  length: "中",
  stylePrompt: "像朋友间的轻声倾诉",
  fragments: [
    {
      contentText: "早上喝咖啡",
      moodLabel: "平静" as const,
      createdAt: new Date("2026-06-22T08:30:00Z"),
    },
  ],
  memory: null,
};

describe("buildDiaryUserMessage", () => {
  it("replaces all known placeholders in the default template", () => {
    const template = `date={{date}} lang={{language}} style={{style}} prompt={{stylePrompt}} length={{length}} frags={{fragments}} imgs={{imageSummaries}} mem={{memoryBlock}}`;
    const result = buildDiaryUserMessage(baseContext, template);

    expect(result).not.toContain("{{date}}");
    expect(result).not.toContain("{{language}}");
    expect(result).not.toContain("{{style}}");
    expect(result).not.toContain("{{stylePrompt}}");
    expect(result).not.toContain("{{length}}");
    expect(result).not.toContain("{{fragments}}");
    expect(result).not.toContain("{{imageSummaries}}");
    expect(result).not.toContain("{{memoryBlock}}");

    expect(result).toContain("date=2026-06-22");
    expect(result).toContain("lang=zh");
    expect(result).toContain("style=温柔真实");
    expect(result).toContain("prompt=像朋友间的轻声倾诉");
    expect(result).toContain("length=中");
    expect(result).toContain("[平静]");
    expect(result).toContain("早上喝咖啡");
    expect(result).toContain("imgs=无");
    expect(result).toContain("mem=");
  });

  it("falls back to appending the legacy content block when no placeholder is present", () => {
    const template = "自定义系统提示，没有占位符。";
    const result = buildDiaryUserMessage(baseContext, template);

    expect(result.startsWith("自定义系统提示，没有占位符。")).toBe(true);
    expect(result).toContain("日期：2026-06-22");
    expect(result).toContain("今日碎片：");
    expect(result).toContain("早上喝咖啡");
  });

  it("renders image summaries from attachments", () => {
    const context = {
      ...baseContext,
      fragments: [
        {
          contentText: "拍了张天空",
          moodLabel: null,
          createdAt: new Date("2026-06-22T14:00:00Z"),
          attachments: [{ visionSummary: "蓝天白云，光线柔和" }],
        },
      ],
    };
    const result = buildDiaryUserMessage(context, "{{imageSummaries}}");
    expect(result).toContain("蓝天白云，光线柔和");
  });

  it("renders the memory block when memory is present", () => {
    const context = {
      ...baseContext,
      memory: {
        profileSummary: "内省、敏感",
        languageStyle: "短句多",
        shortTermMemories: [
          { content: "最近赶项目", category: "focus" as const, importance: 4 },
        ],
      },
    };
    const result = buildDiaryUserMessage(context, "{{memoryBlock}}");
    expect(result).toContain("对这个用户的理解：内省、敏感");
    expect(result).toContain("语风参考：短句多");
    expect(result).toContain("[focus] 最近赶项目");
  });

  it("renders an empty memory block when no memory data exists", () => {
    const result = buildDiaryUserMessage(baseContext, "{{memoryBlock}}");
    expect(result.trim()).toBe("");
  });

  it("keeps unknown placeholders unchanged", () => {
    const template = "{{unknown}}";
    const result = buildDiaryUserMessage(baseContext, template);
    expect(result).toContain("{{unknown}}");
  });

  it("documents that all placeholders are known and documented", () => {
    expect(DIARY_PLACEHOLDERS).toContain("{{date}}");
    expect(DIARY_PLACEHOLDERS).toContain("{{memoryBlock}}");
    expect(DIARY_PLACEHOLDERS).toHaveLength(8);
  });
});
