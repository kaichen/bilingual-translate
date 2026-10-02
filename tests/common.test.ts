import { describe, expect, it } from "vitest";
import { shouldSkipTranslation, detectlang, isSourceLanguageAllowed, resolvePageLanguage } from "../entrypoints/utils/common";

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

describe("原文语言列表 — 只翻译勾选的语言", () => {
  it("列表为空时全部放行", () => {
    expect(isSourceLanguageAllowed(EN, [])).toBe(true);
    expect(shouldSkipTranslation(EN, "zh-Hans", [])).toBe(false);
  });

  it("在列表内放行，不在列表内跳过", () => {
    expect(isSourceLanguageAllowed(EN, ["en", "ja"])).toBe(true);
    expect(isSourceLanguageAllowed(EN, ["ja"])).toBe(false);
    expect(shouldSkipTranslation(EN, "zh-Hans", ["ja"])).toBe(true);
  });

  it("短文本按页面语言判断；页面语言未知时放行", () => {
    expect(isSourceLanguageAllowed("ログイン", ["en"], () => "ja")).toBe(false);
    expect(isSourceLanguageAllowed("ログイン", ["ja"], () => "ja")).toBe(true);
    expect(isSourceLanguageAllowed("Sign in", ["ja"], () => undefined)).toBe(true);
  });

  it("长文本按自身语言判断，不受页面语言影响", () => {
    expect(isSourceLanguageAllowed(EN, ["en"], () => "ja")).toBe(true);
  });

  it("空白文本直接跳过", () => {
    expect(shouldSkipTranslation("  \n　", "zh-Hans")).toBe(true);
  });

  it("页面语言优先用正文样本，样本太短时用页面声明", () => {
    expect(resolvePageLanguage(ZH.repeat(10), "en")).toBe("zh-Hans");
    expect(resolvePageLanguage("短", "ja-JP")).toBe("ja");
    expect(resolvePageLanguage("", "zh_CN")).toBe("zh-Hans");
    expect(resolvePageLanguage("", "")).toBeUndefined();
  });
});
