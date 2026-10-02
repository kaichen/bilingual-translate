import { describe, expect, it } from "vitest";
import { validateConfig, type ConfigCheckSnapshot } from "../entrypoints/config/config-check";
import { services } from "../entrypoints/config/option";

const ok: ConfigCheckSnapshot = {
  service: services.deepseek,
  token: { [services.deepseek]: "sk-xxx" },
  model: { [services.deepseek]: "deepseek-chat" },
  customModel: {},
  display: 1,
};

describe("validateConfig — 纯配置校验（不读 config、不弹 toast）", () => {
  it("完整 AI 配置通过", () => {
    expect(validateConfig(ok)).toEqual({ valid: true });
  });

  it("缺 token → 不通过", () => {
    const r = validateConfig({ ...ok, token: {} });
    expect(r.valid).toBe(false);
    expect(r.reason).toContain("令牌");
  });

  it("已移除的服务不能通过校验", () => {
    const r = validateConfig({ ...ok, service: "deeplx" });
    expect(r.valid).toBe(false);
    expect(r.reason).toContain("重新选择");
  });

  it.each([services.microsoft, services.google, services.chromeTranslator, services.chromeGemma])("%s 不需要令牌和模型", (service) => {
    expect(validateConfig({ ...ok, service, token: {}, model: {} }).valid).toBe(true);
  });

  it("AI 服务缺模型 → 不通过", () => {
    const r = validateConfig({ ...ok, model: {} });
    expect(r.valid).toBe(false);
    expect(r.reason).toContain("模型");
  });

  it("谷歌单语模式 → 不通过", () => {
    const r = validateConfig({ ...ok, service: services.google, token: {}, model: {}, display: 0 });
    expect(r.valid).toBe(false);
    expect(r.reason).toContain("双语");
  });
});
