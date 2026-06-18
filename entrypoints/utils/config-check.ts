import { customModelString, services } from "./option";
import { servicesType } from "./providers";

export interface ConfigCheckSnapshot {
    service: string;
    token: Record<string, string>;
    ak: string;
    sk: string;
    tencentSecretId: string;
    tencentSecretKey: string;
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
    // 1. 需要 token 的服务必须配置 token（DeepLX 的令牌可选）
    if (servicesType.isUseToken(c.service) && !c.token[c.service] && c.service !== services.deeplx) {
        return { valid: false, reason: "令牌尚未配置，请前往设置页配置" };
    }
    // 文心一言需要 AK + SK
    if (c.service === services.yiyan && (!c.ak || !c.sk)) {
        return { valid: false, reason: "令牌尚未配置，请前往设置页配置" };
    }
    // 腾讯云需要 SecretId + SecretKey
    if (c.service === services.tencent && (!c.tencentSecretId || !c.tencentSecretKey)) {
        return { valid: false, reason: "腾讯云机器翻译密钥尚未配置，请前往设置页配置SecretId和SecretKey" };
    }
    // 2. AI 服务（Coze 除外）必须选模型
    if (servicesType.isAI(c.service) && ![services.cozecn, services.cozecom].includes(c.service)) {
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
