// content / background / popup 之间的消息契约（可辨识联合，type 为判别字段）。
// 不含 offscreen 的 CHROME_TRANSLATE_OFFSCREEN —— 它走独立的 chrome.runtime 通道，与主消息总线无关。
// 纯类型模块：无运行时代码，价值在编译期对齐收发两端。

// —— 发往 background 的指令消息 ——
export type BackgroundMessage =
    | { type: 'getTranslationState'; tabId: number }
    | { type: 'setTranslationState'; tabId: number; isTranslated: boolean }
    | { type: 'inputBoxTranslation'; text: string; targetLang: string };

// —— 发往 content 的指令消息 ——
export type ContentMessage =
    | { type: 'contextMenuTranslate'; action: 'fullPage' | 'restore' }
    | { type: 'getTranslationProgress' }
    | { type: 'getPageDomain' }
    | { type: 'getPageTranslated' }
    | { type: 'clearCache' };

export type ExtMessage = BackgroundMessage | ContentMessage;

// 无 type 的普通翻译请求（content → background 默认分支，经 _service 分发）
export interface TranslateRequest {
    context: string;
    origin: string;
}

// —— 响应 ——
export interface TranslationStateResponse {
    isTranslated?: boolean;
}

export interface ContextMenuTranslateResponse {
    status?: string;
    action?: string;
}

// 全文翻译进度：popup 轮询当前 tab 的队列活动量，active+pending 归零即视为首屏批次译完
export interface TranslationProgressResponse {
    active: number;
    pending: number;
}

// 当前页面站点 key（content 用 getDomainKey 计算，popup 据此做「始终翻译此网站」开关）
export interface PageDomainResponse {
    domain: string;
}

// 当前页是否处于全文翻译态（content 的 isAutoTranslating，popup 按钮据此同步，含常开自动翻译）
export interface PageTranslatedResponse {
    translated: boolean;
}

export interface InputBoxTranslationResponse {
    success: boolean;
    translatedText?: string;
    error?: string;
}
