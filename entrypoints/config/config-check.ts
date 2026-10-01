import { customModelString, services } from "./option";
import { providerOf, servicesType } from "@/entrypoints/providers/registry";

export interface ConfigCheckSnapshot {
    service: string;
    token: Record<string, string>;
    model: Record<string, string>;
    customModel: Record<string, string>;
    display: number;
}

export interface ConfigCheckResult {
    valid: boolean;
    reason?: string;
}

// 翻译前校验配置完整性（纯函数：不读 config 单例、不弹 toast，返回结构化结果 → 可单测）
export function validateConfig(c: ConfigCheckSnapshot): ConfigCheckResult {
    if (!providerOf(c.service)) {
        return { valid: false, reason: "翻译服务不可用，请前往设置页重新选择" };
    }
    if (servicesType.isUseToken(c.service) && !c.token[c.service]) {
        return { valid: false, reason: "令牌尚未配置，请前往设置页配置" };
    }
    if (servicesType.isUseModel(c.service)) {
        const model = c.model[c.service];
        const customModel = c.customModel[c.service];
        if (!model || (model === customModelString && !customModel)) {
            return { valid: false, reason: "模型尚未配置，请前往设置页配置" };
        }
    }
    // 谷歌翻译仅支持双语模式
    if (c.display === 0 && c.service === services.google) {
        return { valid: false, reason: "「谷歌翻译」仅支持双语模式，请切换翻译服务" };
    }
    return { valid: true };
}
