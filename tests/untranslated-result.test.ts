import { describe, expect, it, vi } from "vitest";
import { isUntranslatedResult } from "../entrypoints/main/dom";

vi.mock("@/entrypoints/main/trans", () => ({
  handleBtnTranslation: vi.fn(),
}));

describe("isUntranslatedResult", () => {
  it("空译文视为未翻译", () => {
    expect(isUntranslatedResult("hello", "")).toBe(true);
    expect(isUntranslatedResult("hello", "  \n")).toBe(true);
    expect(isUntranslatedResult("hello", undefined)).toBe(true);
  });
  it("与原文相同（trim 后）视为未翻译", () => {
    expect(isUntranslatedResult("你好", "你好")).toBe(true);
    expect(isUntranslatedResult(" 你好\n", "你好 ")).toBe(true);
  });
  it("不同译文视为已翻译", () => {
    expect(isUntranslatedResult("hello", "你好")).toBe(false);
  });
});
