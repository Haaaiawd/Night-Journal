/**
 * End-to-end tests for dreamProfile — mocks the LLM call and all DB
 * query functions, then verifies the orchestration: profile preservation
 * on empty LLM fields, upsert call args, merge call args, and the
 * enableDream=false / no-signal skip paths.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the LLM call
vi.mock("../lib/openai", () => ({
  callChatModel: vi.fn(),
}));

// Mock env so modules load
vi.mock("../lib/env", () => ({
  env: {
    appId: "test-app-id",
    appSecret: "test-secret-that-is-long-enough-32c",
    databaseUrl: "mysql://root:pw@localhost/db",
    kimiAuthUrl: "https://kimi.test",
    kimiOpenUrl: "https://open.test",
    isProduction: false,
    ownerUnionId: "",
  },
}));

// Mock all query layers
vi.mock("../queries/ai-settings", () => ({
  findAiSettingsByUserId: vi.fn(),
}));
vi.mock("../queries/entries", () => ({
  findEntriesByDate: vi.fn(),
}));
vi.mock("../queries/diaries", () => ({
  findRecentGeneratedDiaries: vi.fn(),
}));
vi.mock("../queries/memories", () => ({
  findProfileByUserId: vi.fn(),
  upsertProfile: vi.fn(),
  mergeShortTermMemories: vi.fn(),
  archiveExpiredMemories: vi.fn(),
}));

import { callChatModel } from "../lib/openai";
import { findAiSettingsByUserId } from "../queries/ai-settings";
import { findEntriesByDate } from "../queries/entries";
import { findRecentGeneratedDiaries } from "../queries/diaries";
import {
  findProfileByUserId,
  upsertProfile,
  mergeShortTermMemories,
  archiveExpiredMemories,
} from "../queries/memories";
import { dreamProfile } from "./dream";

const mockSettings = {
  id: 1,
  userId: 1,
  diaryApiKey: "key",
  diaryApiBaseUrl: "https://api.test",
  diaryModel: "test-model",
  enableDream: true,
  timezone: "Asia/Shanghai",
  diaryGenerationTime: "02:00",
  diaryLanguage: "zh",
  diaryStyle: "温柔真实",
  diaryLength: "中",
  diaryPromptTemplate: null,
  stylePrompts: null,
  visionApiKey: null,
  visionApiBaseUrl: null,
  visionModel: null,
  enableImageUnderstanding: true,
  visionPromptTemplate: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockExistingProfile = {
  id: 1,
  userId: 1,
  persona: "old persona",
  relationships: "old relationships",
  emotionalTone: "old tone",
  languageStyle: "old style",
  summary: "old summary",
  version: 2,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("dreamProfile", () => {
  it("skips when enableDream is false", async () => {
    vi.mocked(findAiSettingsByUserId).mockResolvedValue({
      ...mockSettings,
      enableDream: false,
    } as typeof mockSettings);

    const result = await dreamProfile(1, "2026-01-01");
    expect(result).toBe(false);
    expect(callChatModel).not.toHaveBeenCalled();
  });

  it("skips when no diaries and no entries (no signal)", async () => {
    vi.mocked(findAiSettingsByUserId).mockResolvedValue(mockSettings as typeof mockSettings);
    vi.mocked(findProfileByUserId).mockResolvedValue(undefined);
    vi.mocked(findRecentGeneratedDiaries).mockResolvedValue([]);
    vi.mocked(findEntriesByDate).mockResolvedValue([]);

    const result = await dreamProfile(1, "2026-01-01");
    expect(result).toBe(false);
    expect(callChatModel).not.toHaveBeenCalled();
  });

  it("preserves existing profile fields when LLM returns empty", async () => {
    vi.mocked(findAiSettingsByUserId).mockResolvedValue(mockSettings as typeof mockSettings);
    vi.mocked(findProfileByUserId).mockResolvedValue(mockExistingProfile);
    vi.mocked(findRecentGeneratedDiaries).mockResolvedValue([
      {
        diaryDate: new Date("2026-01-01"),
        title: "Today",
        summary: "did stuff",
        content: "full content",
      },
    ]);
    vi.mocked(findEntriesByDate).mockResolvedValue([]);
    // LLM returns empty profile fields, no short-term memories
    vi.mocked(callChatModel).mockResolvedValue(
      JSON.stringify({ profile: {}, shortTermMemories: [] }),
    );
    vi.mocked(upsertProfile).mockResolvedValue(mockExistingProfile);

    const result = await dreamProfile(1, "2026-01-01");
    expect(result).toBe(true);

    // upsertProfile should be called with existing values preserved
    expect(upsertProfile).toHaveBeenCalledWith(1, {
      persona: "old persona",
      relationships: "old relationships",
      emotionalTone: "old tone",
      languageStyle: "old style",
      summary: "old summary",
    });
    // merge should NOT be called (no short-term memories)
    expect(mergeShortTermMemories).not.toHaveBeenCalled();
  });

  it("upserts new profile and merges memories on first Dream pass", async () => {
    vi.mocked(findAiSettingsByUserId).mockResolvedValue(mockSettings as typeof mockSettings);
    vi.mocked(findProfileByUserId).mockResolvedValue(undefined);
    vi.mocked(findRecentGeneratedDiaries).mockResolvedValue([
      {
        diaryDate: new Date("2026-01-01"),
        title: "Today",
        summary: "did stuff",
        content: "full content",
      },
    ]);
    vi.mocked(findEntriesByDate).mockResolvedValue([
      {
        id: 1,
        userId: 1,
        contentText: "feeling tired today",
        moodLabel: "疲惫",
        createdAt: new Date(),
        updatedAt: new Date(),
        entryDate: new Date("2026-01-01"),
        hasImages: false,
        includedInDiary: false,
        deletedAt: null,
        attachments: [],
      },
    ]);
    vi.mocked(callChatModel).mockResolvedValue(
      JSON.stringify({
        profile: {
          persona: "内省",
          relationships: "独居",
          emotionalTone: "近期偏疲惫",
          languageStyle: "短句多",
          summary: "一个写代码的人",
        },
        shortTermMemories: [
          { content: "最近在赶项目", category: "focus", importance: 4 },
          { content: "情绪偏低", category: "mood", importance: 3 },
        ],
      }),
    );
    vi.mocked(upsertProfile).mockResolvedValue(mockExistingProfile);

    const result = await dreamProfile(1, "2026-01-01");
    expect(result).toBe(true);

    expect(upsertProfile).toHaveBeenCalledWith(1, {
      persona: "内省",
      relationships: "独居",
      emotionalTone: "近期偏疲惫",
      languageStyle: "短句多",
      summary: "一个写代码的人",
    });

    expect(mergeShortTermMemories).toHaveBeenCalledWith(1, [
      { content: "最近在赶项目", category: "focus", importance: 4 },
      { content: "情绪偏低", category: "mood", importance: 3 },
    ]);

    expect(archiveExpiredMemories).toHaveBeenCalledWith(1);
  });

  it("returns false when LLM response is unparseable", async () => {
    vi.mocked(findAiSettingsByUserId).mockResolvedValue(mockSettings as typeof mockSettings);
    vi.mocked(findProfileByUserId).mockResolvedValue(undefined);
    vi.mocked(findRecentGeneratedDiaries).mockResolvedValue([
      {
        diaryDate: new Date("2026-01-01"),
        title: "Today",
        summary: "did stuff",
        content: "full content",
      },
    ]);
    vi.mocked(findEntriesByDate).mockResolvedValue([]);
    vi.mocked(callChatModel).mockResolvedValue("not json at all");

    const result = await dreamProfile(1, "2026-01-01");
    expect(result).toBe(false);
    expect(upsertProfile).not.toHaveBeenCalled();
    expect(mergeShortTermMemories).not.toHaveBeenCalled();
  });

  it("returns false when settings are missing", async () => {
    vi.mocked(findAiSettingsByUserId).mockResolvedValue(undefined);

    const result = await dreamProfile(1, "2026-01-01");
    expect(result).toBe(false);
    expect(callChatModel).not.toHaveBeenCalled();
  });
});

