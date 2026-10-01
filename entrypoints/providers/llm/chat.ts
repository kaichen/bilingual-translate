// AI chat-completion adapter：统一 fetch / 错误处理 / contentPostHandler。
// per-provider 变化点收敛为两段生命周期钩子 onRequest / onResponse，全缺省即 OpenAI 兼容。
// 详见 CONTEXT.md。
import { method } from "../../utils/constant";
import { urls } from "@/entrypoints/providers/registry";
import { services } from "../../config/option";
import { config } from "@/entrypoints/config/config";
import { commonMsgTemplate, deepseekMsgTemplate } from "./template";

export interface RequestParts {
    url: string;
    headers: HeadersInit;
    body: string;
}

export interface ChatHooks {
    onRequest?: (message: any) => RequestParts | Promise<RequestParts>;
    onResponse?: (json: any) => string;
}

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

// 大模型服务通过 chatCompletion 统一分发。
export const chatServices: Record<string, (message: any) => Promise<any>> = {
    // OpenRouter：附加 X-Title 头
    [services.openrouter]: chat({
        onRequest: (m) => ({
            ...openaiRequest(m),
            headers: { ...bearerHeaders(config.token[config.service]), "X-Title": "bilingual translate" },
        }),
    }),

    // DeepSeek：deepseek-reasoner 不带 temperature
    [services.deepseek]: chat({ onRequest: (m) => ({ ...openaiRequest(m), body: deepseekMsgTemplate(m.origin) }) }),

    // 自定义接口：使用配置的服务地址
    [services.custom]: chat({ onRequest: (m) => ({ ...openaiRequest(m), url: config.custom }) }),
};
