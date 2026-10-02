import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIAvailability, ChromeAIAPIs, ChromeAISettings, NativeLanguageModel } from '../entrypoints/providers/chrome-ai-types';
vi.mock('@/entrypoints/config/config', () => ({ config: {} }));
import { ChromeAIService } from '../entrypoints/providers/translate/chrome-builtin-ai';
import { promptChunks } from '../entrypoints/providers/llm/chrome-prompt';

const translatorSettings: ChromeAISettings = { engine: 'translator', sources: [], to: 'zh-Hans' };
const promptSettings: ChromeAISettings = { engine: 'prompt', sources: [], to: 'zh-Hans' };
let service: ChromeAIService;
let apis: ChromeAIAPIs;
let clones: NativeLanguageModel[];
let base: NativeLanguageModel;
let detected = 'en';
const signal = () => new AbortController().signal;

beforeEach(() => {
    detected = 'en';
    clones = [];
    base = {
        contextWindow: 1000, contextUsage: 20,
        measureContextUsage: vi.fn(async (text: string) => text.length),
        clone: vi.fn(async () => {
            const session: NativeLanguageModel = {
                ...base, prompt: vi.fn(async (text: string) => `译文${text}`), destroy: vi.fn(),
            };
            clones.push(session);
            return session;
        }),
        prompt: vi.fn(), destroy: vi.fn(),
    };
    apis = {
        LanguageModel: { availability: vi.fn(async () => 'available' as AIAvailability), create: vi.fn(async () => base) },
        Translator: {
            availability: vi.fn(async () => 'available' as AIAvailability),
            create: vi.fn(async () => ({ translate: vi.fn(async () => '你好'), destroy: vi.fn() })),
        },
        LanguageDetector: {
            availability: vi.fn(async () => 'available' as AIAvailability),
            create: vi.fn(async () => ({ detect: vi.fn(async () => [{ detectedLanguage: detected, confidence: 0.99 }]), destroy: vi.fn() })),
        },
    };
    service = new ChromeAIService(() => apis);
});

afterEach(() => { service.dispose(); vi.useRealTimers(); });

