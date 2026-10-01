import { CHROME_PROMPT_VERSION } from '../providers/llm/chrome-prompt';
import { servicesType } from '../providers/registry';
import type { ChromeTranslationEngine } from '../providers/chrome-ai-types';
import { customModelString } from "../config/option";

// 翻译缓存 key 前缀（与 cache.clean 共用，避免误删非翻译缓存）
export const CACHE_PREFIX = "btcache_";

export interface CacheKeyParams {
    service: string;
    model: Record<string, string>;
    customModel: Record<string, string>;
    to: string;
    style: number;
    from?: string;
    chromeTranslationEngine?: ChromeTranslationEngine;
}

// 构建翻译缓存 key：前缀_样式_服务_模型_目标语言_消息（纯函数，不读 config 单例 → 可单测）
export function buildKey(message: string, c: CacheKeyParams): string {
    if (servicesType.isNativeAI(c.service)) {
        const engine = c.chromeTranslationEngine || 'translator';
        return [CACHE_PREFIX, c.style, c.service, engine === 'prompt' ? CHROME_PROMPT_VERSION : engine, c.from || 'auto', c.to, message].join('_');
    }
    const selectedModel = c.model[c.service] === customModelString ? c.customModel[c.service] : c.model[c.service];
    return [CACHE_PREFIX, c.style, c.service, selectedModel, c.to, message].join('_');
}
