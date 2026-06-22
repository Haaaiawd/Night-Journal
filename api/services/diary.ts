import { format } from "date-fns";
import { callChatModel } from "../lib/openai";
import { findEntriesByDate, updateEntry } from "../queries/entries";
import { findAiSettingsByUserId } from "../queries/ai-settings";
import { findDiaryByDate, updateDiary } from "../queries/diaries";
import { findProfileByUserId, findActiveShortTermMemories } from "../queries/memories";
import { dreamProfile } from "./dream";
import type { ShortTermMemory } from "@db/schema";

// In-process guard: prevents the same (userId, date) Dream pass from
// running twice concurrently — e.g. when regenerate + scheduler both
// trigger generateDiaryForDate in the same tick. Entries are cleared in
// the .finally() so a failed Dream pass can be retried on the next
// diary generation.
const dreamInFlight = new Set<string>();

const DEFAULT_DIARY_PROMPT = `你是一个私人日记整理助手。你的任务不是写总结、不是写任务清单、不是写公众号文章，而是根据用户一天中零散留下的文字、情绪、经历和图片概要，整理成一篇自然、有情绪、有生活质感的日记。

请遵守：
1. 不要虚构重大事件
2. 可以基于用户表达进行轻微文学化整理，但不能改变事实
3. 不要进行心理诊断
4. 不要用"你应该""你必须"说教
5. 不要写成鸡汤
6. 不要写成公众号文章
7. 不要写成工作总结
8. 不要过度积极
9. 不要过度美化痛苦
10. 不要制造不存在的人际关系
11. 信息少时就写短一点，不要硬凑
12. 保留用户原本的语气、混乱感和情绪纹理
13. 日记要像用户自己写的，但更完整、更清晰、更有流动感
14. 图片概要可以融入正文，但不要在正文中插入图片链接
15. 正文结尾可以留一句轻微的余味，但不要鸡汤

日记长度：
- 短：300到500字
- 中：700到1000字
- 长：1200到1800字

输出 JSON：
{
  "title": "日记标题",
  "summary": "一句话摘要",
  "content": "完整日记正文"
}`;

const DEFAULT_STYLE_PROMPTS: Record<string, string> = {
  温柔真实:
    "像朋友间的轻声倾诉，语气温柔但真实。不刻意渲染情绪，让日常细节自然流露。多用短句，偶尔停下来，像在想什么事情。",
  文学感:
    "用细腻的文学化语言，可以有比喻和意象。句式错落有致，注重画面感和节奏感。允许适度的文学化加工，但不能改变事实。",
  克制冷静:
    "简洁、客观、观察者的视角。少用形容词，让事实本身说话。情绪藏在留白和沉默里，不直接说出来。",
  情绪充沛:
    "允许情感饱满地流露，可以直抒胸臆。不用克制，但不要无病呻吟。情绪是真实的，就让它出来。",
  像写给未来的自己:
    "以时间胶囊的口吻叙述，像在跟未来的自己对话。可以带有回顾和期许，但不要说教。把今天留给未来的自己去读。",
  清醒但不冷漠:
    "理性中带着温度。有观察有思考，但不冷硬。保持对生活的善意，看清楚了依然温柔。",
};

function getStylePrompt(style: string, stylePromptsJson?: string | null): string {
  if (stylePromptsJson) {
    try {
      const parsed = JSON.parse(stylePromptsJson) as Record<string, string>;
      if (parsed[style]) return parsed[style];
    } catch {
      // ignore invalid JSON
    }
  }
  return DEFAULT_STYLE_PROMPTS[style] ?? "";
}

function buildDiaryUserMessage(opts: {
  date: string;
  language: string;
  style: string;
  length: string;
  stylePrompt: string;
  fragments: Array<{
    contentText: string;
    moodLabel: string | null;
    createdAt: Date;
    attachments?: Array<{ visionSummary: string | null }>;
  }>;
  memory?: {
    profileSummary: string | null;
    languageStyle: string | null;
    shortTermMemories: ShortTermMemory[];
  } | null;
}): string {
  const { date, language, style, length, stylePrompt, fragments, memory } = opts;

  const fragmentDescriptions = fragments
    .map((f, i) => {
      const time = format(new Date(f.createdAt), "HH:mm");
      const mood = f.moodLabel ? ` [${f.moodLabel}]` : "";
      const imageSummaries =
        f.attachments
          ?.filter((a) => a.visionSummary)
          .map((a) => `图片概要：${a.visionSummary}`)
          .join("\n") ?? "";
      return `${i + 1}. ${time}${mood}\n${f.contentText}${imageSummaries ? "\n" + imageSummaries : ""}`;
    })
    .join("\n\n");

  const allImageSummaries = fragments
    .flatMap((f) => f.attachments?.filter((a) => a.visionSummary).map((a) => a.visionSummary) ?? [])
    .filter((s): s is string => !!s);

  // Dream memory block — injected only when a profile exists. The wording
  // explicitly tells the model NOT to restate these facts; they are
  // background understanding for continuity, not material to narrate.
  let memoryBlock = "";
  if (memory && (memory.profileSummary || memory.shortTermMemories.length > 0)) {
    const lines: string[] = [];
    if (memory.profileSummary) {
      lines.push(`对这个用户的理解：${memory.profileSummary}`);
    }
    if (memory.languageStyle) {
      lines.push(`语风参考：${memory.languageStyle}`);
    }
    if (memory.shortTermMemories.length > 0) {
      const memLines = memory.shortTermMemories
        .map((m) => `- [${m.category}] ${m.content}`)
        .join("\n");
      lines.push(`近期状态：\n${memLines}`);
    }
    memoryBlock = `\n你对这个用户的了解（用于保持日记的连续性，不要直接复述或罗列，自然融入即可）：\n${lines.join("\n")}\n`;
  }

  return `日期：${date}
语言：${language}
日记风格：${style}
风格说明：${stylePrompt}
日记长度：${length}
${memoryBlock}
今日碎片：
${fragmentDescriptions}

图片摘要汇总：
${allImageSummaries.length > 0 ? allImageSummaries.join("\n") : "无"}

请根据以上素材生成日记。`;
}

