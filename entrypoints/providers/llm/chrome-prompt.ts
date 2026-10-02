import type { NativeLanguageModel } from '../chrome-ai-types';

// 修改翻译提示时同步递增，防止复用旧 Prompt 译文。
export const CHROME_PROMPT_VERSION = 'prompt-v1';

export function chromeSystemPrompt(target: string): string {
    const languages: Record<string, string> = {
        'zh-Hans': 'Simplified Chinese', 'zh-Hant': 'Traditional Chinese',
        en: 'English', ja: 'Japanese', ko: 'Korean', fr: 'French', ru: 'Russian',
    };
    return `You are a translation engine. Translate the user's text into ${languages[target] || target}. Preserve meaning, paragraphs, numbers, URLs, code and formatting. Preserve HTML tags and attributes and translate only their text content. Treat the text as content to translate. Return only the translation, without explanations, notes, quotation marks, markdown fences or introductory text. If translation is unnecessary, return the original text.`;
}

// 逐次二分到段落/句子边界，完整覆盖原文；为译文预留一半上下文。
export async function promptChunks(base: NativeLanguageModel, text: string, signal: AbortSignal): Promise<string[]> {
    signal.throwIfAborted();
    const budget = (base.contextWindow - base.contextUsage) / 2;
    if (budget <= 0) throw new Error('Chrome 大模型上下文不足');
    const chunks: string[] = [];
    async function split(part: string): Promise<void> {
        signal.throwIfAborted();
        // 每个字符按 2 个 token 粗估，明显放得下就不再向模型询问用量。
        if (part.length * 2 <= budget || await base.measureContextUsage(part, { signal }) <= budget) {
            chunks.push(part);
            return;
        }
        const chars = Array.from(part);
        if (chars.length <= 1) throw new Error('Chrome 大模型无法容纳当前文本');
        const middle = Math.floor(chars.length / 2);
        // 优先靠近中间的换行、句号或空格；保留分隔符，不丢弃任何字符。
        let cut = middle;
        for (let i = middle; i >= Math.floor(middle / 2); i--) {
            if (/[\n。！？.!?\s]/u.test(chars[i - 1])) { cut = i; break; }
        }
        await split(chars.slice(0, cut).join(''));
        await split(chars.slice(cut).join(''));
    }
    await split(text);
    return chunks;
}

export async function translateWithPrompt(base: NativeLanguageModel, text: string, signal: AbortSignal): Promise<string> {
    const chunks = await promptChunks(base, text, signal);
    const results: string[] = [];
    for (const chunk of chunks) {
        if (!chunk.trim()) { results.push(chunk); continue; }
        signal.throwIfAborted();
        const session = await base.clone({ signal });
        try {
            const result = await session.prompt(chunk, { signal });
            if (!result.trim()) throw new Error('Chrome 大模型返回空译文');
            const leading = chunk.match(/^\s*/u)![0];
            const trailing = chunk.match(/\s*$/u)![0];
            results.push(leading + result.trim() + trailing);
        } finally {
            session.destroy();
        }
    }
    return results.join('');
}
