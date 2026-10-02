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

// 拉丁字母等靠统计才能区分的文字，至少这么长才用 franc，否则按页面语言。
const STATISTICAL_MIN_LENGTH = 60;
// 正文样本至少这么长才用它判断页面语言，否则退回页面声明的语言。
const PAGE_SAMPLE_MIN_LENGTH = 200;
const PAGE_SAMPLE_MAX_LENGTH = 2000;
// 不使用拉丁字母 / 使用西里尔字母的页面语言（两字码来自声明，三字码来自 franc）。
const NON_LATIN_LANGUAGE = /^(ja|zh|ko|ru|uk|bg|sr|be|ar|he|fa|th|hi|el|jpn|cmn|kor|rus|ukr|bul|srp|bel|arb|heb|pes|tha|hin|ell)\b/;
const CYRILLIC_LANGUAGE = /^(ru|uk|bg|sr|be|rus|ukr|bul|srp|bel)\b/;

const count = (text: string, pattern: RegExp): number => text.match(pattern)?.length ?? 0;

// 语言判断结果：certain 为 false 表示靠页面语言兜底得来，只能用来判断「已是目标语言」，不能据此排除原文语言。
export interface DetectedLanguage {
    language: string;
    certain: boolean;
}

// 判断一段文字的语言：先看文字种类（假名、韩文等一眼可辨），拿不准的再看长度决定用 franc 还是页面语言。
// 没有任何文字（数字、符号、空白）或无从判断时返回 undefined。纯函数，可单测。
export function detectTextLanguage(text: string, pageLanguage?: string): DetectedLanguage | undefined {
    const kana = count(text, /[\p{Script=Hiragana}\p{Script=Katakana}]/gu);
    const han = count(text, /\p{Script=Han}/gu);
    const hangul = count(text, /\p{Script=Hangul}/gu);
    const cyrillic = count(text, /\p{Script=Cyrillic}/gu);
    const latin = count(text, /\p{Script=Latin}/gu);
    const letters = count(text, /\p{L}/gu);
    if (!letters) return undefined;
    // 阿拉伯、泰、希腊、希伯来、天城文等没单独统计的文字。
    const other = letters - kana - han - hangul - cyrillic - latin;

    // 日文、中文、韩文里常夹着拉丁字母的品牌名和术语，一个字的信息量也更大，按 3 倍计。
    const cjk = (kana + han) * 3;
    const top = Math.max(cjk, hangul * 3, cyrillic, latin, other);
    const long = text.trim().length >= STATISTICAL_MIN_LENGTH;
    const certain = (language: string) => ({ language, certain: true });
    const guess = (language: string | undefined) => language ? { language, certain: false } : undefined;
    const statistical = (force = false) => {
        const detected = long || force ? detectlang(text.trim()) : 'und';
        return detected === 'und' ? undefined : certain(detected);
    };

    if (top === cjk) {
        // 有假名一定是日语；纯汉字在日语页面里按日语，其余按中文。
        if (kana) return certain('ja');
        return certain(pageLanguage && /^(ja|jpn)\b/.test(pageLanguage) ? 'ja' : 'zh-Hans');
    }
    if (top === hangul * 3) return certain('ko');
    if (top === cyrillic) {
        return statistical() ?? guess(pageLanguage && CYRILLIC_LANGUAGE.test(pageLanguage) ? pageLanguage : 'ru');
    }
    if (top === latin) {
        // 短的拉丁字母文本统计检测不可靠：跟随页面语言；非拉丁语页面里的短句按英语。都只是猜测。
        const fallback = !pageLanguage ? undefined : NON_LATIN_LANGUAGE.test(pageLanguage) ? 'en' : pageLanguage;
        return statistical() ?? guess(fallback);
    }
    // 其他文字和页面语言无关，不论长短都交给 franc；认不出就当未知。
    return statistical(true);
}

// 页面语言：正文样本够长时按样本判断（页面声明常常不准），否则用 html lang / meta 声明。纯函数，可单测。
export function resolvePageLanguage(sample: string, declared: string): string | undefined {
    const primary = declared.trim().toLowerCase().split(/[-_]/)[0];
    const declaredLanguage = !primary ? undefined : primary === 'zh' ? 'zh-Hans' : primary;
    if (sample.length < PAGE_SAMPLE_MIN_LENGTH) return declaredLanguage;
    return detectTextLanguage(sample, declaredLanguage)?.language ?? declaredLanguage;
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

// 翻译前的唯一语言闸：没有文字、已是目标语言、或确定不在「需要翻译的原文语言」列表内，都跳过。
// 列表为空表示全部翻译；判断不出语言、或只是按页面语言猜的结果不在列表内时放行。
export function shouldSkipTranslation(
    text: string, targetLang: string, sourceLanguages: string[] = [], pageLanguage: () => string | undefined = getPageLanguage,
): boolean {
    if (!text || !/\p{L}/u.test(text)) return true;
    const detected = detectTextLanguage(text, pageLanguage());
    if (!detected) return false;
    if (detected.language === targetLang) return true;
    return detected.certain && sourceLanguages.length > 0 && !sourceLanguages.includes(detected.language);
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