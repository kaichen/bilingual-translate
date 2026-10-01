// 主动取消不属于翻译失败，页面还原时不显示重试提示。
export class TranslationCancelledError extends Error {
    constructor() {
        super('翻译已取消');
        this.name = 'AbortError';
    }
}
