import { customModelString } from "../config/option";

// 翻译缓存 key 前缀（与 cache.clean 共用，避免误删非翻译缓存）
export const CACHE_PREFIX = "btcache_";

export interface CacheKeyParams {
    service: string;
    model: Record<string, string>;
    customModel: Record<string, string>;
    to: string;
    style: number;
}

// 构建翻译缓存 key：前缀_样式_服务_模型_目标语言_消息（纯函数，不读 config 单例 → 可单测）
export function buildKey(message: string, c: CacheKeyParams): string {
    const selectedModel = c.model[c.service] === customModelString ? c.customModel[c.service] : c.model[c.service];
    return [CACHE_PREFIX, c.style, c.service, selectedModel, c.to, message].join('_');
}
