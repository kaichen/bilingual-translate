// 防抖限流函数，可传递参数
import {franc} from "franc-min";

// 防抖限流函数，可传递参数
export function throttle(fn: (...args: any[]) => void, interval: number) {
    let last = 0; // 维护上次执行的时间
    return function (this: any, ...args: any[]) {
        const now = Date.now();
        // 只有当前时间与上次执行时间差大于等于间隔时才执行
        if (now - last >= interval) {
            last = now;
            fn.apply(this, args);  // 使用 apply 来传递参数数组
        }
    };
}

// 输出标准的语言类型，franc 只返回最可信的结果，francAll 返回所有结果并包含确信度
export function detectlang(origin: string): string {
    const find = franc(origin, {minLength: 0});
    // 返回对应的标准语言代码
    switch (find) {
        case "cmn":
            return "zh-Hans";
        case "eng":
            return "en";
        case "jpn":
            return "ja";
        case "kor":
            return "ko";
        case "fra":
            return "fr";
        case "rus":
            return "ru";
        default:
            return find; // 返回其他语言的识别结果
    }
}

// 短文本的语言检测不可靠，低于这个长度不按原文语言列表过滤。
const SOURCE_FILTER_MIN_LENGTH = 20;

// 正文样本至少这么长才用它判断页面语言，否则退回页面声明的语言。
const PAGE_SAMPLE_MIN_LENGTH = 200;
const PAGE_SAMPLE_MAX_LENGTH = 2000;

// 页面语言：优先用正文样本检测（声明常常不准），样本太短或检测不出时用 html lang / meta 声明。纯函数，可单测。
export function resolvePageLanguage(sample: string, declared: string): string | undefined {
    if (sample.length >= PAGE_SAMPLE_MIN_LENGTH) {
        const detected = detectlang(sample);
        if (detected !== 'und') return detected;
    }
    const primary = declared.trim().toLowerCase().split(/[-_]/)[0];
    if (!primary) return undefined;
    return primary === 'zh' ? 'zh-Hans' : primary;
}

let pageLanguageCache: { url: string; language?: string } | undefined;

// 读取当前页面的语言，每个地址只算一次；正文还没加载够时不缓存。
export function getPageLanguage(): string | undefined {
    if (typeof document === 'undefined') return undefined;
    if (pageLanguageCache?.url === location.href) return pageLanguageCache.language;
    const root = document.querySelector<HTMLElement>('main, article') ?? document.body;
    const sample = (root?.innerText ?? root?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, PAGE_SAMPLE_MAX_LENGTH);
    const declared = document.documentElement.lang
        || document.querySelector('meta[http-equiv="content-language" i]')?.getAttribute('content')
        || document.querySelector('meta[property="og:locale"]')?.getAttribute('content')
        || '';
    const language = resolvePageLanguage(sample, declared);
    if (sample.length >= PAGE_SAMPLE_MIN_LENGTH) pageLanguageCache = { url: location.href, language };
    return language;
}

// 文本是否属于「需要翻译的原文语言」。列表为空表示全部翻译。
// 短文本或检测不出语言时按页面语言判断；页面语言也未知时放行。
export function isSourceLanguageAllowed(text: string, sourceLanguages: string[], pageLanguage: () => string | undefined = getPageLanguage): boolean {
    if (!sourceLanguages.length) return true;
    const trimmed = text.trim();
    const detected = trimmed.length >= SOURCE_FILTER_MIN_LENGTH ? detectlang(trimmed) : 'und';
    const language = detected === 'und' ? pageLanguage() : detected;
    return !language || sourceLanguages.includes(language);
}

// 空白文本、已是目标语言（去空白后用 detectlang 判定）、或不在原文语言列表内，都跳过翻译。
export function shouldSkipTranslation(text: string, targetLang: string, sourceLanguages: string[] = []): boolean {
    const compact = (text ?? '').replace(/[\s　]/g, '');
    return !compact || detectlang(compact) === targetLang || !isSourceLanguageAllowed(text, sourceLanguages);
}

// 获取触摸点的中心位置
export function getCenterPoint(touches: TouchList, point: number): { x: number, y: number } | undefined {
    // 检查触摸点数量是否等于指定的数量
    if (touches.length !== point) return;

    let centerX = 0;
    let centerY = 0;
    // 累加所有触摸点的坐标
    for (let i = 0; i < touches.length; i++) {
        centerX += touches[i].clientX;
        centerY += touches[i].clientY;
    }
    // 计算中心点坐标
    centerX /= touches.length;
    centerY /= touches.length;

    return {x: centerX, y: centerY};
}