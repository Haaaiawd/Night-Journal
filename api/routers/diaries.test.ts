/**
 * Tests for diaries tRPC router — focuses on the delete mutation.
 *
 * Strategy: mock the DB query layer (findDiaryById / deleteDiary)
 * and call the router directly via createCallerFactory, so we can
 * test business logic without a real database.
 *
 * Covers:
 * - delete: success path (diary exists, belongs to user)
 * - delete: NOT_FOUND when diary doesn't exist
 * - delete: NOT_FOUND when diary belongs to a different user (ownership)
 * - delete: input validation (non-positive id)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "@db/schema";

// ---------------------------------------------------------------------------
// Mock DB layer before importing the router
// ---------------------------------------------------------------------------

vi.mock("../queries/diaries", () => ({
  findDiariesByUser: vi.fn(),
  findDiariesByMonth: vi.fn(),
  findDiaryByDate: vi.fn(),
  findDiaryById: vi.fn(),
  createDiary: vi.fn(),
  updateDiary: vi.fn(),
  updateDiaryContent: vi.fn(),
  createDiaryVersion: vi.fn(),
  findVersionsByDiaryId: vi.fn(),
  findRecentDiaryGenerationLogs: vi.fn(),
  deleteDiary: vi.fn(),
}));

// Mock env so the module loads in test environment
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

import {
  findDiaryById,
  deleteDiary,
  findRecentDiaryGenerationLogs,
} from "../queries/diaries";
import { diariesRouter } from "./diaries";
import type { TrpcContext } from "../context";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// diariesRouter is already built with the project's createRouter + superjson;
// calling .createCaller(ctx) directly is the correct tRPC v11 pattern.
function makeCaller(ctx: TrpcContext) {
  return diariesRouter.createCaller(ctx);
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

function makeDiary(id: number, userId: number) {
  return {
    id,
    userId,
    diaryDate: new Date("2025-01-01"),
    title: "Test Diary",
    summary: null,
    content: "Some content",
    style: null,
    length: null,
    generationStatus: "generated",
    generationError: null,
    generatedAt: new Date(),
    manuallyEdited: false,
    diaryModelUsed: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Clear mocks before every test across all describe blocks
beforeEach(() => {
  vi.clearAllMocks();
});

describe("diaries.delete", () => {
  const user = makeUser(1);
  const caller = makeCaller(makeCtx(user));

  it("successfully deletes a diary that belongs to the user", async () => {
    vi.mocked(findDiaryById).mockResolvedValue(makeDiary(42, user.id));
    vi.mocked(deleteDiary).mockResolvedValue(undefined);

    const result = await caller.delete({ id: 42 });
    expect(result).toEqual({ success: true });

    // Verify ownership check was called with correct userId
    expect(findDiaryById).toHaveBeenCalledWith(user.id, 42);
    // Verify delete was called with correct userId (prevents deleting other users' diaries)
    expect(deleteDiary).toHaveBeenCalledWith(user.id, 42);
  });

  it("throws NOT_FOUND when diary does not exist", async () => {
    vi.mocked(findDiaryById).mockResolvedValue(undefined);

    await expect(caller.delete({ id: 999 })).rejects.toThrow(
      expect.objectContaining({ code: "NOT_FOUND" }),
    );
    expect(deleteDiary).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when diary belongs to a different user (ownership protection)", async () => {
    // findDiaryById already filters by userId — returning undefined means no match
    vi.mocked(findDiaryById).mockResolvedValue(undefined);

    await expect(caller.delete({ id: 42 })).rejects.toThrow(
      expect.objectContaining({ code: "NOT_FOUND" }),
    );
    expect(deleteDiary).not.toHaveBeenCalled();
  });

  it("throws when id is zero (input validation)", async () => {
    await expect(caller.delete({ id: 0 })).rejects.toThrow();
    expect(findDiaryById).not.toHaveBeenCalled();
  });

  it("throws when id is negative (input validation)", async () => {
    await expect(caller.delete({ id: -1 })).rejects.toThrow();
    expect(findDiaryById).not.toHaveBeenCalled();
  });

  it("does not call deleteDiary if findDiaryById throws", async () => {
    vi.mocked(findDiaryById).mockRejectedValue(new Error("DB connection lost"));

    await expect(caller.delete({ id: 42 })).rejects.toThrow("DB connection lost");
    expect(deleteDiary).not.toHaveBeenCalled();
  });
});

describe("diaries.generationLogs", () => {
  const user = makeUser(1);
  const caller = makeCaller(makeCtx(user));

  it("returns recent generation logs for the authenticated user", async () => {
    const logs = [
      {
        id: 1,
        diaryDate: new Date("2025-01-01"),
        generationStatus: "generated",
        generatedAt: new Date(),
        generationError: null,
      },
      {
        id: 2,
        diaryDate: new Date("2025-01-02"),
        generationStatus: "failed",
        generatedAt: null,
        generationError: "模型返回格式不正确",
      },
    ];
    vi.mocked(findRecentDiaryGenerationLogs).mockResolvedValue(logs);

    const result = await caller.generationLogs({ limit: 10 });

    expect(result).toEqual(logs);
    expect(findRecentDiaryGenerationLogs).toHaveBeenCalledWith(user.id, 10);
  });

  it("uses default limit when input is omitted", async () => {
    vi.mocked(findRecentDiaryGenerationLogs).mockResolvedValue([]);

    await caller.generationLogs();

    expect(findRecentDiaryGenerationLogs).toHaveBeenCalledWith(user.id, 10);
  });
});

// ---------------------------------------------------------------------------
// Auth guard: unauthenticated caller
// ---------------------------------------------------------------------------

describe("diaries.delete — auth guard", () => {
  it("throws UNAUTHORIZED when no user in context", async () => {
    const unauthCtx: TrpcContext = {
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: undefined,
    };
    const caller = makeCaller(unauthCtx);

    await expect(caller.delete({ id: 1 })).rejects.toThrow(
      expect.objectContaining({ code: "UNAUTHORIZED" }),
    );
    expect(findDiaryById).not.toHaveBeenCalled();
  });
});