describe('Chrome 原生 AI', () => {
    it('直接调用当前 Translator，复用同一语言对与 detector', async () => {
        await expect(service.translate('Hello', translatorSettings, signal())).resolves.toBe('你好');
        await expect(service.translate('World', translatorSettings, signal())).resolves.toBe('你好');
        expect(apis.Translator!.create).toHaveBeenCalledTimes(1);
        expect(apis.LanguageDetector!.create).toHaveBeenCalledTimes(1);
        expect(apis.Translator!.create).toHaveBeenCalledWith(expect.objectContaining({ sourceLanguage: 'en', targetLanguage: 'zh' }));
    });

    it('缺少 API 或所选语言不可用时直接报错，不调用 create', async () => {
        apis.LanguageModel = undefined;
        expect(await service.status(promptSettings)).toMatchObject({ availability: 'unavailable', message: expect.stringContaining('开启 Gemma 4') });
        await expect(service.translate('Hello', promptSettings, signal())).rejects.toThrow('Prompt API 不可用');
        apis.Translator!.availability = vi.fn(async () => 'unavailable' as const);
        expect(await service.status(translatorSettings)).toMatchObject({ availability: 'unavailable', message: expect.stringContaining('语言组合') });
        apis.LanguageDetector!.availability = vi.fn(async () => 'unavailable' as const);
        expect(await service.status(translatorSettings)).toMatchObject({ availability: 'unavailable', message: expect.stringContaining('语言检测不可用') });
        await expect(service.translate('Hello', translatorSettings, signal())).rejects.toThrow('不可用');
        expect(apis.Translator!.create).not.toHaveBeenCalled();
    });

    it('下载必须显式初始化，合并同时初始化并报告进度', async () => {
        const settings = { ...translatorSettings, sources: ['en'] };
        let ready = false;
        let complete!: () => void;
        apis.Translator!.availability = vi.fn(async () => ready ? 'available' : 'downloadable');
        apis.Translator!.create = vi.fn(async (options) => {
            options.monitor?.({ addEventListener: (_type: 'downloadprogress', listener: (event: { loaded: number }) => void) => listener({ loaded: 0.5 }) });
            await new Promise<void>(resolve => { complete = resolve; });
            ready = true;
            return { translate: async () => '你好', destroy: vi.fn() };
        });
        await expect(service.translate('Hello', settings, signal())).rejects.toThrow('尚未就绪');
        expect(apis.Translator!.create).not.toHaveBeenCalled();
        const first = service.initialize(settings);
        expect(service.initialize(settings)).toBe(first);
        await vi.waitFor(() => expect(complete).toBeTypeOf('function'));
        expect(await service.status(settings)).toMatchObject({ availability: 'downloading', progress: 50 });
        complete();
        await first;
        expect((await service.status(settings)).availability).toBe('available');
        expect(apis.Translator!.create).toHaveBeenCalledTimes(1);
    });

    it('多种原文语言逐个准备语言对，翻译时按检测结果选用', async () => {
        const settings = { ...translatorSettings, sources: ['en', 'ja'] };
        await service.initialize(settings);
        expect(vi.mocked(apis.Translator!.create).mock.calls.map(([options]) => options.sourceLanguage)).toEqual(['en', 'ja']);
        expect(apis.LanguageDetector!.create).toHaveBeenCalledTimes(1);
        detected = 'en';
        await service.translate('Hello', settings, signal());
        expect(apis.Translator!.create).toHaveBeenLastCalledWith(expect.objectContaining({ sourceLanguage: 'en' }));
    });

    it('只勾选一种原文语言时不做语言检测', async () => {
        await service.translate('こんにちは', { ...translatorSettings, sources: ['ja'] }, signal());
        expect(apis.LanguageDetector!.create).not.toHaveBeenCalled();
        expect(apis.Translator!.create).toHaveBeenCalledWith(expect.objectContaining({ sourceLanguage: 'ja' }));
    });

    it('汉字混合日语使用检测结果；不把检测失败的文本当成英语', async () => {
        detected = 'ja';
        await service.translate('今日は日本語です', translatorSettings, signal());
        expect(apis.Translator!.create).toHaveBeenCalledWith(expect.objectContaining({ sourceLanguage: 'ja' }));
        detected = 'und';
        await expect(service.translate('日本語', translatorSettings, signal())).rejects.toThrow('无法检测');
    });

    it('Prompt 声明实际源/目标语言；每段克隆、释放独立会话', async () => {
        detected = 'ja';
        await service.translate('今日は晴れ', promptSettings, signal());
        await service.translate('明日も晴れ', promptSettings, signal());
        const creation = vi.mocked(apis.LanguageModel!.create).mock.calls[0][0];
        expect(creation.expectedInputs).toEqual([{ type: 'text', languages: ['en', 'ja'] }]);
        expect(creation.expectedOutputs).toEqual([{ type: 'text', languages: ['zh'] }]);
        expect(apis.LanguageModel!.availability).toHaveBeenCalledWith({ samplingMode: 'most-predictable', expectedInputs: creation.expectedInputs, expectedOutputs: creation.expectedOutputs });
        expect(creation.samplingMode).toBe('most-predictable');
        expect(creation.initialPrompts[0].content).toContain('Simplified Chinese');
        expect(apis.LanguageModel!.create).toHaveBeenCalledTimes(1);
        expect(base.prompt).not.toHaveBeenCalled();
        expect(clones).toHaveLength(2);
        clones.forEach(clone => { expect(clone.prompt).toHaveBeenCalledTimes(1); expect(clone.destroy).toHaveBeenCalledTimes(1); });
    });

    it('排队中的大模型请求合并为一次推理，短文本不询问用量', async () => {
        const settings = { ...promptSettings, sources: ['en'] };
        const results = await Promise.all(['One', ' Two\n', 'Three'].map(text => service.translate(text, settings, signal())));
        expect(results).toEqual(['One', ' Two\n', 'Three']);
        expect(clones).toHaveLength(1);
        expect(clones[0].prompt).toHaveBeenCalledWith('[[1]]\nOne\n[[2]]\nTwo\n[[3]]\nThree', expect.anything());
        expect(base.measureContextUsage).not.toHaveBeenCalled();
    });

    it('合并译文缺少标记时逐段重译；取消其中一段不影响其余', async () => {
        const settings = { ...promptSettings, sources: ['en'] };
        base.clone = vi.fn(async () => {
            const session: NativeLanguageModel = {
                ...base, destroy: vi.fn(),
                prompt: vi.fn(async (text: string) => text.includes('[[') ? '模型丢了标记' : `译文${text}`),
            };
            clones.push(session);
            return session;
        });
        const abort = new AbortController();
        const first = service.translate('One', settings, signal());
        const second = service.translate('Two', settings, abort.signal);
        const cancelled = expect(second).rejects.toThrow('取消');
        abort.abort(new Error('取消'));
        const third = service.translate('Three', settings, signal());
        expect(await Promise.all([first, third])).toEqual(['译文One', '译文Three']);
        await cancelled;
        expect(clones).toHaveLength(3);
    });

    it('长文本分块完整覆盖，包括换行与非 BMP 字符', async () => {
        const small: NativeLanguageModel = { ...base, contextWindow: 70, contextUsage: 10 };
        const text = 'First sentence.\n第二段。日本語の文章です。🙂'.repeat(8);
        const chunks = await promptChunks(small, text, signal());
        expect(chunks.length).toBeGreaterThan(1);
        expect(chunks.join('')).toBe(text);
        expect(chunks.every(chunk => chunk.length <= 30)).toBe(true);
        const identity: NativeLanguageModel = {
            ...small, clone: async () => ({ ...small, prompt: async text => text, destroy: vi.fn() }),
        };
        apis.LanguageModel!.create = vi.fn(async () => identity);
        expect(await service.translate(text, { ...promptSettings, sources: ['en'] }, signal())).toBe(text);
    });

    it('跨标签页的原生任务串行；取消等待中的任务不创建会话', async () => {
        let release!: () => void;
        const translate = vi.fn(async () => {
            await new Promise<void>(resolve => { release = resolve; });
            return '你好';
        });
        apis.Translator!.create = vi.fn(async () => ({ translate, destroy: vi.fn() }));
        const first = service.translate('Hello', translatorSettings, signal());
        const abort = new AbortController();
        const second = service.translate('World', translatorSettings, abort.signal);
        const cancelled = expect(second).rejects.toThrow('取消');
        await vi.waitFor(() => expect(release).toBeTypeOf('function'));
        expect(translate).toHaveBeenCalledTimes(1);
        abort.abort(new Error('取消'));
        release();
        await first;
        await cancelled;
        expect(translate).toHaveBeenCalledTimes(1);
    });

    it('推理超时传递 AbortSignal 并销毁会话，后续请求仍可执行', async () => {
        let running = false;
        const destroy = vi.fn();
        base.clone = vi.fn(async () => ({
            ...base, destroy,
            prompt: vi.fn((_text, options) => new Promise<string>((_resolve, reject) => {
                running = true;
                options!.signal!.addEventListener('abort', () => reject(options!.signal!.reason), { once: true });
            })),
        }));
        const request = service.translate('Hello', promptSettings, signal(), 30);
        const failure = expect(request).rejects.toThrow('超时');
        await vi.waitFor(() => expect(running).toBe(true), { interval: 1 });
        await failure;
        expect(destroy).toHaveBeenCalledTimes(1);
        expect(base.destroy).toHaveBeenCalledTimes(1);
        await expect(service.translate('Hello', translatorSettings, signal())).resolves.toBe('你好');
    });
});
