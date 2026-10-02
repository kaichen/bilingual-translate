import { describe, expect, it } from "vitest";
import { detectTextLanguage, resolvePageLanguage, shouldSkipTranslation } from "../entrypoints/utils/common";

const EN = "This is a reasonably long English sentence used for language detection.";
const ZH = "这是一段用于语言检测测试的足够长的中文句子内容示例。";
const page = (language?: string) => () => language;

describe("detectTextLanguage — 先看文字种类，再看长度和页面语言", () => {
  it("假名、韩文一眼可辨，不受页面语言影响", () => {
    expect(detectTextLanguage("ログイン", "en")).toBe("ja");
    expect(detectTextLanguage("Chrome 154 リリースノート", "en")).toBe("ja");
    expect(detectTextLanguage("안녕하세요", "en")).toBe("ko");
  });

  it("纯汉字在日语页面按日语，其余按中文", () => {
    expect(detectTextLanguage("東京都渋谷区", "ja")).toBe("ja");
    expect(detectTextLanguage("東京都渋谷区", "en")).toBe("zh-Hans");
    expect(detectTextLanguage(ZH)).toBe("zh-Hans");
  });

  it("短的拉丁字母文本跟随页面语言；非拉丁语页面里按英语", () => {
    expect(detectTextLanguage("Subscribe to our newsletter now", "en")).toBe("en");
    expect(detectTextLanguage("Abonnez-vous", "fr")).toBe("fr");
    expect(detectTextLanguage("Sign in", "ja")).toBe("en");
    expect(detectTextLanguage("Sign in")).toBeUndefined();
  });

  it("足够长的拉丁字母文本按自身统计结果", () => {
    expect(detectTextLanguage(EN, "fr")).toBe("en");
    expect(detectTextLanguage("Bonjour tout le monde, ceci est une phrase en français assez longue.", "en")).toBe("fr");
  });

  it("西里尔字母短文本默认俄语", () => {
    expect(detectTextLanguage("Привет", "en")).toBe("ru");
  });

  it("没有文字时返回 undefined", () => {
    expect(detectTextLanguage("2024 → 100%")).toBeUndefined();
    expect(detectTextLanguage("  \n　")).toBeUndefined();
  });
});

describe("shouldSkipTranslation — 翻译前的语言闸", () => {
  it("没有文字的内容直接跳过", () => {
    expect(shouldSkipTranslation("  \n　", "zh-Hans")).toBe(true);
    expect(shouldSkipTranslation("2024", "zh-Hans")).toBe(true);
  });

  it("已是目标语言则跳过，否则翻译", () => {
    expect(shouldSkipTranslation(EN, "en", [], page())).toBe(true);
    expect(shouldSkipTranslation(`　 ${EN} 　`, "en", [], page())).toBe(true);
    expect(shouldSkipTranslation(ZH, "en", [], page())).toBe(false);
    expect(shouldSkipTranslation("Sign in", "en", [], page("en"))).toBe(true);
    expect(shouldSkipTranslation("東京都渋谷区", "zh-Hans", [], page("ja"))).toBe(false);
  });

  it("原文语言列表为空时全部翻译；非空时只翻译列表内的语言", () => {
    expect(shouldSkipTranslation(EN, "zh-Hans", [], page())).toBe(false);
    expect(shouldSkipTranslation(EN, "zh-Hans", ["en", "ja"], page())).toBe(false);
    expect(shouldSkipTranslation(EN, "zh-Hans", ["ja"], page())).toBe(true);
    expect(shouldSkipTranslation("ログイン", "zh-Hans", ["en"], page("ja"))).toBe(true);
    expect(shouldSkipTranslation("Subscribe to our newsletter now", "zh-Hans", ["en"], page("en"))).toBe(false);
  });

  it("判断不出语言时放行", () => {
    expect(shouldSkipTranslation("Sign in", "zh-Hans", ["ja"], page())).toBe(false);
  });
});

describe("resolvePageLanguage — 页面语言", () => {
  it("正文样本够长时按样本，否则用页面声明", () => {
    expect(resolvePageLanguage(ZH.repeat(10), "en")).toBe("zh-Hans");
    expect(resolvePageLanguage(EN.repeat(4), "ja")).toBe("en");
    expect(resolvePageLanguage("短", "ja-JP")).toBe("ja");
    expect(resolvePageLanguage("", "zh_CN")).toBe("zh-Hans");
    expect(resolvePageLanguage("", "")).toBeUndefined();
  });
});
