import { config } from '@/entrypoints/config/config';
import { chromeEngineOf } from '../registry';
import { chromeSystemPrompt, PROMPT_BATCH_MAX_SEGMENTS, translateBatchWithPrompt } from '../llm/chrome-prompt';
import type {
    AIAvailability, DownloadMonitor, ChromeAIAPIs, ChromeAISettings, ChromeAIStatus, NativeDetector,
    NativeLanguageModel, NativeTranslator, PromptLanguages,
} from '../chrome-ai-types';
import type { TranslateRequest } from '@/entrypoints/utils/messages';

export function chromeLanguage(language: string): string {
    if (language === 'zh-Hans') return 'zh';
    if (language === 'zh-Hant') return 'zh-Hant';
    return language;
}

function promptLanguages(from: string, to: string): PromptLanguages {
    return {
        // Gemma 4 的推测解码要求确定性采样；不传时 availability 直接返回 unavailable。
        samplingMode: 'most-predictable',
        expectedInputs: [{ type: 'text', languages: [...new Set(['en', chromeLanguage(from)])] }],
        expectedOutputs: [{ type: 'text', languages: [chromeLanguage(to)] }],
    };
}

function validate(settings: ChromeAISettings): void {
    if (!['translator', 'prompt'].includes(settings.engine)) throw new Error('Chrome 翻译引擎无效');
    if (!Array.isArray(settings.sources) || !settings.to || settings.to === 'auto') throw new Error('请选择有效的翻译语言');
}

// 低于这个置信度的检测结果不采用，避免短文本选错语言对。
const DETECTION_MIN_CONFIDENCE = 0.5;
// 检测器返回 zh，配置里存 zh-Hans：比较语言时只看主语言。
const primaryLanguage = (language: string): string => chromeLanguage(language).split('-')[0];
// 需要预先准备的原文语言；未勾选时先准备英语。
const preparedSources = (settings: ChromeAISettings): string[] => settings.sources.length ? settings.sources : ['en'];

// 只勾选一种原文语言时不需要检测器：检测不了就直接按它翻译。
const detectorRequired = (settings: ChromeAISettings): boolean => settings.sources.length !== 1;

// 一条后台串行队列跨标签页共享模型；会话仅在空闲时释放。
export class ChromeAIService {
    private tail: Promise<unknown> = Promise.resolve();
    private detector?: NativeDetector;
    private translator?: { key: string; session: NativeTranslator };
    private model?: { key: string; session: NativeLanguageModel };
    private idleTimer?: ReturnType<typeof setTimeout>;
    private preparing?: { key: string; promise: Promise<void>; status: ChromeAIStatus };
    private prompts: PromptRequest[] = [];

    constructor(private readonly apis: () => ChromeAIAPIs) {}

    private serial<T>(task: () => Promise<T>): Promise<T> {
        const run = this.tail.then(async () => {
            clearTimeout(this.idleTimer);
            try { return await task(); }
            finally { this.idleTimer = setTimeout(() => this.dispose(), 60_000); }
        });
        this.tail = run.catch(() => {});
        return run;
    }

    dispose(): void {
        clearTimeout(this.idleTimer);
        this.detector?.destroy();
        this.translator?.session.destroy();
        this.model?.session.destroy();
        this.detector = undefined;
        this.translator = undefined;
        this.model = undefined;
    }

    private key(settings: ChromeAISettings): string {
        return JSON.stringify(settings);
    }

