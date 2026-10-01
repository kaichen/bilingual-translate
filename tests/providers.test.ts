import { describe, expect, it } from "vitest";
import { PROVIDERS, servicesType, urls, models, type Need } from "@/entrypoints/providers/registry";
import { options, services } from "../entrypoints/config/option";

// 锁定保留服务及其配置能力。
const GOLDEN = {
    machine: [services.microsoft, services.google, services.chromeTranslator],
    AI: [services.custom, services.deepseek, services.openrouter],
    useToken: [services.custom, services.deepseek, services.openrouter],
    useModel: [services.custom, services.deepseek, services.openrouter],
    useProxy: [services.google, services.deepseek, services.openrouter],
    useCustomUrl: [services.custom],
};

const GOLDEN_URL_KEYS = [services.custom, services.deepseek, services.openrouter];
const GOLDEN_MODEL_KEYS = [services.custom, services.deepseek, services.openrouter];
const NEED_VOCAB: Need[] = ["token", "model", "proxy", "customUrl", "nativeAI"];

describe("providers — 派生 servicesType 与黄金快照一致", () => {
    for (const [key, expected] of Object.entries(GOLDEN)) {
        it(`servicesType.${key}`, () => {
            expect(servicesType[key as keyof typeof GOLDEN]).toEqual(new Set(expected));
        });
    }
});

describe("providers — 派生 urls / models 键集一致", () => {
    it("urls 仅包含保留服务", () => {
        expect(new Set(Object.keys(urls))).toEqual(new Set(GOLDEN_URL_KEYS));
    });
    it("models 仅包含保留服务", () => {
        expect(new Set(models.keys())).toEqual(new Set(GOLDEN_MODEL_KEYS));
    });
});

describe("providers — 单一真相源不变量", () => {
    it("服务常量只包含六个保留服务", () => {
        expect(Object.values(services).sort()).toEqual([
            "microsoft", "google", "chromeTranslator", "custom", "deepseek", "openrouter",
        ].sort());
        expect(new Set(Object.values(services))).toEqual(new Set(PROVIDERS.map((p) => p.name)));
    });

    it("每个 needs 词都在词表内", () => {
        for (const p of PROVIDERS) {
            for (const n of p.needs) expect(NEED_VOCAB).toContain(n);
        }
    });

    it("provider name 无重复", () => {
        const names = PROVIDERS.map((p) => p.name);
        expect(names.length).toBe(new Set(names).size);
    });

    it("下拉 options.services 的 value 集 == PROVIDERS.name 集", () => {
        const dropdown = options.services.filter((o) => !(o as any).disabled).map((o) => o.value);
        expect(new Set(dropdown)).toEqual(new Set(PROVIDERS.map((p) => p.name)));
    });
});
