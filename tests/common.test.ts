import { describe, expect, it } from "vitest";
import { detectTextLanguage, resolvePageLanguage, shouldSkipTranslation } from "../entrypoints/utils/common";

const EN = "This is a reasonably long English sentence used for language detection.";
const ZH = "这是一段用于语言检测测试的足够长的中文句子内容示例。";
const page = (language?: string) => () => language;

const lang = (text: string, pageLanguage?: string) => detectTextLanguage(text, pageLanguage)?.language;
const sure = (language: string) => ({ language, certain: true });
const guess = (language: string) => ({ language, certain: false });

describe("detectTextLanguage — 先看文字种类，再看长度和页面语言", () => {
  it("假名、韩文一眼可辨，不受页面语言影响，结果确定", () => {
    expect(detectTextLanguage("ログイン", "en")).toEqual(sure("ja"));
    expect(detectTextLanguage("Chrome 154 リリースノート", "en")).toEqual(sure("ja"));
    expect(detectTextLanguage("안녕하세요", "en")).toEqual(sure("ko"));
  });

  it("纯汉字在日语页面按日语，其余按中文，结果确定", () => {
    expect(detectTextLanguage("東京都渋谷区", "ja")).toEqual(sure("ja"));
    expect(detectTextLanguage("東京都渋谷区", "en")).toEqual(sure("zh-Hans"));
    expect(lang(ZH)).toBe("zh-Hans");
  });

  it("中日韩文字按 3 倍权重：持平时算中日韩，拉丁字母多一个就算拉丁", () => {
    expect(detectTextLanguage("中abc", "en")).toEqual(sure("zh-Hans"));
    expect(detectTextLanguage("中abcd", "en")).toEqual(guess("en"));
    expect(detectTextLanguage("ログabcdef", "en")).toEqual(sure("ja"));
    expect(detectTextLanguage("한abc", "en")).toEqual(sure("ko"));
  });

  it("短的拉丁字母文本跟随页面语言（非拉丁语页面里按英语），只是猜测", () => {
    expect(detectTextLanguage("Subscribe to our newsletter now", "en")).toEqual(guess("en"));
    expect(detectTextLanguage("Abonnez-vous", "fr")).toEqual(guess("fr"));
    expect(detectTextLanguage("Sign in", "ja")).toEqual(guess("en"));
    expect(detectTextLanguage("Je ne sais pas quoi dire.", "zh-Hans")).toEqual(guess("en"));
    expect(detectTextLanguage("Sign in")).toBeUndefined();
  });

  it("足够长的拉丁字母文本按自身统计结果，结果确定", () => {
    expect(detectTextLanguage(EN, "fr")).toEqual(sure("en"));
    expect(lang("Bonjour tout le monde, ceci est une phrase en français assez longue.", "en")).toBe("fr");
  });

  it("西里尔字母：长文本走 franc，短文本按西里尔页面语言或默认俄语猜测", () => {
    expect(detectTextLanguage("Это достаточно длинное русское предложение для проверки определения языка.", "en")).toEqual(sure("ru"));
    expect(detectTextLanguage("Привет", "en")).toEqual(guess("ru"));
    expect(detectTextLanguage("Привіт", "uk")).toEqual(guess("uk"));
  });

  it("其他文字不论长短都走 franc，绝不取页面语言；认不出返回 undefined", () => {
    expect(detectTextLanguage("مرحبا بكم في موقعنا", "zh-Hans")).toEqual(sure("arb"));
    expect(detectTextLanguage("สวัสดีครับ ยินดีต้อนรับ", "zh-Hans")).toEqual(sure("tha"));
    expect(detectTextLanguage("שלום", "zh-Hans")).toBeUndefined();
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

  it("其他文字不会因页面语言被当成目标语言跳过", () => {
    expect(shouldSkipTranslation("مرحبا بكم في موقعنا", "zh-Hans", [], page("zh-Hans"))).toBe(false);
    expect(shouldSkipTranslation("สวัสดีครับ ยินดีต้อนรับ", "zh-Hans", [], page("zh-Hans"))).toBe(false);
    expect(shouldSkipTranslation("مرحبا بكم في موقعنا", "zh-Hans", ["en"], page("zh-Hans"))).toBe(true);
  });

  it("按页面语言猜的结果只用于跳过目标语言，不用于排除原文语言", () => {
    expect(shouldSkipTranslation("Je ne sais pas quoi dire.", "zh-Hans", ["fr"], page("zh-Hans"))).toBe(false);
    expect(shouldSkipTranslation("This is a short English sentence.", "zh-Hans", ["en"], page("fr"))).toBe(false);
    expect(shouldSkipTranslation("Привет", "zh-Hans", ["en"], page("en"))).toBe(false);
    expect(shouldSkipTranslation("Bonjour", "fr", ["en"], page("fr"))).toBe(true);
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
