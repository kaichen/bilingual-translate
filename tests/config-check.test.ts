import { describe, expect, it } from "vitest";
import { validateConfig, type ConfigCheckSnapshot } from "../entrypoints/utils/config-check";
import { services } from "../entrypoints/utils/option";

const ok: ConfigCheckSnapshot = {
  service: services.openai,
  token: { [services.openai]: "sk-xxx" },
  ak: "", sk: "",
  tencentSecretId: "", tencentSecretKey: "",
  model: { [services.openai]: "gpt-4.1-nano" },
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

  it("DeepLX 令牌可选：缺 token 仍通过", () => {
    expect(validateConfig({ ...ok, service: services.deeplx, token: {}, model: {} }).valid).toBe(true);
  });

  it("文心一言缺 AK/SK → 不通过", () => {
    expect(validateConfig({ ...ok, service: services.yiyan, model: { [services.yiyan]: "ERNIE" }, ak: "", sk: "" }).valid).toBe(false);
  });

  it("腾讯云缺密钥 → 不通过", () => {
    const r = validateConfig({ ...ok, service: services.tencent, tencentSecretId: "", tencentSecretKey: "" });
    expect(r.valid).toBe(false);
    expect(r.reason).toContain("腾讯云");
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
