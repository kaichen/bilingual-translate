// 兼容部分网站独特的 DOM 结构

import {findMatchingElement} from "@/entrypoints/utils/common";
import {githubRule} from "./github";
import {hackerNewsRule} from "./hacker-news";
import {redditRule} from "./reddit";
import {debugLog} from "./shared";
import {xRule} from "./x";
import {youtubeLiveChatRule, youtubeRule} from "./youtube";

export interface SiteCompatRule {
    pattern: string;
    // 按序匹配：每项可为逗号串（任一最近祖先），项间按优先级先到先得。
    // 统一吸收旧 selector 逗号串与旧 selectCompatFn 的 findMatchingElement 链。
    selector?: string | string[];
    segmentSelector?: string;
    rootsSelector?: string;
    ignoreSelector?: string;
    autoScan?: boolean;
    // 命令式跳过逃生舱：select 表达不了的启发式跳过（原 shouldSkip*）。仅在 selectSiteRuleNode 单节点路径生效。
    skipNode?: (node: any) => boolean;
    // 译文回填逃生舱：需要保留原节点结构时的自定义写回（原 replaceCompatFn）。
    replace?: (node: any, text: any) => void;
    selectStyle?: string;
    parentStyle?: string;
    grandStyle?: string;
}

// selector 归一为字符串数组：string → [string]，数组原样，空值 → []
export function selectorList(selector?: string | string[]): string[] {
    if (Array.isArray(selector)) return selector.filter(s => s?.trim());
    return selector?.trim() ? [selector] : [];
}

const DEFAULT_IGNORE_SELECTOR = "button, footer, pre, mark, nav, svg, img[src*='.svg'], [class*='logo'] svg, [id*='logo'] svg";

// 站点规则注册表（单一真相源）。selector 为数组时：首项是全局批量扫描选择器，
// 整个数组是 hover 单节点上卷链（按序优先）。命令式跳过走 skipNode，译文回填走 replace。
export const siteCompatRules: SiteCompatRule[] = [
    {
        pattern: "en.wikipedia.org",
        ignoreSelector: ".button, code, footer, form, mark, pre, .mwe-math-element, .mw-editsection",
    },
    hackerNewsRule,
    xRule,
    redditRule,
    youtubeLiveChatRule,
    youtubeRule,
    {
        pattern: "web.telegram.org",
        selector: ".text-content, .embedded-text-wrapper",
        rootsSelector: ".Transition",
        autoScan: false,
    },
    githubRule,
    {
        pattern: "mvnrepository.com",
        selector: "div.im-description",
    },
    {
        pattern: "aozora.gr.jp",
        selector: "div.main_text",
    },
    {
        pattern: "webtrees.net",
        selector: "div.kmsg",
    },
    {
        pattern: "stackoverflow.com",
        selector: [
            "h1.question-hyperlink",
            "div.excerpt",
            "div.question-status",
            "div.profile-about",
            "div.s-notice",
        ],
        skipNode: shouldSkipStackOverflowElement,
    },
    {
        pattern: "medium.com",
        selector: [
            "h1",
            "h2",
            "p",
            "li",
            "blockquote",
            "article section",
            "p.pw-author-note",
            "div.pw-responses-thread p",
        ],
        skipNode: shouldSkipMediumElement,
    },
];

function getUrlParts(href: string = location.href): {href: string; hostname: string; pathname: string} {
    try {
        const url = href.includes("://") ? new URL(href) : new URL(`https://${href}`);
        return {
            href: url.href,
            hostname: url.hostname.replace(/^www\./, ""),
            pathname: url.pathname,
        };
    } catch {
        const [hostWithPath = ""] = href.replace(/^(https?:\/\/)/, "").split("?");
        const slashIndex = hostWithPath.indexOf("/");
        const hostname = (slashIndex >= 0 ? hostWithPath.slice(0, slashIndex) : hostWithPath).replace(/^www\./, "");
        const pathname = slashIndex >= 0 ? hostWithPath.slice(slashIndex) : "/";
        return {href, hostname, pathname};
    }
}