    private async availability(settings: ChromeAISettings): Promise<AIAvailability> {
        const api = this.apis();
        const order: AIAvailability[] = ['unavailable', 'downloading', 'downloadable', 'available'];
        const states: AIAvailability[] = [];
        // 每种原文语言各查一次，取最差的状态。
        for (const source of preparedSources(settings)) {
            if (settings.engine === 'prompt') {
                if (!api.LanguageModel) return 'unavailable';
                states.push(await api.LanguageModel.availability(promptLanguages(source, settings.to)));
            } else {
                if (!api.Translator) return 'unavailable';
                states.push(chromeLanguage(source) === chromeLanguage(settings.to) ? 'available'
                    : await api.Translator.availability({ sourceLanguage: chromeLanguage(source), targetLanguage: chromeLanguage(settings.to) }));
            }
        }
        if (detectorRequired(settings)) {
            if (!api.LanguageDetector) return 'unavailable';
            states.push(await api.LanguageDetector.availability());
        }
        return order[Math.min(...states.map(state => order.indexOf(state)))];
    }

    // 区分「接口不存在」和「语言不支持」，让用户知道下一步该做什么。
    private async unavailableReason(settings: ChromeAISettings): Promise<string> {
        const api = this.apis();
        if (settings.engine === 'prompt') {
            if (!api.LanguageModel) return '当前 Chrome 没有开放内置大模型。请确认 Chrome 为 154 或更高版本，并按下方步骤开启 Gemma 4。';
        } else if (!api.Translator) {
            return '当前 Chrome 没有原生翻译 API，请升级 Chrome。';
        }
        if (detectorRequired(settings) && (!api.LanguageDetector || await api.LanguageDetector.availability() === 'unavailable')) {
            return '当前 Chrome 的语言检测不可用，无法使用 Chrome 本地翻译。';
        }
        return settings.engine === 'prompt'
            ? 'Chrome 大模型不支持所选语言。请按下方步骤开启多语言支持，或更换语言。'
            : '原生翻译不支持所选语言组合，请更换语言。';
    }

    async status(settings: ChromeAISettings): Promise<ChromeAIStatus> {
        validate(settings);
        if (this.preparing?.key === this.key(settings)) return { ...this.preparing.status };
        const availability = await this.availability(settings);
        const messages: Record<AIAvailability, string> = {
            unavailable: availability === 'unavailable' ? await this.unavailableReason(settings) : '',
            downloadable: '模型尚未下载，点击下载并初始化后即可使用。',
            downloading: 'Chrome 正在下载模型…',
            available: '模型已就绪。',
        };
        return { availability, message: messages[availability] };
    }

    private async checkReady(state: AIAvailability, allowDownload: boolean, label: string): Promise<void> {
        if (state === 'unavailable') throw new Error(`${label}不可用，请检查 Chrome 模型和语言支持`);
        if (state !== 'available' && !allowDownload) throw new Error(`${label}尚未就绪，请在设置中勾选对应的原文语言并下载模型`);
    }

    private monitor() {
        return (monitor: DownloadMonitor) => {
            monitor.addEventListener('downloadprogress', (event) => {
                if (this.preparing) {
                    this.preparing.status = {
                        availability: 'downloading', progress: Math.round(event.loaded * 100), message: 'Chrome 正在下载模型…',
                    };
                }
            });
        };
    }

    private async getDetector(signal: AbortSignal, download: boolean): Promise<NativeDetector> {
        if (this.detector) return this.detector;
        const api = this.apis().LanguageDetector;
        if (!api) throw new Error('Chrome 语言检测 API 不可用');
        await this.checkReady(await api.availability(), download, '语言检测模型');
        this.detector = await api.create({ signal, monitor: this.monitor() });
        return this.detector;
    }

    private async getTranslator(source: string, to: string, signal: AbortSignal, download: boolean): Promise<NativeTranslator> {
        // 键用归一化后的语言码，zh-Hans 与 zh 不会被当成两个语言对。
        const key = `${chromeLanguage(source)}:${chromeLanguage(to)}`;
        if (this.translator?.key === key) return this.translator.session;
        const api = this.apis().Translator;
        if (!api) throw new Error('Chrome 原生翻译 API 不可用');
        const languages = { sourceLanguage: chromeLanguage(source), targetLanguage: chromeLanguage(to) };
        await this.checkReady(await api.availability(languages), download, `翻译模型（${source} → ${to}）`);
        this.translator?.session.destroy();
        this.translator = undefined;
        const session = await api.create({ ...languages, signal, monitor: this.monitor() });
        this.translator = { key, session };
        return session;
    }

