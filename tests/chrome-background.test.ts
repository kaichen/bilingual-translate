import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BackgroundMessage, TranslateRequest } from '../entrypoints/utils/messages';
vi.mock('@/entrypoints/config/config', () => ({ config: { service: 'google' }, configReady: Promise.resolve() }));
vi.mock('@/entrypoints/providers/service', () => ({ _service: { google: vi.fn(async () => '云端译文') } }));
vi.mock('@/entrypoints/providers/translate/microsoft', () => ({ microsoftTranslate: vi.fn() }));
vi.mock('@/entrypoints/providers/translate/chrome-builtin-ai', () => ({ chromeAI: { translate: vi.fn(), status: vi.fn(), initialize: vi.fn() } }));
import { chromeAI } from '../entrypoints/providers/translate/chrome-builtin-ai';

let handler: (message: BackgroundMessage | TranslateRequest, sender: chrome.runtime.MessageSender) => Promise<unknown>;
let removed: (id: number) => void;
async function setup() {
    vi.stubGlobal('defineBackground', (options: { main: () => void }) => { options.main(); return options; });
    vi.stubGlobal('browser', {
        contextMenus: undefined,
        runtime: { onMessage: { addListener: (fn: typeof handler) => { handler = fn; } } },
        tabs: {
            onActivated: { addListener: vi.fn() }, onUpdated: { addListener: vi.fn() },
            onRemoved: { addListener: (fn: typeof removed) => { removed = fn; } },
        },
    });
    await import('../entrypoints/background');
}
const sender = (id = 1, documentId = 'document') => ({ tab: { id }, frameId: 0, documentId } as chrome.runtime.MessageSender);
const request: TranslateRequest = { context: '标题', origin: 'Hello', requestId: 'req', chromeAI: { engine: 'prompt', from: 'en', to: 'zh-Hans' } };
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); vi.clearAllMocks(); });

describe('Chrome 后台消息', () => {
    it('按原生请求快照分发，不读取之后切换的云端服务', async () => {
        await setup();
        vi.mocked(chromeAI.translate).mockResolvedValue('你好');
        expect(await handler(request, sender())).toEqual({ success: true, result: '你好' });
        expect(chromeAI.translate).toHaveBeenCalledWith(request.origin, request.chromeAI, expect.any(AbortSignal), undefined);
    });

    it('仅当前页面可取消自己的原生请求，返回取消状态', async () => {
        await setup();
        let signal: AbortSignal | undefined;
        vi.mocked(chromeAI.translate).mockImplementation((_text, _settings, input) => new Promise((_resolve, reject) => {
            signal = input;
            input.addEventListener('abort', () => reject(input.reason), { once: true });
        }));
        const response = handler(request, sender());
        await vi.waitFor(() => expect(signal).toBeDefined());
        await handler({ type: 'cancelChromeTranslation', requestId: 'req' }, sender(2));
        expect(signal!.aborted).toBe(false);
        await handler({ type: 'cancelChromeTranslation', requestId: 'req' }, sender(1, 'other-document'));
        expect(signal!.aborted).toBe(false);
        await handler({ type: 'cancelChromeTranslation', requestId: 'req' }, sender());
        expect(await response).toEqual({ success: false, error: '翻译已取消', cancelled: true });
    });

    it('关闭标签页时中止该页的原生推理', async () => {
        await setup();
        vi.mocked(chromeAI.translate).mockImplementation((_text, _settings, input) => new Promise((_resolve, reject) => {
            input.addEventListener('abort', () => reject(input.reason), { once: true });
        }));
        const response = handler(request, sender(15));
        await vi.waitFor(() => expect(chromeAI.translate).toHaveBeenCalled());
        removed(15);
        expect(await response).toEqual({ success: false, error: '页面已关闭', cancelled: true });
    });
});
