// Chrome 扩展 Service Worker 中的内置 AI 原生接口。
export type AIAvailability = 'unavailable' | 'downloadable' | 'downloading' | 'available';
export type ChromeTranslationEngine = 'translator' | 'prompt';
export interface ChromeAISettings {
    engine: ChromeTranslationEngine;
    from: string;
    to: string;
}
export interface ChromeAIStatus {
    availability: AIAvailability;
    message: string;
    progress?: number;
}
export interface DownloadMonitor {
    addEventListener(type: 'downloadprogress', listener: (event: { loaded: number }) => void): void;
}
interface CreateOptions {
    signal?: AbortSignal;
    monitor?: (monitor: DownloadMonitor) => void;
}
export interface NativeTranslator {
    translate(text: string, options?: { signal?: AbortSignal }): Promise<string>;
    destroy(): void;
}
export interface NativeDetector {
    detect(text: string, options?: { signal?: AbortSignal }): Promise<{ detectedLanguage: string; confidence: number }[]>;
    destroy(): void;
}
export interface PromptLanguages {
    expectedInputs: { type: 'text'; languages: string[] }[];
    expectedOutputs: { type: 'text'; languages: string[] }[];
}
export interface NativeLanguageModel {
    readonly contextWindow: number;
    readonly contextUsage: number;
    measureContextUsage(text: string, options?: { signal?: AbortSignal }): Promise<number>;
    clone(options?: { signal?: AbortSignal }): Promise<NativeLanguageModel>;
    prompt(text: string, options?: { signal?: AbortSignal }): Promise<string>;
    destroy(): void;
}
export interface ChromeAIAPIs {
    Translator?: {
        availability(options: { sourceLanguage: string; targetLanguage: string }): Promise<AIAvailability>;
        create(options: CreateOptions & { sourceLanguage: string; targetLanguage: string }): Promise<NativeTranslator>;
    };
    LanguageDetector?: {
        availability(): Promise<AIAvailability>;
        create(options?: CreateOptions): Promise<NativeDetector>;
    };
    LanguageModel?: {
        availability(options: PromptLanguages): Promise<AIAvailability>;
        create(options: CreateOptions & PromptLanguages & {
            initialPrompts: { role: 'system'; content: string }[];
        }): Promise<NativeLanguageModel>;
    };
}
