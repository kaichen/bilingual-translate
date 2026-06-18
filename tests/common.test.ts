import { describe, expect, it } from "vitest";
import { shouldSkipTranslation, detectlang } from "../entrypoints/utils/common";

// shouldSkipTranslation 把散落 4 处的语言闸（detectlang(去空白)===目标语言）收敛为一处纯函数。
const EN = "This is a reasonably long English sentence used for language detection.";
const ZH = "这是一段用于语言检测测试的足够长的中文句子内容示例。";

describe("shouldSkipTranslation — 同语言跳过判定", () => {
  it("文本语言 == 目标语言 → 跳过（true）", () => {
    const enLang = detectlang(EN.replace(/\s/g, ""));
    expect(shouldSkipTranslation(EN, enLang)).toBe(true);
  });

  it("文本语言 != 目标语言 → 不跳过（false）", () => {
    expect(shouldSkipTranslation(ZH, "en")).toBe(false);
    const enLang = detectlang(EN.replace(/\s/g, ""));
    expect(shouldSkipTranslation(EN, `${enLang}-x`)).toBe(false);
  });

  it("去除空白（含全角空格）后再检测，不影响结果", () => {
    const enLang = detectlang(EN.replace(/\s/g, ""));
    expect(shouldSkipTranslation(`　 ${EN} 　`, enLang)).toBe(true);
  });
});
