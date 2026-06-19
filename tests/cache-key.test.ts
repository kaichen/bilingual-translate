import { describe, expect, it } from "vitest";
import { buildKey, CACHE_PREFIX, type CacheKeyParams } from "../entrypoints/translate/cache-key";
import { customModelString, services } from "../entrypoints/config/option";

const base: CacheKeyParams = {
  service: services.openai,
  model: { [services.openai]: "gpt-4.1-nano" },
  customModel: { [services.openai]: "my-model" },
  to: "zh-Hans",
  style: 1,
};

describe("buildKey — 纯缓存 key 拼接", () => {
  it("普通模型：前缀_样式_服务_模型_目标语言_消息", () => {
    expect(buildKey("hello", base)).toBe(`${CACHE_PREFIX}_1_${services.openai}_gpt-4.1-nano_zh-Hans_hello`);
  });

  it("选择自定义模型时取 customModel", () => {
    const c: CacheKeyParams = { ...base, model: { [services.openai]: customModelString } };
    expect(buildKey("hello", c)).toBe(`${CACHE_PREFIX}_1_${services.openai}_my-model_zh-Hans_hello`);
  });

  it("服务 / 样式 / 目标语言不同 → key 不同", () => {
    expect(buildKey("x", base)).not.toBe(buildKey("x", { ...base, style: 0 }));
    expect(buildKey("x", base)).not.toBe(buildKey("x", { ...base, to: "en" }));
  });

  it("key 以 CACHE_PREFIX 起始（保证 cache.clean 能识别）", () => {
    expect(buildKey("hi", base).startsWith(CACHE_PREFIX)).toBe(true);
  });
});
