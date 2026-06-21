// 站点维度 key：取 hostname、去前导 www、转小写。
// 供「始终翻译此网站」在 content（判定）与 popup（存储/比较）间保持一致。纯函数、零依赖。
export function getDomainKey(href: string): string {
    try {
        const url = href.includes('://') ? new URL(href) : new URL(`https://${href}`);
        return url.hostname.replace(/^www\./, '').toLowerCase();
    } catch {
        return '';
    }
}
