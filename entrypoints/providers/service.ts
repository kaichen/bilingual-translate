import {services} from "../utils/option";
import microsoft from "../service/microsoft";
import deepl from "../service/deepl";
import deeplx from "../service/deeplx";
import zhipu from "../service/zhipu";
import yiyan from "../service/yiyan";
import google from "../service/google";
import xiaoniu from "../service/xiaoniu";
import youdao from "../service/youdao";
import tencent from "../service/tencent";
import chromeTranslator from "../service/chrome-translator";
import hunyuanTranslation from "../service/hunyuan-translation";
import {chatServices} from "../service/chat";

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
