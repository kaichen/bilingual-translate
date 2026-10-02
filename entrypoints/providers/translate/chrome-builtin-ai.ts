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
    if (!settings.from || !settings.to || settings.to === 'auto') throw new Error('请选择有效的翻译语言');
}

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
        const source = settings.from === 'auto' ? 'en' : settings.from;
        let state: AIAvailability;
        if (settings.engine === 'prompt') {
            if (!api.LanguageModel) return 'unavailable';
            state = await api.LanguageModel.availability(promptLanguages(source, settings.to));
        } else {
            if (!api.Translator) return 'unavailable';
            state = chromeLanguage(source) === chromeLanguage(settings.to) ? 'available'
                : await api.Translator.availability({ sourceLanguage: chromeLanguage(source), targetLanguage: chromeLanguage(settings.to) });
        }
        if (settings.from !== 'auto') return state;
        if (!api.LanguageDetector) return 'unavailable';
        const detectorState = await api.LanguageDetector.availability();
        const order: AIAvailability[] = ['unavailable', 'downloading', 'downloadable', 'available'];
        return order[Math.min(order.indexOf(state), order.indexOf(detectorState))];
    }

    // 区分「接口不存在」和「语言不支持」，让用户知道下一步该做什么。
    private async unavailableReason(settings: ChromeAISettings): Promise<string> {
        const api = this.apis();
        if (settings.engine === 'prompt') {
            if (!api.LanguageModel) return '当前 Chrome 没有开放内置大模型。请确认 Chrome 为 154 或更高版本，并按下方步骤开启 Gemma 4。';
        } else if (!api.Translator) {
            return '当前 Chrome 没有原生翻译 API，请升级 Chrome。';
        }
        if (settings.from === 'auto' && (!api.LanguageDetector || await api.LanguageDetector.availability() === 'unavailable')) {
            return '当前 Chrome 的语言检测不可用，请手动选择源语言。';
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
            available: settings.from === 'auto' ? '模型已就绪；实际源语言将在翻译时检查。' : '模型已就绪。',
        };
        return { availability, message: messages[availability] };
    }

    private async checkReady(state: AIAvailability, allowDownload: boolean, label: string): Promise<void> {
        if (state === 'unavailable') throw new Error(`${label}不可用，请检查 Chrome 模型和语言支持`);
        if (state !== 'available' && !allowDownload) throw new Error(`${label}尚未就绪，请在设置中选择源语言并下载、初始化模型`);
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

    private async getDetector(settings: ChromeAISettings, signal: AbortSignal, download: boolean): Promise<NativeDetector> {
        if (this.detector) return this.detector;
        const api = this.apis().LanguageDetector;
        if (!api) throw new Error('Chrome 语言检测 API 不可用');
        await this.checkReady(await api.availability(), download, '语言检测模型');
        this.detector = await api.create({ signal, monitor: this.monitor() });
        return this.detector;
    }

    private async getTranslator(settings: ChromeAISettings, signal: AbortSignal, download: boolean): Promise<NativeTranslator> {
        const key = this.key(settings);
        if (this.translator?.key === key) return this.translator.session;
        const api = this.apis().Translator;
        if (!api) throw new Error('Chrome 原生翻译 API 不可用');
        const languages = { sourceLanguage: chromeLanguage(settings.from), targetLanguage: chromeLanguage(settings.to) };
        await this.checkReady(await api.availability(languages), download, `翻译模型（${settings.from} → ${settings.to}）`);
        this.translator?.session.destroy();
        this.translator = undefined;
        const session = await api.create({ ...languages, signal, monitor: this.monitor() });
        this.translator = { key, session };
        return session;
    }

    private async getModel(settings: ChromeAISettings, signal: AbortSignal, download: boolean): Promise<NativeLanguageModel> {
        const key = this.key(settings);
        if (this.model?.key === key) return this.model.session;
        const api = this.apis().LanguageModel;
        if (!api) throw new Error('Chrome Prompt API 不可用');
        const languages = promptLanguages(settings.from, settings.to);
        await this.checkReady(await api.availability(languages), download, `Chrome 大模型（${settings.from} → ${settings.to}）`);
        this.model?.session.destroy();
        this.model = undefined;
        const session = await api.create({
            ...languages, signal, monitor: this.monitor(),
            initialPrompts: [{ role: 'system', content: chromeSystemPrompt(settings.to) }],
        });
        this.model = { key, session };
        return session;
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
            if (settings.from === 'auto') await this.getDetector(settings, signal, true);
            const effective = { ...settings, from: settings.from === 'auto' ? 'en' : settings.from };
            if (settings.engine === 'prompt') await this.getModel(effective, signal, true);
            else if (chromeLanguage(effective.from) !== chromeLanguage(effective.to)) await this.getTranslator(effective, signal, true);
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
                let source = settings.from;
                if (source === 'auto') {
                    const detector = await this.getDetector(settings, controller.signal, false);
                    const detected = await detector.detect(text, { signal: controller.signal });
                    source = detected[0]?.detectedLanguage;
                    if (!source || source === 'und') throw new Error('无法检测文本语言，请在设置中选择源语言');
                }
                controller.signal.throwIfAborted();
                if (chromeLanguage(source) === chromeLanguage(settings.to)) return text;
                const effective = { ...settings, from: source };
                const result = await (await this.getTranslator(effective, controller.signal, false)).translate(text, { signal: controller.signal });
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
                let source = head.settings.from;
                if (source === 'auto') {
                    const detector = await this.getDetector(head.settings, controller.signal, false);
                    source = (await detector.detect(item.text, { signal: controller.signal }))[0]?.detectedLanguage;
                    if (!source || source === 'und') { item.reject(new Error('无法检测文本语言，请在设置中选择源语言')); continue; }
                }
                if (chromeLanguage(source) === chromeLanguage(head.settings.to)) { item.resolve(item.text); continue; }
                bySource.set(source, [...bySource.get(source) || [], item]);
            }
            for (const [source, items] of bySource) {
                controller.signal.throwIfAborted();
                const model = await this.getModel({ ...head.settings, from: source }, controller.signal, false);
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
        engine: chromeEngineOf(config.service), from: config.from, to: config.to,
    }, new AbortController().signal, message.timeout);
}
