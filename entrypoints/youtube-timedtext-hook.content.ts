export default defineContentScript({
    matches: ['*://*.youtube.com/*'],
    world: 'MAIN',
    runAt: 'document_start',
    main() {
        const hookWindow = window as Window & { __flYtTimedtextHookPatched?: boolean };
        if (hookWindow.__flYtTimedtextHookPatched) return;
        hookWindow.__flYtTimedtextHookPatched = true;

        const isTimedtextUrl = (url: unknown): url is string =>
            typeof url === 'string' && url.includes('timedtext');

        const fetchRequestUrl = (input: RequestInfo | URL): string => {
            try {
                if (typeof input === 'string' || input instanceof URL) return String(input);
                return input.url;
            } catch {
                return '';
            }
        };

        const postTimedtext = (url: string, body: string) => {
            try {
                window.postMessage({ source: 'fl-yt-timedtext', url, body }, '*');
            } catch {
                // 主世界脚本不能影响页面运行
            }
        };

        try {
            const originalOpen = XMLHttpRequest.prototype.open;
            const originalSend = XMLHttpRequest.prototype.send;
            const requestUrls = new WeakMap<XMLHttpRequest, string>();

            XMLHttpRequest.prototype.open = function (
                this: XMLHttpRequest,
                method: string,
                url: string | URL,
                async?: boolean,
                username?: string | null,
                password?: string | null,
            ) {
                try {
                    const requestUrl = String(url ?? '');
                    if (isTimedtextUrl(requestUrl)) requestUrls.set(this, requestUrl);
                } catch {
                    // 忽略页面侧异常
                }

                const args = async === undefined
                    ? [method, url]
                    : [method, url, async, username, password];
                return (originalOpen as (...openArgs: unknown[]) => void).apply(this, args);
            } as typeof XMLHttpRequest.prototype.open;

            XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, ...args: Parameters<typeof originalSend>) {
                try {
                    this.addEventListener('loadend', () => {
                        try {
                            const url = this.responseURL || requestUrls.get(this) || '';
                            if (!isTimedtextUrl(url)) return;
                            const responseType = this.responseType;
                            if (responseType && responseType !== 'text') return;
                            postTimedtext(url, this.responseText);
                        } catch {
                            // 忽略无法读取 responseText 的请求
                        }
                    });
                } catch {
                    // 忽略页面侧异常
                }

                return originalSend.apply(this, args);
            };
        } catch {
            // 保持页面脚本可用
        }

        try {
            const originalFetch = window.fetch;
            window.fetch = async function (...args: Parameters<typeof fetch>) {
                const requestUrl = fetchRequestUrl(args[0]);

                const response = await originalFetch.apply(this, args);
                const finalUrl = response.url || requestUrl;
                if (isTimedtextUrl(finalUrl)) {
                    response.clone().text()
                        .then(body => postTimedtext(finalUrl, body))
                        .catch(() => {});
                }

                return response;
            };
        } catch {
            // 保持页面脚本可用
        }
    }
});
