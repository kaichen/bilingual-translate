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
    | "aksk"
    | "youdaoKey"
    | "tencentSecret"
    | "azureEndpoint"
    | "robotId"
    | "newApiUrl";

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
    {name: services.deepL, kind: "machine", url: "https://api-free.deepl.com/v2/translate", needs: ["token", "proxy"]},
    {name: services.deeplx, kind: "machine", url: "http://localhost:1188/translate", needs: ["token", "proxy", "customUrl"]},
    {name: services.google, kind: "machine", needs: ["proxy"]},
    {name: services.xiaoniu, kind: "machine", url: "https://api.niutrans.com/NiuTransServer/translationXML", needs: ["token", "proxy"]},
    {name: services.youdao, kind: "machine", url: "https://openapi.youdao.com/api", needs: ["youdaoKey", "proxy"]},
    {name: services.tencent, kind: "machine", url: "https://tmt.tencentcloudapi.com/", needs: ["tencentSecret", "proxy"]},
    {name: services.chromeTranslator, kind: "machine", needs: []},

    // 大模型翻译
    {name: services.openai, kind: "ai", url: "https://api.openai.com/v1/chat/completions", models: ["gpt-5-nano", "gpt-5-mini", "gpt5", "gpt-5-chat-latest", "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano", "gpt-4o-mini", "gpt-4o", "o3", "o3-mini", customModelString], needs: ["token", "model", "proxy"]},
    {name: services.azureOpenai, kind: "ai", url: "https://your-resource-name.openai.azure.com/openai/deployments/your-deployment-name/chat/completions?api-version=2024-02-15-preview", models: ["gpt-5-nano", "gpt-5-mini", "gpt5", "gpt-5-chat-latest", "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano", "gpt-4o-mini", "gpt-4o", "o3", "o3-mini", customModelString], needs: ["token", "model", "proxy", "customUrl", "azureEndpoint"]},
    {name: services.gemini, kind: "ai", models: ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.5-pro", customModelString], needs: ["token", "model", "proxy"]},
    {name: services.yiyan, kind: "ai", models: ["ERNIE-Bot 4.0", "ERNIE-Bot", "ERNIE-Speed-8K"], needs: ["aksk", "model"]},
    {name: services.tongyi, kind: "ai", url: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", models: ["qwen-long", "qwen-turbo", "qwen-plus", "qwen3-8b", "qwen-mt-plus", "qwen-mt-turbo", customModelString], needs: ["token", "model", "proxy"]},
    {name: services.zhipu, kind: "ai", url: "https://open.bigmodel.cn/api/paas/v4/chat/completions", models: ["glm-4.5", "GLM-4-Flash", "glm-4-plus", "glm-4", "glm-4v", customModelString], needs: ["token", "model"]},
    {name: services.moonshot, kind: "ai", url: "https://api.moonshot.cn/v1/chat/completions", models: ["kimi-k2-0711-preview", "kimi-k2-turbo-preview", "moonshot-v1-auto", "moonshot-v1-8k", "moonshot-v1-32k", customModelString], needs: ["token", "model", "proxy"]},
    {name: services.claude, kind: "ai", url: "https://api.anthropic.com/v1/messages", models: ["claude-sonnet-4-0", "claude-opus-4-1", "claude-3-5-haiku-latest"], needs: ["token", "model", "proxy"]},
    {name: services.custom, kind: "ai", url: "https://localhost:11434/v1/chat/completions", models: ["gpt-5-nano", "gpt-5-mini", "gpt5", "gpt-4o", "gemma:7b", "llama2:7b", "mistral:7b", customModelString], needs: ["token", "model", "customUrl"]},
    {name: services.infini, kind: "ai", models: ["llama-2-13b-chat", "llama-3.3-70b-instruct", "qwen2.5-14b-instruct", "gemma-2-27b-it", "glm-4-9b-chat", customModelString], needs: ["token", "model"]},
    {name: services.baichuan, kind: "ai", url: "https://api.baichuan-ai.com/v1/chat/completions", models: ["Baichuan4-Air", "Baichuan4-Turbo", "Baichuan4", customModelString], needs: ["token", "model", "proxy"]},
    {name: services.lingyi, kind: "ai", url: "https://api.lingyiwanwu.com/v1/chat/completions", models: ["yi-lightning", customModelString], needs: ["token", "model", "proxy"]},
    {name: services.deepseek, kind: "ai", url: "https://api.deepseek.com/chat/completions", models: ["deepseek-chat", "deepseek-reasoner", customModelString], needs: ["token", "model", "proxy"]},
    {name: services.minimax, kind: "ai", models: ["chatcompletion_v2"], needs: ["token", "model"]},
    {name: services.jieyue, kind: "ai", url: "https://api.stepfun.com/v1/chat/completions", models: ["step-1-8k", customModelString], needs: ["token", "model", "proxy"]},
    {name: services.groq, kind: "ai", url: "https://api.groq.com/openai/v1/chat/completions", models: ["llama-3.1-8b-instant", "llama3-8b-8192", "llama-3.3-70b-versatile", "gemma2-9b-it", "mixtral-8x7b-32768", "whisper-large-v3", customModelString], needs: ["token", "model", "proxy"]},
    {name: services.cozecom, kind: "ai", url: "https://api.coze.com/open_api/v2/chat", needs: ["token", "proxy", "robotId"]},
    {name: services.cozecn, kind: "ai", url: "https://api.coze.cn/open_api/v2/chat", needs: ["token", "proxy", "robotId"]},
    {name: services.huanYuan, kind: "ai", url: "https://api.hunyuan.cloud.tencent.com/v1/chat/completions", models: ["hunyuan-turbos-latest", "hunyuan-t1-latest", "hunyuan-a13b", "hunyuan-lite", "hunyuan-standard", customModelString], needs: ["token", "model", "proxy"]},
    {name: services.huanYuanTranslation, kind: "ai", url: "https://hunyuan.tencentcloudapi.com/", models: ["hunyuan-translation", "hunyuan-translation-lite", customModelString], needs: ["tencentSecret", "model", "proxy"]},
    {name: services.doubao, kind: "ai", url: "https://ark.cn-beijing.volces.com/api/v3/chat/completions", models: [customModelString], needs: ["token", "model", "proxy"]},
    {name: services.siliconCloud, kind: "ai", url: "https://api.siliconflow.cn/v1/chat/completions", models: ["Qwen/Qwen3-Coder-30B-A3B-Instruct", "Qwen/Qwen3-8B", "THUDM/GLM-Z1-9B-0414", "THUDM/GLM-4-9B-0414", "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B", "deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B", "Qwen/Qwen2.5-7B-Instruct", "internlm/internlm2_5-7b-chat", "THUDM/glm-4-9b-chat", customModelString], needs: ["token", "model", "proxy"]},
    {name: services.openrouter, kind: "ai", url: "https://openrouter.ai/api/v1/chat/completions", models: ["meta-llama/llama-3.1-8b-instruct", "google/gemini-2.0-flash-exp", "qwen/qwen-2-7b-instruct", "huggingfaceh4/zephyr-7b-beta", customModelString], needs: ["token", "model", "proxy"]},
    {name: services.grok, kind: "ai", url: "https://api.x.ai/v1/chat/completions", models: ["grok-4-0709", "grok-3-mini", customModelString], needs: ["token", "model", "proxy"]},
    {name: services.newapi, kind: "ai", models: ["gemini-2.5-flash-lite", "gemini-2.0-flash", "gpt-5-nano", "gpt-5-mini", "gpt5", "gpt-4.1-mini", "gpt-4.1-nano", "gpt-4o-mini", customModelString], needs: ["token", "model", "customUrl", "newApiUrl"]},
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
