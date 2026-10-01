import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Config } from "../entrypoints/config/model";
import { customModelString, services } from "../entrypoints/config/option";
import { PROVIDERS, urls } from "../entrypoints/providers/registry";

vi.mock("@/entrypoints/config/config", async () => {
    const { Config } = await import("../entrypoints/config/model");
    return { config: new Config() };
});

import { config } from "../entrypoints/config/config";
import { _service } from "../entrypoints/providers/service";

const fetchMock = vi.fn();

beforeEach(() => {
    Object.assign(config, new Config());
    fetchMock.mockReset().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "<think>推理</think>译文" } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("provider 分发与请求", () => {
    it("注册表每个保留服务都接线，已删除服务不能调用", () => {
        expect(Object.keys(_service).sort()).toEqual(PROVIDERS.map((p) => p.name).sort());
        for (const provider of PROVIDERS) expect(_service[provider.name]).toBeTypeOf("function");
        expect(_service.newapi).toBeUndefined();
        expect(_service.deeplx).toBeUndefined();
    });

    it.each(["deepseek-chat", "deepseek-reasoner"])("DeepSeek %s 保持对应请求格式", async (model) => {
        config.service = services.deepseek;
        config.token[config.service] = "test-token";
        config.model[config.service] = model;
        expect(await _service[config.service]({ origin: "Hello" })).toBe("译文");
        const [url, request] = fetchMock.mock.calls[0];
        expect(url).toBe(urls[services.deepseek]);
        expect(request.headers.Authorization).toBe("Bearer test-token");
        const body = JSON.parse(request.body);
        expect(body.model).toBe(model);
        expect(body.messages[1].content).toContain("Hello");
        if (model === "deepseek-reasoner") expect(body).not.toHaveProperty("temperature");
        else expect(body.temperature).toBe(0.7);
    });

    it("OpenRouter 保留标题头、代理地址和自定义模型", async () => {
        config.service = services.openrouter;
        config.token[config.service] = "test-token";
        config.model[config.service] = customModelString;
        config.customModel[config.service] = "provider/model";
        config.proxy[config.service] = "https://proxy.example/v1/chat/completions";
        await _service[config.service]({ origin: "Hello" });
        const [url, request] = fetchMock.mock.calls[0];
        expect(url).toBe(config.proxy[config.service]);
        expect(request.headers["X-Title"]).toBe("bilingual translate");
        expect(JSON.parse(request.body).model).toBe("provider/model");
    });

    it("自定义接口使用配置的 URL 和模型", async () => {
        config.service = services.custom;
        config.custom = "https://custom.example/v1/chat/completions";
        config.token[config.service] = "test-token";
        config.model[config.service] = customModelString;
        config.customModel[config.service] = "local-model";
        await _service[config.service]({ origin: "Hello" });
        const [url, request] = fetchMock.mock.calls[0];
        expect(url).toBe(config.custom);
        expect(JSON.parse(request.body).model).toBe("local-model");
    });
});