    private async getModel(source: string, to: string, signal: AbortSignal, download: boolean): Promise<NativeLanguageModel> {
        // 键用归一化后的语言码，zh-Hans 与 zh 不会被当成两个语言对。
        const key = `${chromeLanguage(source)}:${chromeLanguage(to)}`;
        if (this.model?.key === key) return this.model.session;
        const api = this.apis().LanguageModel;
        if (!api) throw new Error('Chrome Prompt API 不可用');
        const languages = promptLanguages(source, to);
        await this.checkReady(await api.availability(languages), download, `Chrome 大模型（${source} → ${to}）`);
        this.model?.session.destroy();
        this.model = undefined;
        const session = await api.create({
            ...languages, signal, monitor: this.monitor(),
            initialPrompts: [{ role: 'system', content: chromeSystemPrompt(to) }],
        });
        this.model = { key, session };
        return session;
    }

    // 返回这段文字的原文语言；不需要翻译（与目标语言相同或不在原文语言列表内）时返回 undefined。
    private async resolveSource(text: string, settings: ChromeAISettings, signal: AbortSignal): Promise<string | undefined> {
        const { sources } = settings;
        let detector: NativeDetector;
        try {
            detector = await this.getDetector(signal, false);
        } catch (error) {
            // 只勾选一种时检测器可有可无：没有就直接按它翻译。
            if (detectorRequired(settings) || signal.aborted) throw error;
            return chromeLanguage(sources[0]) === chromeLanguage(settings.to) ? undefined : sources[0];
        }
        const best = (await detector.detect(text, { signal }))[0];
        let source: string | undefined = best?.detectedLanguage;
        const detected = !!source && source !== 'und';
        if (!sources.length) {
            // 未勾选 = 翻译所有语言：不看置信度，检测不出才保持原样。
            if (!detected) return undefined;
        } else if (!detected || best.confidence < DETECTION_MIN_CONFIDENCE) {
            // 检测不出或把握不足：只勾选一种原文语言时按它翻译，否则保持原样。
            if (sources.length !== 1) return undefined;
            source = sources[0];
        } else if (!sources.some(language => primaryLanguage(language) === primaryLanguage(source!))) {
            return undefined;
        }
        return chromeLanguage(source!) === chromeLanguage(settings.to) ? undefined : source;
    }

    // 下载只由设置面板的显式操作触发，不占普通翻译的超时窗口。
    initialize(settings: ChromeAISettings): Promise<void> {
        validate(settings);
        const key = this.key(settings);
        if (this.preparing) {
            if (this.preparing.key === key) return this.preparing.promise;
            throw new Error('另一个 Chrome 模型正在初始化，请等待完成');
        }
        const promise = this.serial(async () => {
            const signal = new AbortController().signal;
            await this.checkReady(await this.availability(settings), true, 'Chrome 模型');
            try {
                await this.getDetector(signal, true);
            } catch (error) {
                if (detectorRequired(settings) || signal.aborted) throw error;
            }
            for (const source of preparedSources(settings)) {
                if (settings.engine === 'prompt') await this.getModel(source, settings.to, signal, true);
                else if (chromeLanguage(source) !== chromeLanguage(settings.to)) await this.getTranslator(source, settings.to, signal, true);
            }
        }).finally(() => { this.preparing = undefined; });
        this.preparing = { key, promise, status: { availability: 'downloading', message: 'Chrome 正在初始化模型…' } };
        return promise;
    }

