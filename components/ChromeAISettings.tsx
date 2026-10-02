import { useEffect, useRef, useState } from 'preact/hooks';
import browser from 'webextension-polyfill';
import type { ChromeAISettings as Settings, ChromeAIStatus } from '@/entrypoints/providers/chrome-ai-types';
import type { BackgroundMessage } from '@/entrypoints/utils/messages';

// chrome:// 地址不能用普通链接跳转，交给 tabs.create；被拒绝时退回复制地址。
function FlagLink({ url }: { url: string }) {
    const [copied, setCopied] = useState(false);
    async function open() {
        try {
            await browser.tabs.create({ url });
        } catch {
            await navigator.clipboard.writeText(url);
            setCopied(true);
        }
    }
    return <>
        <code>{url}</code>
        <button className="bt-native-ai-flag" type="button" onClick={open}>{copied ? '已复制，请粘贴到地址栏' : '打开'}</button>
    </>;
}

export default function ChromeAISettings({ settings }: { settings: Settings }) {
    const [status, setStatus] = useState<ChromeAIStatus>();
    const [pollError, setPollError] = useState('');
    const [initError, setInitError] = useState('');
    const lastAvailability = useRef<string>();
    const [initializing, setInitializing] = useState(false);
    const mounted = useRef(true);

    async function refresh() {
        try {
            const response = await browser.runtime.sendMessage({ type: 'getChromeAIStatus', settings } satisfies BackgroundMessage) as ChromeAIStatus | { success: false; error: string };
            if (!response || !('availability' in response)) throw new Error((response && 'error' in response ? response.error : '无法读取 Chrome 模型状态'));
            if (!mounted.current) return;
            setStatus(response as ChromeAIStatus);
            setPollError('');
            // 可用状态变化后，旧的初始化错误不再有意义
            if (lastAvailability.current !== undefined && lastAvailability.current !== response.availability) setInitError('');
            lastAvailability.current = response.availability;
        } catch (err) {
            if (mounted.current) setPollError(err instanceof Error ? err.message : String(err));
        }
    }

    useEffect(() => {
        mounted.current = true;
        let timer: ReturnType<typeof setTimeout>;
        async function poll() {
            await refresh();
            if (mounted.current) timer = setTimeout(poll, 1500);
        }
        void poll();
        return () => { mounted.current = false; clearTimeout(timer); };
    }, []);

    async function initialize() {
        setInitError('');
        setInitializing(true);
        try {
            const response = await browser.runtime.sendMessage({ type: 'initializeChromeAI', settings } satisfies BackgroundMessage) as { success: boolean; error?: string };
            if (!response?.success) throw new Error(response?.error || 'Chrome 模型初始化失败');
        } catch (err) {
            if (mounted.current) setInitError(err instanceof Error ? err.message : String(err));
        } finally {
            if (mounted.current) { setInitializing(false); void refresh(); }
        }
    }

    return <div className="bt-native-ai">
        <div className="bt-native-ai-status" role="status" aria-live="polite">
            {initError || pollError || status?.message || '正在检查 Chrome 模型…'}
            {status?.availability === 'downloading' && status.progress !== undefined && <progress max={100} value={status.progress} aria-label="模型下载进度" />}
            {status?.availability === 'downloading' && status.progress !== undefined && <span>{status.progress}%</span>}
        </div>
        {(initializing || status?.availability === 'downloading') && <button className="bt-button bt-full-width" type="button" disabled>正在准备模型…</button>}
        {!initializing && status?.availability === 'downloadable' && <>
            <button className="bt-button bt-full-width" type="button" onClick={initialize}>下载模型</button>
            <p className="bt-native-ai-note">模型体积较大，仅需下载一次。</p>
        </>}
        {!settings.sources.length && settings.engine === 'translator' && <p className="bt-native-ai-note">未勾选原文语言时只准备英语到目标语言。要翻译其他语言，请在上方「原文语言」里勾选后下载对应模型。</p>}
        {settings.engine === 'prompt' && <details className="bt-native-ai-setup" open={status?.availability === 'unavailable'}>
            <summary>Gemma 4 首次设置</summary>
            <ol>
                <li>使用 Chrome 154 或更高版本。</li>
                <li>启用 Gemma 4：<FlagLink url="chrome://flags/#gemma4-for-built-in-ai" /></li>
                <li>选择 Enabled Multilingual 以支持中文等语言：<FlagLink url="chrome://flags/#prompt-api" /></li>
                <li>重启 Chrome。</li>
            </ol>
            <p>模型版本由 Chrome 管理。插件按实际语言检查可用性，首次下载后可离线翻译，无需令牌。</p>
        </details>}
    </div>;
}
