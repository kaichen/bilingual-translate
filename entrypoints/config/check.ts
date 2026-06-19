import { validateConfig } from "./config-check";
import { sendErrorMessage } from "../ui/tip";
import { config } from "@/entrypoints/config/config";

// 翻译前校验配置：纯校验逻辑在 config-check.ts，这里读 config 单例并把失败原因弹 toast
export function checkConfig(): boolean {
    const { valid, reason } = validateConfig(config);
    if (!valid) {
        if (reason) sendErrorMessage(reason);
        return false;
    }
    return true;
}
