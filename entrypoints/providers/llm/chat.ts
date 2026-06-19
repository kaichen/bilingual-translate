// AI chat-completion adapter：统一 fetch / 错误处理 / contentPostHandler。
// per-provider 变化点收敛为两段生命周期钩子 onRequest / onResponse，全缺省即 OpenAI 兼容。
// 详见 CONTEXT.md。本模块是 dispatch 脏层（import config），不追求单测。
import { method } from "../../utils/constant";
import { urls } from "@/entrypoints/providers/registry";
import { customModelString, services } from "../../config/option";
import { config } from "@/entrypoints/config/config";
import {
    claudeMsgTemplate,
    commonMsgTemplate,
    cozeTemplate,
    deepseekMsgTemplate,
    geminiMsgTemplate,
    minimaxTemplate,
    tongyiMsgTemplate,
} from "./template";

export interface RequestParts {
    url: string;
    headers: HeadersInit;
    body: string;
}

export interface ChatHooks {
    onRequest?: (message: any) => RequestParts | Promise<RequestParts>;
    onResponse?: (json: any) => string;
}

// 当前服务的当前模型，处理「自定义模型」哨兵
const activeModel = (service: string) =>
    config.model[service] === customModelString ? config.customModel[service] : config.model[service];

const proxyOr = (fallback: string) => config.proxy[config.service] || fallback;

const bearerHeaders = (token: string): HeadersInit => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
});

// OpenAI 兼容缺省：Bearer token + proxy‖urls[name] + commonMsgTemplate
export const openaiRequest = (message: any): RequestParts => ({
    url: proxyOr(urls[config.service]),
    headers: bearerHeaders(config.token[config.service]),
    body: commonMsgTemplate(message.origin),
});
export const openaiResponse = (json: any): string => json.choices[0].message.content;

// 剥离 <think>…</think> 推理段（response 后处理）
function contentPostHandler(text: string): string {
    return text.replace(/^<think>[\s\S]*?<\/think>/, "");
}

// adapter：拥有 transport + 错误 + contentPostHandler；变化点全走 hooks
export async function chatCompletion(hooks: ChatHooks, message: any): Promise<string> {
    const { url, headers, body } = await (hooks.onRequest ?? openaiRequest)(message);

    const resp = await fetch(url, { method: method.POST, headers, body });

    if (!resp.ok) {
        throw new Error(`翻译失败: ${resp.status} ${resp.statusText} body: ${await resp.text()}`);
    }

    return contentPostHandler((hooks.onResponse ?? openaiResponse)(await resp.json()));
}

// 把 hooks 包成一个 ServiceFunction
const chat = (hooks: ChatHooks = {}) => (message: any) => chatCompletion(hooks, message);

// 走 adapter 的 provider 集合（zhipu/yiyan 因带重辅助逻辑保留独立文件） -------------

