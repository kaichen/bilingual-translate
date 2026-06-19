import {services} from "../config/option";
import microsoft from "./translate/microsoft";
import deepl from "./translate/deepl";
import deeplx from "./translate/deeplx";
import zhipu from "./llm/zhipu";
import yiyan from "./llm/yiyan";
import google from "./translate/google";
import xiaoniu from "./translate/xiaoniu";
import youdao from "./translate/youdao";
import tencent from "./translate/tencent";
import chromeTranslator from "./translate/chrome-builtin-ai";
import hunyuanTranslation from "./translate/hunyuan";
import {chatServices} from "./llm/chat";

type ServiceFunction = (message: any) => Promise<any>;
type ServiceMap = {[key: string]: ServiceFunction;};

export const _service: ServiceMap = {
    // 传统机器翻译
    [services.microsoft]: microsoft,
    [services.deepL]: deepl,
    [services.deeplx]: deeplx,
    [services.google]: google,
    [services.xiaoniu]: xiaoniu,
    [services.youdao]: youdao,
    [services.tencent]: tencent,
    [services.chromeTranslator]: chromeTranslator,

    // AI 大模型：带重辅助逻辑、独立文件，复用 chatCompletion adapter
    [services.zhipu]: zhipu,
    [services.yiyan]: yiyan,
    // 腾讯云签名风格，非 chat completion
    [services.huanYuanTranslation]: hunyuanTranslation,

    // 其余 AI 大模型：经 chatCompletion adapter 统一分发
    ...chatServices,
}
