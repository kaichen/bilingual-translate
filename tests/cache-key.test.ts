import { describe, expect, it } from "vitest";
import { buildKey, CACHE_PREFIX, type CacheKeyParams } from "../entrypoints/translate/cache-key";
import { customModelString, services } from "../entrypoints/config/option";
import { CHROME_PROMPT_VERSION } from "../entrypoints/providers/llm/chrome-prompt";

const base: CacheKeyParams = {
  service: services.deepseek,
  model: { [services.deepseek]: "deepseek-chat" },
  customModel: { [services.deepseek]: "my-model" },
  to: "zh-Hans",
  style: 1,
};

describe("buildKey — 纯缓存 key 拼接", () => {
  it("普通模型：前缀_样式_服务_模型_原文语言_目标语言_消息", () => {
    expect(buildKey("hello", base)).toBe(`${CACHE_PREFIX}_1_${services.deepseek}_deepseek-chat_auto_zh-Hans_hello`);
    expect(buildKey("hello", { ...base, sourceLanguages: ["ja", "en"] })).toBe(`${CACHE_PREFIX}_1_${services.deepseek}_deepseek-chat_en,ja_zh-Hans_hello`);
  });

  it("选择自定义模型时取 customModel", () => {
    const c: CacheKeyParams = { ...base, model: { [services.deepseek]: customModelString } };
    expect(buildKey("hello", c)).toBe(`${CACHE_PREFIX}_1_${services.deepseek}_my-model_auto_zh-Hans_hello`);
  });

  it("服务 / 样式 / 目标语言不同 → key 不同", () => {
    expect(buildKey("x", base)).not.toBe(buildKey("x", { ...base, style: 0 }));
    expect(buildKey("x", base)).not.toBe(buildKey("x", { ...base, to: "en" }));
  });

  it.each([services.deepseek, services.chromeTranslator, services.chromeGemma])("%s：原文语言列表不同 → key 不同，顺序无关", (service) => {
    const key = (sourceLanguages?: string[]) => buildKey("x", { ...base, service, sourceLanguages });
    const keys = new Set([key(), key(["en", "ja"]), key(["fr", "ko"]), key(["en"])]);
    expect(keys.size).toBe(4);
    expect(key([])).toBe(key());
    expect(key(["ja", "en"])).toBe(key(["en", "ja"]));
  });

  it("key 以 CACHE_PREFIX 起始（保证 cache.clean 能识别）", () => {
    expect(buildKey("hi", base).startsWith(CACHE_PREFIX)).toBe(true);
  });
});


describe('Chrome 引擎缓存隔离', () => {
  const native = { ...base, service: services.chromeTranslator, sourceLanguages: [] as string[] };
  it('原生翻译、大模型和旧缓存互不串用', () => {
    const translator = buildKey('hello', native);
    const prompt = buildKey('hello', { ...native, service: services.chromeGemma });
    expect(translator).not.toBe(prompt);
    expect(prompt).toContain(CHROME_PROMPT_VERSION);
    expect(translator).not.toBe(`${CACHE_PREFIX}_1_chromeTranslator__zh-Hans_hello`);
    expect(buildKey('hello', { ...native, sourceLanguages: ['ja'] })).not.toBe(translator);
  });
});
