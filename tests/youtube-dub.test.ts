import { describe, expect, it, vi } from "vitest";

vi.mock("@/entrypoints/config/config", () => ({
  config: {
    youtubeDubbing: true,
    to: "zh-Hans",
  },
}));

import { dubLangTag, dubOriginLang, estimateDubRate, pickDubVoice } from "@/entrypoints/main/youtube-dub";

const voices = (...langs: string[]) =>
  langs.map(lang => ({ lang })) as unknown as SpeechSynthesisVoice[];

describe("dubLangTag", () => {
  it("将 zh-Hans/zh-Hant 映射为 voice 标签，其余原样透传", () => {
    expect(dubLangTag("zh-Hans")).toBe("zh-CN");
    expect(dubLangTag("zh-Hant")).toBe("zh-TW");
    expect(dubLangTag("ja")).toBe("ja");
  });
});

describe("dubOriginLang", () => {
  it("识别常见语言并返回标准标签", () => {
    expect(dubOriginLang("The quick brown fox jumps over the lazy dog near the river bank")).toBe("en");
    expect(dubOriginLang("今天天气很好我们一起去公园散步然后喝杯咖啡吧")).toBe("zh-Hans");
  });

  it("未映射的三字码兜底为英语", () => {
    expect(dubOriginLang("Der schnelle braune Fuchs springt über den faulen Hund im Wald")).toBe("en");
  });
});

describe("pickDubVoice", () => {
  it("优先精确匹配完整标签", () => {
    const list = voices("zh-TW", "zh-CN", "en-US");
    expect(pickDubVoice(list, "zh-Hans")?.lang).toBe("zh-CN");
  });

  it("无精确匹配时回退到同主语言变体", () => {
    const list = voices("en-US", "zh-TW");
    expect(pickDubVoice(list, "zh-Hans")?.lang).toBe("zh-TW");
  });

  it("兼容下划线与大小写差异的 voice 标签", () => {
    const list = voices("ZH_CN");
    expect(pickDubVoice(list, "zh-Hans")?.lang).toBe("ZH_CN");
  });

  it("无可用语音时返回 undefined", () => {
    expect(pickDubVoice(voices("en-US", "ja-JP"), "zh-Hans")).toBeUndefined();
  });
});

describe("estimateDubRate", () => {
  it("短文本长窗口收敛到语速下限", () => {
    expect(estimateDubRate("好", 10_000)).toBe(0.9);
  });

  it("长文本短窗口收敛到语速上限", () => {
    expect(estimateDubRate("这是一段相当长的字幕译文内容", 1_000)).toBe(1.8);
  });

  it("刚好塞不下时按比例加速", () => {
    // 9 个汉字 ≈ 2s 朗读，塞进 1.5s → rate ≈ 1.33
    const rate = estimateDubRate("九个汉字九个汉字九", 1_500);
    expect(rate).toBeGreaterThan(1.2);
    expect(rate).toBeLessThan(1.5);
  });

  it("时长非法时回退 rate=1", () => {
    expect(estimateDubRate("anything", 0)).toBe(1);
  });
});
