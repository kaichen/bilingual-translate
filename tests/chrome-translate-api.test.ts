import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Config } from '../entrypoints/config/model';
import { services } from '../entrypoints/config/option';
vi.mock('@/entrypoints/config/config', async () => {
    const { Config } = await import('../entrypoints/config/model');
    return { config: new Config() };
});
vi.mock('webextension-polyfill', () => ({ default: { runtime: { sendMessage: vi.fn() } } }));
vi.mock('@wxt-dev/storage', () => ({ storage: { setItem: vi.fn() } }));
vi.mock('../entrypoints/utils/common', () => ({ shouldSkipTranslation: () => false }));
import browser from 'webextension-polyfill';
import { config } from '../entrypoints/config/config';
import { cancelAllTranslations, translateText } from '../entrypoints/translate/translateApi';

const send = vi.mocked(browser.runtime.sendMessage);
beforeEach(() => {
    Object.assign(config, new Config({ service: services.chromeTranslator, chromeTranslationEngine: 'prompt' }));
    send.mockReset();
    localStorage.clear();
});
afterEach(() => cancelAllTranslations());

describe('Chrome 翻译管线', () => {
    it('发送引擎/语言快照和推理时限，解包成功结果', async () => {
        send.mockResolvedValue({ success: true, result: '你好' });
        expect(await translateText('Hello', '标题', { useCache: false, timeout: 500 })).toBe('你好');
        expect(send).toHaveBeenCalledTimes(1);
        expect(send).toHaveBeenCalledWith(expect.objectContaining({
            context: '标题', origin: 'Hello', requestId: expect.any(String), timeout: 500,
            chromeAI: { engine: 'prompt', from: 'auto', to: 'zh-Hans' },
        }));
    });

    it('模型不可用不重试；云端服务仍按原策略重试', async () => {
        send.mockResolvedValue({ success: false, error: '模型不可用' });
        await expect(translateText('Hello', '', { useCache: false, retryDelay: 0 })).rejects.toThrow('模型不可用');
        expect(send).toHaveBeenCalledTimes(1);
        config.service = services.deepseek;
        send.mockReset().mockRejectedValueOnce(new Error('网络失败')).mockResolvedValueOnce('你好');
        expect(await translateText('Hello', '', { useCache: false, retryDelay: 0, maxRetries: 1 })).toBe('你好');
        expect(send).toHaveBeenCalledTimes(2);
    });

    it('取消发送当前活跃请求编号，同时拒绝未发送的排队请求', async () => {
        let complete!: (response: unknown) => void;
        send.mockImplementation(message => (message as { type?: string }).type === 'cancelChromeTranslation'
            ? Promise.resolve({ success: true }) : new Promise(resolve => { complete = resolve; }));
        const first = translateText('Hello', '', { useCache: false });
        const pending = translateText('World', '', { useCache: false });
        const firstRejected = expect(first).rejects.toThrow('取消');
        const pendingRejected = expect(pending).rejects.toThrow('取消');
        const requestId = (send.mock.calls[0][0] as { requestId: string }).requestId;
        cancelAllTranslations();
        expect(send).toHaveBeenCalledWith({ type: 'cancelChromeTranslation', requestId });
        complete({ success: false, error: '翻译已取消', cancelled: true });
        await firstRejected;
        await pendingRejected;
        expect(send).toHaveBeenCalledTimes(2);
    });

    it('在切换引擎后完成的结果不写入新引擎缓存', async () => {
        let complete!: (response: unknown) => void;
        send.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
        const result = translateText('Hello', '');
        config.chromeTranslationEngine = 'translator';
        complete({ success: true, result: '你好' });
        expect(await result).toBe('你好');
        expect(localStorage.length).toBe(0);
    });
});
