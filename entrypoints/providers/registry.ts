import { customModelString, services } from "../config/option";

// Provider 注册表：每个翻译服务一条记录的单一真相源。
// servicesType / urls / models 全部由 PROVIDERS 派生，不再手工并列维护。
// 详见 CONTEXT.md。本模块是纯数据，不 import 任何 service 实现，故可在 vitest 下直接测试。

export type ProviderKind = "machine" | "ai";

// 能力词表：一个 Provider 需要哪些配置字段。取代散落的 servicesType Set 与硬编码服务名谓词。
export type Need =
    | "token"
    | "model"
    | "proxy"
    | "customUrl"
    | "nativeAI";

export interface Provider {
    name: string;
    kind: ProviderKind;
    url?: string;        // 仅静态翻译 endpoint；动态拼接 / 无 fetch 的服务留空
    models?: string[];
    needs: Need[];
}

export const PROVIDERS: Provider[] = [
    // 传统机器翻译
    {name: services.microsoft, kind: "machine", needs: []},
    {name: services.google, kind: "machine", needs: ["proxy"]},
    {name: services.chromeTranslator, kind: "machine", needs: ["nativeAI"]},

    // 大模型翻译
    {name: services.custom, kind: "ai", url: "https://localhost:11434/v1/chat/completions", models: ["gpt-5-nano", "gpt-5-mini", "gpt5", "gpt-4o", "gemma:7b", "llama2:7b", "mistral:7b", customModelString], needs: ["token", "model", "customUrl"]},
    {name: services.deepseek, kind: "ai", url: "https://api.deepseek.com/chat/completions", models: ["deepseek-chat", "deepseek-reasoner", customModelString], needs: ["token", "model", "proxy"]},
    {name: services.openrouter, kind: "ai", url: "https://openrouter.ai/api/v1/chat/completions", models: ["meta-llama/llama-3.1-8b-instruct", "google/gemini-2.0-flash-exp", "qwen/qwen-2-7b-instruct", "huggingfaceh4/zephyr-7b-beta", customModelString], needs: ["token", "model", "proxy"]},
];

const byName = new Map<string, Provider>(PROVIDERS.map((p) => [p.name, p]));

export const providerOf = (name: string): Provider | undefined => byName.get(name);

// 派生视图：以下全部从 PROVIDERS 计算得出 ----------------------------------

const setOf = (pred: (p: Provider) => boolean): Set<string> =>
    new Set(PROVIDERS.filter(pred).map((p) => p.name));

const needs = (n: Need) => (p: Provider) => p.needs.includes(n);

export const servicesType = {
    machine: setOf((p) => p.kind === "machine"),
    AI: setOf((p) => p.kind === "ai"),
    useToken: setOf(needs("token")),
    useModel: setOf(needs("model")),
    useProxy: setOf(needs("proxy")),
    useCustomUrl: setOf(needs("customUrl")),

    isNativeAI: (service: string) => !!providerOf(service)?.needs.includes("nativeAI"),
    isMachine: (service: string) => servicesType.machine.has(service),
    isAI: (service: string) => servicesType.AI.has(service),
    isUseToken: (service: string) => servicesType.useToken.has(service),
    isUseProxy: (service: string) => servicesType.useProxy.has(service),
    isUseModel: (service: string) => servicesType.useModel.has(service),
};

export const urls: Record<string, string> = Object.fromEntries(
    PROVIDERS.filter((p) => p.url).map((p) => [p.name, p.url!]),
);

export const models = new Map<string, string[]>(
    PROVIDERS.filter((p) => p.models).map((p) => [p.name, p.models!]),
);
