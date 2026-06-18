import {services} from "../utils/option";
import microsoft from "./microsoft";
import deepl from "./deepl";
import deeplx from "./deeplx";
import zhipu from "./zhipu";
import yiyan from "./yiyan";
import google from "./google";
import xiaoniu from "./xiaoniu";
import youdao from "./youdao";
import tencent from "./tencent";
import chromeTranslator from "./chrome-translator";
import hunyuanTranslation from "./hunyuan-translation";
import {chatServices} from "./chat";

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
