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

// 文本是否属于「需要翻译的原文语言」。列表为空表示全部翻译；检测不出语言时也放行。
export function isSourceLanguageAllowed(text: string, sourceLanguages: string[]): boolean {
    const trimmed = text.trim();
    if (!sourceLanguages.length || trimmed.length < SOURCE_FILTER_MIN_LENGTH) return true;
    const detected = detectlang(trimmed);
    return detected === 'und' || sourceLanguages.includes(detected);
}

// 若文本语言已是目标语言（去空白后用 detectlang 判定），或不在原文语言列表内，则跳过翻译。纯函数，可单测。
export function shouldSkipTranslation(text: string, targetLang: string, sourceLanguages: string[] = []): boolean {
    return detectlang(text.replace(/[\s　]/g, '')) === targetLang || !isSourceLanguageAllowed(text, sourceLanguages);
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