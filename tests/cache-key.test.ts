import { describe, expect, it } from "vitest";
import { buildKey, CACHE_PREFIX, type CacheKeyParams } from "../entrypoints/translate/cache-key";
import { customModelString, services } from "../entrypoints/config/option";

const base: CacheKeyParams = {
  service: services.deepseek,
  model: { [services.deepseek]: "deepseek-chat" },
  customModel: { [services.deepseek]: "my-model" },
  to: "zh-Hans",
  style: 1,
};

describe("buildKey — 纯缓存 key 拼接", () => {
  it("普通模型：前缀_样式_服务_模型_目标语言_消息", () => {
    expect(buildKey("hello", base)).toBe(`${CACHE_PREFIX}_1_${services.deepseek}_deepseek-chat_zh-Hans_hello`);
  });

  it("选择自定义模型时取 customModel", () => {
    const c: CacheKeyParams = { ...base, model: { [services.deepseek]: customModelString } };
    expect(buildKey("hello", c)).toBe(`${CACHE_PREFIX}_1_${services.deepseek}_my-model_zh-Hans_hello`);
  });

  it("服务 / 样式 / 目标语言不同 → key 不同", () => {
    expect(buildKey("x", base)).not.toBe(buildKey("x", { ...base, style: 0 }));
    expect(buildKey("x", base)).not.toBe(buildKey("x", { ...base, to: "en" }));
  });

  it("key 以 CACHE_PREFIX 起始（保证 cache.clean 能识别）", () => {
    expect(buildKey("hi", base).startsWith(CACHE_PREFIX)).toBe(true);
  });
});


describe('Chrome 引擎缓存隔离', () => {
  const native = { ...base, service: services.chromeTranslator, from: 'auto' };
  it('原生翻译、大模型和旧缓存互不串用', () => {
    const translator = buildKey('hello', { ...native, chromeTranslationEngine: 'translator' });
    const prompt = buildKey('hello', { ...native, chromeTranslationEngine: 'prompt' });
    expect(translator).not.toBe(prompt);
    expect(prompt).toContain('prompt-v1');
    expect(translator).not.toBe(`${CACHE_PREFIX}_1_chromeTranslator__zh-Hans_hello`);
    expect(buildKey('hello', { ...native, from: 'ja' })).not.toBe(translator);
  });
});