function matchRulePattern(rule: SiteCompatRule, href: string): boolean {
    const url = getUrlParts(href);
    const domain = getMainDomain(href);

    return rule.pattern.split(",").some(rawPattern => {
        const pattern = rawPattern.trim().replace(/^https?:\/\//, "").replace(/^www\./, "");
        if (!pattern) return false;

        if (pattern.includes("/")) {
            const [host, ...pathParts] = pattern.split("/");
            const path = `/${pathParts.join("/")}`;
            return (url.hostname === host || domain === host) && url.pathname.startsWith(path);
        }

        return url.hostname === pattern || domain === pattern;
    });
}

export function getSiteCompatRule(href: string = location.href): SiteCompatRule | undefined {
    return siteCompatRules.find(rule => matchRulePattern(rule, href));
}

function isSelectorRoot(node: Node): node is Element | Document | DocumentFragment {
    return node instanceof Element || node instanceof Document || node instanceof DocumentFragment;
}

function safeMatches(node: Element, selector?: string): boolean {
    if (!selector?.trim()) return false;
    try {
        return node.matches(selector);
    } catch (error) {
        debugLog("Compat", "无效选择器 matches:", selector, error);
        return false;
    }
}

function safeClosest(node: Element, selector?: string): Element | null {
    if (!selector?.trim()) return null;
    try {
        return node.closest(selector);
    } catch (error) {
        debugLog("Compat", "无效选择器 closest:", selector, error);
        return null;
    }
}

function safeQuerySelectorAll(root: Element | Document | DocumentFragment, selector?: string): Element[] {
    if (!selector?.trim()) return [];
    try {
        return Array.from(root.querySelectorAll(selector));
    } catch (error) {
        debugLog("Compat", "无效选择器 querySelectorAll:", selector, error);
        return [];
    }
}

function appendCssText(node: Element | null | undefined, cssText?: string): void {
    if (!(node instanceof HTMLElement) || !cssText?.trim()) return;
    const existing = node.getAttribute("style") || "";
    if (existing.includes(cssText)) return;
    node.style.cssText = `${existing}${existing.trim().endsWith(";") || !existing.trim() ? "" : ";"}${cssText}`;
}

export function applySiteRuleStyles(node: Element, rule: SiteCompatRule | undefined = getSiteCompatRule()): Element {
    if (!rule) return node;

    appendCssText(node, rule.selectStyle);
    appendCssText(node.parentElement, rule.parentStyle);
    appendCssText(node.parentElement?.parentElement, rule.grandStyle);

    return node;
}

export function isIgnoredBySiteRule(node: Element, rule: SiteCompatRule | undefined = getSiteCompatRule()): boolean {
    const selector = [
        DEFAULT_IGNORE_SELECTOR,
        rule?.ignoreSelector,
    ].filter(Boolean).join(", ");

    return Boolean(safeClosest(node, selector));
}

export function getSiteRuleRoots(rootNode: Node, rule: SiteCompatRule | undefined = getSiteCompatRule()): Element[] {
    if (!isSelectorRoot(rootNode)) return [];
    if (!rule?.rootsSelector?.trim()) {
        return rootNode instanceof Element ? [rootNode] : Array.from(rootNode.children);
    }

    const roots = new Set<Element>();

    if (rootNode instanceof Element) {
        if (safeMatches(rootNode, rule.rootsSelector)) {
            roots.add(rootNode);
        }

        const closestRoot = safeClosest(rootNode, rule.rootsSelector);
        if (closestRoot) {
            roots.add(rootNode);
        }
    }

    safeQuerySelectorAll(rootNode, rule.rootsSelector).forEach(root => roots.add(root));

    return Array.from(roots);
}

export function isWithinSiteRuleRoots(node: Element, rule: SiteCompatRule | undefined = getSiteCompatRule()): boolean {
    if (!rule?.rootsSelector?.trim()) return true;
    return safeMatches(node, rule.rootsSelector) || Boolean(safeClosest(node, rule.rootsSelector));
}

export function isWithinSiteRuleSelector(node: Element, rule: SiteCompatRule): boolean {
    const selector = selectorList(rule.selector)[0];   // 全局选择器（数组首项）
    if (!selector) return true;
    return safeMatches(node, selector) || Boolean(safeClosest(node, selector));
}

function getSiteRuleSegments(node: Element, rule: SiteCompatRule): Element[] {
    if (!rule.segmentSelector?.trim()) return [];

    const segments = new Set<Element>();

    if (safeMatches(node, rule.segmentSelector)) {
        segments.add(node);
    }

    safeQuerySelectorAll(node, rule.segmentSelector).forEach(segment => segments.add(segment));

    return Array.from(segments)
        .filter(segment => !isIgnoredBySiteRule(segment, rule))
        .filter(segment => !Array.from(segments).some(other => other !== segment && segment.contains(other)));
}

function addSiteRuleNode(nodes: Set<Element>, node: Element, rule: SiteCompatRule): void {
    const segments = getSiteRuleSegments(node, rule);

    if (segments.length) {
        segments.forEach(segment => nodes.add(applySiteRuleStyles(segment, rule)));
        return;
    }

    if (!isIgnoredBySiteRule(node, rule)) {
        nodes.add(applySiteRuleStyles(node, rule));
    }
}

export function querySiteRuleNodes(rootNode: Node, rule: SiteCompatRule | undefined = getSiteCompatRule()): Element[] {
    if (!rule) return [];
    // 全局批量扫描只用首项选择器；多项数组的其余项是 hover 单节点上卷链，不在此泄漏
    const selector = selectorList(rule.selector)[0];
    if (!selector) return [];

    const nodes = new Set<Element>();

    getSiteRuleRoots(rootNode, rule).forEach(root => {
        if (
            root instanceof Element &&
            rule.segmentSelector?.trim() &&
            safeMatches(root, rule.segmentSelector) &&
            isWithinSiteRuleSelector(root, rule) &&
            !isIgnoredBySiteRule(root, rule)
        ) {
            nodes.add(applySiteRuleStyles(root, rule));
        }

        if (safeMatches(root, selector) && !isIgnoredBySiteRule(root, rule)) {
            addSiteRuleNode(nodes, root, rule);
        }

        safeQuerySelectorAll(root, selector).forEach(node => {
            if (!isIgnoredBySiteRule(node, rule)) {
                addSiteRuleNode(nodes, node, rule);
            }
        });
    });

    return Array.from(nodes);
}

export function selectSiteRuleNode(node: Element, rule: SiteCompatRule | undefined = getSiteCompatRule()): Element | {skip: boolean} | false {
    if (!rule) return false;

    // 命令式跳过逃生舱（原 selectCompatFn 内联的 shouldSkip*），仅此单节点路径生效
    if (rule.skipNode?.(node)) return {skip: true};

    if (!isWithinSiteRuleRoots(node, rule) || isIgnoredBySiteRule(node, rule)) {
        return {skip: true};
    }

    const selectors = selectorList(rule.selector);
    if (!selectors.length) return false;

    if (rule.segmentSelector?.trim()) {
        const segment = safeMatches(node, rule.segmentSelector) ? node : safeClosest(node, rule.segmentSelector);
        if (
            segment &&
            !isIgnoredBySiteRule(segment, rule) &&
            isWithinSiteRuleSelector(segment, rule)
        ) {
            const nestedSegments = getSiteRuleSegments(segment, rule);
            if (nestedSegments.length && !nestedSegments.includes(segment)) return false;
            return applySiteRuleStyles(segment, rule);
        }
    }

    // 按序优先：每项可为逗号串（任一最近祖先），首个命中即返回（吸收原 findMatchingElement 链）
    for (const selector of selectors) {
        const matched = safeMatches(node, selector) ? node : safeClosest(node, selector);
        if (!matched) continue;
        if (getSiteRuleSegments(matched, rule).length) return false;
        return applySiteRuleStyles(matched, rule);
    }

    return false;
}

// 根据浏览器 url.host 是获取获取主域名
export function getMainDomain(url: any) {
    try {
        // 处理URL对象或字符串
        let hostname = '';
        
        // 如果是URL字符串，提取hostname部分
        if (typeof url === 'string') {
            // 移除协议部分
            const noProtocol = url.replace(/^(https?:\/\/)/, '');
            // 提取域名部分（移除路径和查询参数）
            hostname = noProtocol.split('/')[0];
        } else if (url instanceof URL) {
            hostname = url.hostname;
        } else {
            return '';
        }
        
        // 处理特殊情况: 将Twitter的旧域名和新域名统一处理
        if (hostname === 'twitter.com' || hostname === 'x.com' || 
            hostname === 'www.twitter.com' || hostname === 'www.x.com') {
            return 'x.com';
        }
        
        // 移除可能的www前缀
        hostname = hostname.replace(/^www\./, '');
        
        // 提取基本域名
        const parts = hostname.split('.');
        if (parts.length >= 2) {
            // 对于常见的二级域名（如co.uk），需要特殊处理
            if (parts.length >= 3 && 
                ((parts[parts.length-2] === 'co' || parts[parts.length-2] === 'com') && 
                 parts[parts.length-1].length === 2)) {
                // 例如 example.co.uk 应该返回 example.co.uk
                return parts.slice(-3).join('.');
            } else {
                // 否则返回主域名和顶级域名
                return parts.slice(-2).join('.');
            }
        }
        
        return hostname;
    } catch (error) {
        console.error('getMainDomain error:', error);
        return '';
    }
}

/**
 * 判断是否应该跳过Stack Overflow网站上的特定元素
 */
function shouldSkipStackOverflowElement(node: any): boolean {
    // 如果当前节点或其祖先节点匹配这些选择器，则跳过
    const skipSelectors = [
        // 导航栏
        'nav.s-topbar',
        'div.s-topbar',
        // 侧边栏
        'div.s-sidebarwidget',
        // 表单元素
        'form',
        'input',
        'textarea',
        'button',
        // 代码块
        'pre.s-code-block',
        'code',
        // 操作按钮
        'div.js-voting-container',
        'div.js-post-menu',
        // 链接和标签
        'div.post-taglist',
        'div.module.community-bulletin',
        // 统计信息
        'div.-flair',
        'div.s-stats',
        'div.s-badge',
        // 页脚
        'footer',
        'div.site-footer',
    ];
    
    // 检查当前节点是否匹配跳过选择器
    for (const selector of skipSelectors) {
        if (node.matches?.(selector)) return true;
        
        // 检查祖先节点
        let parent = node.parentElement;
        while (parent) {
            if (parent.matches?.(selector)) return true;
            parent = parent.parentElement;
        }
    }
    
    // 检查节点的类名是否包含特定关键字
    const skipClassKeywords = ['js-', 'icon', 'btn', 'badge', 'vote', 'tag', 's-btn', 'vote-count'];
    
    if (node.className && typeof node.className === 'string') {
        for (const keyword of skipClassKeywords) {
            if (node.className.includes(keyword)) return true;
        }
    }
    
    // 忽略代码片段
    if (node.tagName?.toLowerCase() === 'pre' || node.tagName?.toLowerCase() === 'code') return true;
    
    // 忽略图标
    if (node.tagName?.toLowerCase() === 'svg') return true;
    
    return false;
}

/**
 * 判断是否应该跳过Medium网站上的特定元素
 */
function shouldSkipMediumElement(node: any): boolean {
    // 如果当前节点或其祖先节点匹配这些选择器，则跳过
    const skipSelectors = [
        // 导航栏和工具栏
        'nav',
        'div.metabar',
        'div.js-metabar',
        // 侧边栏 
        'div.js-sidebarContainer',
        'div.js-sidebar',
        // UI元素
        'button',
        'input',
        'textarea',
        // 代码块
        'pre',
        'code',
        // 底部元素
        'footer',
        // 作者资料卡
        'div.pw-multi-author-card',
        // 推荐文章卡片上的标题/描述以外的内容
        'div.pw-card-body div.pw-card-description ~ *',
        // 分享按钮和响应按钮
        'div.pw-post-actions',
        'div.pw-responses-header',
    ];
    
    // 检查当前节点是否匹配跳过选择器
    for (const selector of skipSelectors) {
        if (node.matches?.(selector)) return true;
        
        // 检查祖先节点
        let parent = node.parentElement;
        while (parent) {
            if (parent.matches?.(selector)) return true;
            parent = parent.parentElement;
        }
    }
    
    // 检查节点的类名是否包含特定关键字
    const skipClassKeywords = ['js-', 'btn', 'button', 'u-', 'overlay', 'postActionsBar'];
    
    if (node.className && typeof node.className === 'string') {
        for (const keyword of skipClassKeywords) {
            if (node.className.includes(keyword)) return true;
        }
    }
    
    // 忽略代码片段
    if (node.tagName?.toLowerCase() === 'pre' || node.tagName?.toLowerCase() === 'code') return true;
    
    // 忽略图片图标
    if (node.tagName?.toLowerCase() === 'svg' || node.tagName?.toLowerCase() === 'img') return true;
    
    return false;
}
