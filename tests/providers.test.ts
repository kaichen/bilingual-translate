import { describe, expect, it } from "vitest";
import { PROVIDERS, servicesType, urls, models, type Need } from "../entrypoints/utils/providers";
import { options, services } from "../entrypoints/utils/option";

// 黄金快照：迁移前 option.ts / constant.ts 里手维护的值，逐项锁定，防派生回归。

const GOLDEN = {
    machine: [services.microsoft, services.deepL, services.deeplx, services.google, services.xiaoniu, services.youdao, services.tencent, services.chromeTranslator],
    AI: [services.openai, services.azureOpenai, services.gemini, services.yiyan, services.tongyi, services.zhipu, services.moonshot, services.claude, services.custom, services.infini, services.baichuan, services.deepseek, services.lingyi, services.minimax, services.jieyue, services.groq, services.cozecom, services.cozecn, services.huanYuan, services.huanYuanTranslation, services.doubao, services.siliconCloud, services.openrouter, services.grok, services.newapi],
    useToken: [services.openai, services.azureOpenai, services.gemini, services.tongyi, services.zhipu, services.moonshot, services.claude, services.deepL, services.deeplx, services.xiaoniu, services.infini, services.baichuan, services.deepseek, services.lingyi, services.minimax, services.jieyue, services.groq, services.custom, services.cozecom, services.cozecn, services.huanYuan, services.doubao, services.siliconCloud, services.openrouter, services.grok, services.newapi],
    useModel: [services.openai, services.azureOpenai, services.gemini, services.yiyan, services.tongyi, services.zhipu, services.moonshot, services.claude, services.custom, services.infini, services.baichuan, services.deepseek, services.lingyi, services.minimax, services.jieyue, services.groq, services.huanYuan, services.huanYuanTranslation, services.doubao, services.siliconCloud, services.openrouter, services.grok, services.newapi],
    useProxy: [services.openai, services.azureOpenai, services.gemini, services.claude, services.google, services.deepL, services.deeplx, services.moonshot, services.tongyi, services.xiaoniu, services.youdao, services.tencent, services.baichuan, services.deepseek, services.lingyi, services.jieyue, services.groq, services.cozecom, services.cozecn, services.huanYuan, services.huanYuanTranslation, services.doubao, services.siliconCloud, services.openrouter, services.grok],
    useCustomUrl: [services.custom, services.deeplx, services.newapi, services.azureOpenai],
};

// 迁移前 constant.urls 的全部静态字符串键（yiyan 的 {tokenUrl} 对象已下放，不在此）。
const GOLDEN_URL_KEYS = [
    services.deepL, services.deeplx, services.openai, services.azureOpenai, services.moonshot, services.custom,
    services.tongyi, services.zhipu, services.xiaoniu, services.youdao, services.tencent, services.claude,
    services.baichuan, services.lingyi, services.deepseek, services.jieyue, services.groq, services.cozecom,
    services.cozecn, services.huanYuan, services.huanYuanTranslation, services.doubao, services.siliconCloud,
    services.openrouter, services.grok,
];

// 迁移前 option.models 的全部键。
const GOLDEN_MODEL_KEYS = [
    services.openai, services.azureOpenai, services.gemini, services.yiyan, services.tongyi, services.zhipu,
    services.moonshot, services.claude, services.custom, services.infini, services.baichuan, services.lingyi,
    services.deepseek, services.minimax, services.jieyue, services.huanYuan, services.huanYuanTranslation,
    services.newapi, services.grok, services.doubao, services.siliconCloud, services.groq, services.openrouter,
];

const NEED_VOCAB: Need[] = ["token", "model", "proxy", "customUrl", "aksk", "youdaoKey", "tencentSecret", "azureEndpoint", "robotId", "newApiUrl"];

describe("providers — 派生 servicesType 与黄金快照一致", () => {
    for (const [key, expected] of Object.entries(GOLDEN)) {
        it(`servicesType.${key}`, () => {
            expect(servicesType[key as keyof typeof GOLDEN]).toEqual(new Set(expected));
        });
    }
});

describe("providers — 派生 urls / models 键集一致", () => {
    it("urls 键集与迁移前相同", () => {
        expect(new Set(Object.keys(urls))).toEqual(new Set(GOLDEN_URL_KEYS));
    });
    it("models 键集与迁移前相同", () => {
        expect(new Set(models.keys())).toEqual(new Set(GOLDEN_MODEL_KEYS));
    });
});

describe("providers — 单一真相源不变量", () => {
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
