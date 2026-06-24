/**
 * Tests for memories tRPC router.
 *
 * Strategy: mock the DB query layer (findProfileByUserId /
 * findActiveShortTermMemories / deleteShortTermMemory) and call the router
 * directly via createCaller, mirroring diaries.test.ts.
 *
 * Covers:
 * - getProfile: returns profile when present
 * - getProfile: returns undefined when none
 * - listShortTerm: returns memories, respects default limit
 * - deleteShortTerm: success path
 * - deleteShortTerm: input validation (non-positive id)
 * - auth guard: unauthenticated caller rejected
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AiSettings, User } from "@db/schema";

vi.mock("../queries/memories", () => ({
  findProfileByUserId: vi.fn(),
  findActiveShortTermMemories: vi.fn(),
  deleteShortTermMemory: vi.fn(),
  resetProfile: vi.fn(),
  upsertProfile: vi.fn(),
  mergeShortTermMemories: vi.fn(),
  archiveExpiredMemories: vi.fn(),
}));

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

vi.mock("../queries/ai-settings", () => ({
  findAiSettingsByUserId: vi.fn(),
}));

vi.mock("../services/dream", () => ({
  dreamProfileDetailed: vi.fn(),
}));

import {
  findProfileByUserId,
  findActiveShortTermMemories,
  deleteShortTermMemory,
  resetProfile,
} from "../queries/memories";
import { findAiSettingsByUserId } from "../queries/ai-settings";
import { dreamProfileDetailed } from "../services/dream";
import { memoriesRouter } from "./memories";
import type { TrpcContext } from "../context";

function makeCaller(ctx: TrpcContext) {
  return memoriesRouter.createCaller(ctx);
}

function makeUser(id: number): User {
  return {
    id,
    unionId: `uid_${id}`,
    username: null,
    passwordHash: null,
    name: "Test User",
    email: null,
    avatar: null,
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignInAt: new Date(),
  };
}

function makeCtx(user: User): TrpcContext {
  return {
    req: new Request("http://localhost"),
    resHeaders: new Headers(),
    user,
  };
}

function makeAiSettings(userId: number, overrides: Partial<AiSettings> = {}): AiSettings {
  return {
    id: 1,
    userId,
    visionApiKey: null,
    visionApiBaseUrl: null,
    visionModel: null,
    enableImageUnderstanding: true,
    visionPromptTemplate: null,
    diaryApiKey: "sk-test",
    diaryApiBaseUrl: "https://api.test/v1",
    diaryModel: null,
    diaryGenerationTime: "02:00",
    diaryLanguage: "zh",
    diaryStyle: "温柔真实",
    diaryLength: "中",
    diaryPromptTemplate: null,
    stylePrompts: null,
    enableDream: true,
    timezone: "Asia/Shanghai",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("memories.getProfile", () => {
  it("returns the profile when one exists", async () => {
    const user = makeUser(1);
    const caller = makeCaller(makeCtx(user));
    const profile = {
      id: 7,
      userId: user.id,
      persona: "内省",
      relationships: null,
      emotionalTone: null,
      languageStyle: null,
      summary: "一个写代码的人",
      version: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    vi.mocked(findProfileByUserId).mockResolvedValue(profile);

    const result = await caller.getProfile();
    expect(result).toEqual(profile);
    expect(findProfileByUserId).toHaveBeenCalledWith(user.id);
  });

  it("returns undefined when no profile exists yet", async () => {
    const user = makeUser(1);
    const caller = makeCaller(makeCtx(user));
    vi.mocked(findProfileByUserId).mockResolvedValue(undefined);

    const result = await caller.getProfile();
    expect(result).toBeUndefined();
  });
});

describe("memories.listShortTerm", () => {
  it("returns active memories with default limit", async () => {
    const user = makeUser(1);
    const caller = makeCaller(makeCtx(user));
    const mems = [
      {
        id: 1,
        userId: user.id,
        content: "最近在赶项目",
        category: "focus" as const,
        importance: 4,
        firstSeenAt: new Date(),
        lastReferencedAt: new Date(),
        decayAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    vi.mocked(findActiveShortTermMemories).mockResolvedValue(mems);

    const result = await caller.listShortTerm();
    expect(result).toEqual(mems);
    expect(findActiveShortTermMemories).toHaveBeenCalledWith(user.id, 20);
  });

  it("respects custom limit", async () => {
    const user = makeUser(1);
    const caller = makeCaller(makeCtx(user));
    vi.mocked(findActiveShortTermMemories).mockResolvedValue([]);

    await caller.listShortTerm({ limit: 5 });
    expect(findActiveShortTermMemories).toHaveBeenCalledWith(user.id, 5);
  });
});

describe("memories.deleteShortTerm", () => {
  it("deletes a memory that belongs to the user", async () => {
    const user = makeUser(1);
    const caller = makeCaller(makeCtx(user));
    vi.mocked(deleteShortTermMemory).mockResolvedValue(undefined);

    const result = await caller.deleteShortTerm({ id: 42 });
    expect(result).toEqual({ success: true });
    // ownership is enforced inside deleteShortTermMemory by userId filter
    expect(deleteShortTermMemory).toHaveBeenCalledWith(user.id, 42);
  });

  it("throws on non-positive id (input validation)", async () => {
    const user = makeUser(1);
    const caller = makeCaller(makeCtx(user));
    await expect(caller.deleteShortTerm({ id: 0 })).rejects.toThrow();
    expect(deleteShortTermMemory).not.toHaveBeenCalled();
  });
});

describe("memories.resetProfile", () => {
  it("deletes the profile for the authenticated user", async () => {
    const user = makeUser(1);
    const caller = makeCaller(makeCtx(user));
    vi.mocked(resetProfile).mockResolvedValue(undefined);

    const result = await caller.resetProfile();
    expect(result).toEqual({ success: true });
    expect(resetProfile).toHaveBeenCalledWith(user.id);
  });
});

describe("memories.triggerDream", () => {
  it("rejects when diary API config is missing", async () => {
    const user = makeUser(1);
    const caller = makeCaller(makeCtx(user));
    vi.mocked(findAiSettingsByUserId).mockResolvedValue(undefined);

    const result = await caller.triggerDream();

    expect(result).toEqual({ success: false, message: "请先在写作模型中配置 API" });
    expect(dreamProfileDetailed).not.toHaveBeenCalled();
  });

  it("rejects when Dream is disabled", async () => {
    const user = makeUser(1);
    const caller = makeCaller(makeCtx(user));
    vi.mocked(findAiSettingsByUserId).mockResolvedValue(makeAiSettings(user.id, { enableDream: false }));

    const result = await caller.triggerDream();

    expect(result).toEqual({ success: false, message: "Dream 记忆未启用" });
    expect(dreamProfileDetailed).not.toHaveBeenCalled();
  });

  it("runs Dream and returns success", async () => {
    const user = makeUser(1);
    const caller = makeCaller(makeCtx(user));
    vi.mocked(findAiSettingsByUserId).mockResolvedValue(makeAiSettings(user.id));
    vi.mocked(dreamProfileDetailed).mockResolvedValue({ success: true });

    const result = await caller.triggerDream();

    expect(result).toEqual({ success: true, message: "记忆更新成功" });
    expect(dreamProfileDetailed).toHaveBeenCalledWith(user.id, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
  });

  it("returns a specific message for provider failures", async () => {
    const user = makeUser(1);
    const caller = makeCaller(makeCtx(user));
    vi.mocked(findAiSettingsByUserId).mockResolvedValue(makeAiSettings(user.id));
    vi.mocked(dreamProfileDetailed).mockResolvedValue({ success: false, reason: "failed" });

    const result = await caller.triggerDream();

    expect(result).toEqual({
      success: false,
      message: "Dream 运行失败，请稍后重试或检查写作模型配置",
    });
  });

  it("returns a specific message while another Dream pass is running", async () => {
    const user = makeUser(1);
    const caller = makeCaller(makeCtx(user));
    vi.mocked(findAiSettingsByUserId).mockResolvedValue(makeAiSettings(user.id));
    vi.mocked(dreamProfileDetailed).mockResolvedValue({ success: false, reason: "already_running" });

    const result = await caller.triggerDream();

    expect(result).toEqual({ success: false, message: "Dream 正在运行，请稍后再试" });
  });
});

describe("memories — auth guard", () => {
  it("rejects unauthenticated callers", async () => {
    const unauthCtx: TrpcContext = {
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: undefined,
    };
    const caller = makeCaller(unauthCtx);
    await expect(caller.getProfile()).rejects.toThrow(
      expect.objectContaining({ code: "UNAUTHORIZED" }),
    );
    expect(findProfileByUserId).not.toHaveBeenCalled();
  });
});
