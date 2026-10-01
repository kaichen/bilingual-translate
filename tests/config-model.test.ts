import { afterEach, describe, expect, it, vi } from "vitest";
import { Config } from "../entrypoints/config/model";
import { defaultOption, services } from "../entrypoints/config/option";

const stored = {
    on: true,
    from: "auto",
    to: "ja",
    service: "newapi",
    display: 0,
    count: 42,
    theme: "dark",
    custom: "https://translator.example/v1/chat/completions",
    newApiUrl: "https://removed.example",
    youdaoAppKey: "removed-key",
    tencentSecretKey: "removed-secret",
    token: { newapi: "removed-token", [services.deepseek]: "saved-token" },
    model: { newapi: "old-model", [services.deepseek]: "deepseek-reasoner" },
    customModel: { newapi: "old-model", [services.custom]: "my-model" },
    proxy: { newapi: "https://removed.example", [services.openrouter]: "https://proxy.example" },
    system_role: { newapi: "old-system", [services.deepseek]: "saved-system" },
    user_role: { newapi: "old-user", [services.deepseek]: "saved-user" },
};

afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
});

describe("Config — 载入保留服务的配置", () => {
    it("旧服务回到默认服务，保留通用设置与现有服务的凭据", () => {
        const c = new Config(stored);
        expect(c.service).toBe(defaultOption.service);
        expect(c).toMatchObject({ to: "ja", display: 0, count: 42, theme: "dark", custom: stored.custom });
        expect(c.token).toEqual({ [services.deepseek]: "saved-token" });
        expect(c.model).toEqual({ [services.deepseek]: "deepseek-reasoner" });
        expect(c.customModel).toEqual({ [services.custom]: "my-model" });
        expect(c.proxy).toEqual({ [services.openrouter]: "https://proxy.example" });
        expect(c.system_role).toEqual({ [services.deepseek]: "saved-system" });
        expect(c.user_role).toEqual({ [services.deepseek]: "saved-user" });
        expect(JSON.stringify(c)).not.toMatch(/newApiUrl|newapi|youdaoAppKey|tencentSecretKey/);
    });

    it.each(Object.values(services))("已选中的 %s 保持不变", (service) => {
        expect(new Config({ ...stored, service }).service).toBe(service);
    });

    it('Chrome 引擎默认原生翻译，持久化 Prompt，非法值回到默认', () => {
        expect(new Config(stored).chromeTranslationEngine).toBe('translator');
        expect(new Config({ ...stored, chromeTranslationEngine: 'prompt' }).chromeTranslationEngine).toBe('prompt');
        expect(new Config({ ...stored, chromeTranslationEngine: 'old' } as never).chromeTranslationEngine).toBe('translator');
    });

    it("首次启动与跨上下文更新均处理旧服务配置", async () => {
        let watch: (value: string) => void = () => {};
        vi.stubGlobal("storage", {
            getItem: vi.fn().mockResolvedValue(JSON.stringify(stored)),
            setItem: vi.fn(),
            watch: vi.fn((_key, callback) => { watch = callback; }),
        });
        const { config, configReady } = await import("../entrypoints/config/config");
        await configReady;
        expect(config.service).toBe(defaultOption.service);
        expect(config.token).toEqual({ [services.deepseek]: "saved-token" });
        watch(JSON.stringify({ ...stored, service: services.openrouter, to: "en" }));
        expect(config.service).toBe(services.openrouter);
        expect(config.to).toBe("en");
        watch(JSON.stringify({ ...stored, service: "deeplx" }));
        expect(config.service).toBe(defaultOption.service);
        expect(JSON.stringify(config)).not.toContain("removed-secret");
    });
});
