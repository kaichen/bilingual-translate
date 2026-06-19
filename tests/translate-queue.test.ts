import { describe, expect, it, beforeEach } from "vitest";
import {
  configureQueue,
  enqueueTranslation,
  canAcceptMoreTasks,
  clearTranslationQueue,
} from "../entrypoints/translate/translateQueue";

// translateQueue 不再 import config（并发上限经 configureQueue 注入）→ 可直接单测。

describe("translateQueue — 并发控制（注入 max）", () => {
  beforeEach(() => {
    clearTranslationQueue();
    configureQueue(() => 2); // 注入并发上限 2
  });

  it("注入的并发上限生效：同时活跃数不超过 2", async () => {
    let active = 0;
    let maxActive = 0;
    const task = () => new Promise<string>(resolve => {
      active++;
      maxActive = Math.max(maxActive, active);
      setTimeout(() => { active--; resolve("ok"); }, 15);
    });

    await Promise.all(Array.from({ length: 6 }, () => enqueueTranslation(task)));

    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it("透传任务结果", async () => {
    await expect(enqueueTranslation(async () => "hello")).resolves.toBe("hello");
  });

  it("任务抛错 → reject，且不卡住后续任务", async () => {
    await expect(enqueueTranslation(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    await expect(enqueueTranslation(async () => "after")).resolves.toBe("after");
  });

  it("canAcceptMoreTasks 在队列未超 max*3 时为 true", () => {
    expect(canAcceptMoreTasks()).toBe(true);
  });
});