    translate(text: string, settings: ChromeAISettings, signal: AbortSignal, timeout = 45_000): Promise<string> {
        validate(settings);
        if (typeof text !== 'string' || !text.trim()) throw new Error('翻译文本不能为空');
        if (settings.engine === 'prompt') {
            return new Promise((resolve, reject) => {
                this.prompts.push({ text, settings, signal, timeout, resolve, reject });
                void this.serial(() => this.drainPrompts());
            });
        }
        return this.serial(async () => {
            signal.throwIfAborted();
            const controller = new AbortController();
            const abort = () => controller.abort(signal.reason);
            signal.addEventListener('abort', abort, { once: true });
            const timer = setTimeout(() => controller.abort(new Error('Chrome 翻译请求超时')), timeout);
            try {
                const source = await this.resolveSource(text, settings, controller.signal);
                controller.signal.throwIfAborted();
                if (!source) return text;
                const result = await (await this.getTranslator(source, settings.to, controller.signal, false)).translate(text, { signal: controller.signal });
                if (!result.trim()) throw new Error('Chrome 返回空译文');
                return result;
            } catch (error) {
                // 中止会话后不复用失效的原生对象。
                this.dispose();
                if (controller.signal.aborted) throw controller.signal.reason;
                throw error;
            } finally {
                clearTimeout(timer);
                signal.removeEventListener('abort', abort);
            }
        });
    }

    // 大模型请求排队期间攒下的同配置请求合并成一批推理，减少调用次数。
    private async drainPrompts(): Promise<void> {
        const live = this.prompts.filter(item => {
            if (item.signal.aborted) item.reject(item.signal.reason);
            return !item.signal.aborted;
        });
        const head = live[0];
        if (!head) { this.prompts = []; return; }
        const key = this.key(head.settings);
        const group = live.filter(item => this.key(item.settings) === key).slice(0, PROMPT_BATCH_MAX_SEGMENTS);
        this.prompts = live.filter(item => !group.includes(item));

        const controller = new AbortController();
        // 单个请求取消只结束它自己；整批都取消才中止推理。
        const abort = () => {
            group.forEach(item => { if (item.signal.aborted) item.reject(item.signal.reason); });
            if (group.every(item => item.signal.aborted)) controller.abort(head.signal.reason);
        };
        group.forEach(item => item.signal.addEventListener('abort', abort));
        const timer = setTimeout(() => controller.abort(new Error('Chrome 翻译请求超时')), head.timeout);
        try {
            const bySource = new Map<string, PromptRequest[]>();
            for (const item of group) {
                let source: string | undefined;
                try {
                    source = await this.resolveSource(item.text, head.settings, controller.signal);
                } catch (error) {
                    if (controller.signal.aborted) throw error;
                    item.reject(error);
                    continue;
                }
                if (!source) { item.resolve(item.text); continue; }
                bySource.set(source, [...bySource.get(source) || [], item]);
            }
            for (const [source, items] of bySource) {
                controller.signal.throwIfAborted();
                const model = await this.getModel(source, head.settings.to, controller.signal, false);
                const results = await translateBatchWithPrompt(model, items.map(item => item.text), controller.signal);
                items.forEach((item, index) => item.resolve(results[index]));
            }
        } catch (error) {
            // 中止会话后不复用失效的原生对象。
            this.dispose();
            const reason = controller.signal.aborted ? controller.signal.reason : error;
            group.forEach(item => item.reject(reason));
        } finally {
            clearTimeout(timer);
            group.forEach(item => item.signal.removeEventListener('abort', abort));
        }
    }
}

interface PromptRequest {
    text: string;
    settings: ChromeAISettings;
    signal: AbortSignal;
    timeout: number;
    resolve: (result: string) => void;
    reject: (reason: unknown) => void;
}

export const chromeAI = new ChromeAIService(() => globalThis as ChromeAIAPIs);

export default async function chromeTranslator(message: TranslateRequest): Promise<string> {
    return chromeAI.translate(message.origin, message.chromeAI || {
        engine: chromeEngineOf(config.service), sources: config.sourceLanguages, to: config.to,
    }, new AbortController().signal, message.timeout);
}