function parseDiaryResponse(
  content: string,
): { title: string; summary: string; content: string } | null {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : content;
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
    const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
    const diaryContent = typeof parsed.content === "string" ? parsed.content.trim() : "";
    if (!title || !diaryContent) return null;
    return { title, summary, content: diaryContent };
  } catch (err) {
    console.error("[diary] Failed to parse JSON response:", err);
    return null;
  }
}

export async function generateDiaryForDate(userId: number, date: string): Promise<void> {
  const settings = await findAiSettingsByUserId(userId);
  if (!settings || !settings.diaryApiKey || !settings.diaryApiBaseUrl) {
    throw new Error("Diary model not configured");
  }

  const diary = await findDiaryByDate(userId, date);
  if (!diary) {
    throw new Error("Diary not found");
  }
  if (diary.manuallyEdited) {
    console.log(`[diary] Diary ${diary.id} was manually edited, skipping generation`);
    return;
  }

  try {
    const entries = await findEntriesByDate(userId, date);
    if (entries.length === 0) {
      throw new Error("No entries for this date");
    }

    const style = settings.diaryStyle ?? "温柔真实";
    const length = settings.diaryLength ?? "中";
    const language = settings.diaryLanguage ?? "zh";
    const stylePrompt = getStylePrompt(style, settings.stylePrompts);
    const promptTemplate = settings.diaryPromptTemplate || DEFAULT_DIARY_PROMPT;

    // Load Dream memory (profile + active short-term memories) for prompt
    // injection. Skipped when the user has disabled Dream or no profile
    // exists yet — both resolve to a null memory block.
    let memory: {
      profileSummary: string | null;
      languageStyle: string | null;
      shortTermMemories: ShortTermMemory[];
    } | null = null;
    if (settings.enableDream !== false) {
      const [profile, shortTermMemories] = await Promise.all([
        findProfileByUserId(userId),
        findActiveShortTermMemories(userId, 5),
      ]);
      if (profile || shortTermMemories.length > 0) {
        memory = {
          profileSummary: profile?.summary ?? null,
          languageStyle: profile?.languageStyle ?? null,
          shortTermMemories,
        };
      }
    }

    const userMessage = buildDiaryUserMessage({
      date,
      language,
      style,
      length,
      stylePrompt,
      fragments: entries,
      memory,
    });

    const content = await callChatModel({
      apiKey: settings.diaryApiKey,
      baseUrl: settings.diaryApiBaseUrl,
      model: settings.diaryModel ?? undefined,
      messages: [
        { role: "system", content: promptTemplate },
        { role: "user", content: userMessage },
      ],
      maxTokens: 2048,
      temperature: 0.7,
      timeoutMs: 120_000,
    });

    const parsed = parseDiaryResponse(content);
    if (!parsed) {
      throw new Error("Failed to parse diary response");
    }

    await updateDiary(userId, diary.id, {
      title: parsed.title,
      summary: parsed.summary,
      content: parsed.content,
      style,
      length,
      diaryModelUsed: settings.diaryModel ?? "default",
      generationStatus: "generated",
      generatedAt: new Date(),
      manuallyEdited: false,
    });

    // Trigger an async Dream pass to update the user profile based on the
    // newly generated diary + recent history. Fire-and-forget: never blocks
    // or fails the diary generation. Skipped when the user disabled Dream.
    // The in-process guard prevents duplicate Dream passes for the same
    // (userId, date) when regenerate + scheduler race in the same tick.
    if (settings.enableDream !== false) {
      const dreamKey = `${userId}:${date}`;
      if (!dreamInFlight.has(dreamKey)) {
        dreamInFlight.add(dreamKey);
        dreamProfile(userId, date)
          .catch((err) => {
            console.error(`[diary] Dream pass failed for user ${userId} date ${date}:`, err);
          })
          .finally(() => {
            dreamInFlight.delete(dreamKey);
          });
      }
    }

    // Mark entries as included (non-critical)
    try {
      for (const entry of entries) {
        if (!entry.includedInDiary) {
          await updateEntry(userId, entry.id, { includedInDiary: true });
        }
      }
    } catch (err) {
      console.error("[diary] Failed to mark entries as included:", err);
    }
  } catch (err) {
    console.error(`[diary] Generation failed for user ${userId} date ${date}:`, err);
    if (diary.generationStatus === "pending") {
      await updateDiary(userId, diary.id, { generationStatus: "failed" });
    }
    throw err;
  }
}