export const chatServices: Record<string, (message: any) => Promise<any>> = {
    // 纯 OpenAI 兼容：全缺省
    [services.openai]: chat(),
    [services.moonshot]: chat(),
    [services.baichuan]: chat(),
    [services.lingyi]: chat(),
    [services.jieyue]: chat(),
    [services.groq]: chat(),
    [services.huanYuan]: chat(),
    [services.doubao]: chat(),
    [services.siliconCloud]: chat(),
    [services.grok]: chat(),

    // OpenRouter：附加 X-Title 头
    [services.openrouter]: chat({
        onRequest: (m) => ({
            ...openaiRequest(m),
            headers: { ...bearerHeaders(config.token[config.service]), "X-Title": "bilingual translate" },
        }),
    }),

    // DeepSeek：deepseek-reasoner 不带 temperature
    [services.deepseek]: chat({ onRequest: (m) => ({ ...openaiRequest(m), body: deepseekMsgTemplate(m.origin) }) }),

    // 通义：qwen-mt 系列特殊请求体
    [services.tongyi]: chat({ onRequest: (m) => ({ ...openaiRequest(m), body: tongyiMsgTemplate(m.origin) }) }),

    // 自定义接口：URL 为本地服务地址
    [services.custom]: chat({ onRequest: (m) => ({ ...openaiRequest(m), url: config.custom }) }),

    // 无问芯穹：URL 含模型名
    [services.infini]: chat({
        onRequest: (m) => ({
            url: `https://cloud.infini-ai.com/maas/${activeModel(services.infini)}/nvidia/chat/completions`,
            headers: bearerHeaders(config.token[services.infini]),
            body: commonMsgTemplate(m.origin),
        }),
    }),

    // MiniMax：URL 含模型名 + 专属请求体
    [services.minimax]: chat({
        onRequest: (m) => ({
            url: "https://api.minimax.chat/v1/text/" + config.model[services.minimax],
            headers: bearerHeaders(config.token[services.minimax]),
            body: minimaxTemplate(m.origin),
        }),
    }),

    // Gemini：key 在 URL，响应路径 candidates[].content.parts[].text
    [services.gemini]: chat({
        onRequest: (m) => ({
            url:
                config.proxy[config.service] ||
                `https://generativelanguage.googleapis.com/v1beta/models/${activeModel(config.service)}:generateContent?key=${config.token[config.service]}`,
            headers: { "Content-Type": "application/json" },
            body: geminiMsgTemplate(m.origin),
        }),
        onResponse: (j) => j.candidates[0].content.parts[0].text,
    }),

    // Claude：x-api-key + anthropic 头，响应路径 content[].text
    [services.claude]: chat({
        onRequest: (m) => ({
            url: proxyOr(urls[services.claude]),
            headers: {
                "Content-Type": "application/json",
                "x-api-key": config.token[services.claude],
                "anthropic-version": "2023-06-01",
                "anthropic-dangerous-direct-browser-access": "true",
            },
            body: claudeMsgTemplate(m.origin),
        }),
        onResponse: (j) => j.content[0].text,
    }),

    // Azure OpenAI：api-key 头 + 端点/Key 预检
    [services.azureOpenai]: chat({
        onRequest: (m) => {
            const apiKey = config.token[config.service];
            if (!apiKey || apiKey.trim() === "") {
                throw new Error("Azure OpenAI API Key 未配置，请在设置中输入有效的 API Key");
            }
            const endpoint = config.azureOpenaiEndpoint;
            if (!endpoint || endpoint.trim() === "") {
                throw new Error("Azure OpenAI 端点地址未配置，请在设置中输入完整的端点地址");
            }
            if (!endpoint.includes("openai.azure.com") || !endpoint.includes("/chat/completions")) {
                throw new Error("Azure OpenAI 端点地址格式不正确，请确保包含正确的域名和路径");
            }
            return { url: endpoint, headers: { "Content-Type": "application/json", "api-key": apiKey }, body: commonMsgTemplate(m.origin) };
        },
    }),

    // New API：config.newApiUrl 规整为 /v1/chat/completions
    [services.newapi]: chat({
        onRequest: (m) => {
            let url = config.newApiUrl;
            if (!url) throw new Error("New API地址未配置");
            if (url.endsWith("/")) url = url.slice(0, -1);
            if (url.endsWith("/v1")) url += "/chat/completions";
            else if (!url.endsWith("/chat/completions")) url += "/v1/chat/completions";
            return { url, headers: bearerHeaders(config.token[config.service]), body: commonMsgTemplate(m.origin) };
        },
        onResponse: (j) => {
            if (j.choices && j.choices.length > 0) return j.choices[0].message.content;
            throw new Error("翻译失败: 上游未返回内容");
        },
    }),

    // Coze（国际/国内）：query 模式 + 响应判 code
    [services.cozecom]: chat({
        onRequest: (m) => ({
            url: proxyOr(urls[config.service]),
            headers: bearerHeaders(config.token[config.service]),
            body: cozeTemplate(m.origin),
        }),
        onResponse: cozeResponse,
    }),
    [services.cozecn]: chat({
        onRequest: (m) => ({
            url: proxyOr(urls[config.service]),
            headers: bearerHeaders(config.token[config.service]),
            body: cozeTemplate(m.origin),
        }),
        onResponse: cozeResponse,
    }),
};

function cozeResponse(j: any): string {
    if (j.code === 0 && j.msg === "success") return j.messages[0].content;
    throw new Error(`请求失败: ${j.msg}`);
}
