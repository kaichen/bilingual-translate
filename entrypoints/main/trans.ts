import { checkConfig, searchClassName, skipNode } from "../utils/check";
import { cache } from "../utils/cache";
import { options, servicesType } from "../utils/option";
import { insertFailedTip, insertLoadingSpinner } from "../utils/icon";
import { styles } from "@/entrypoints/utils/constant";
import {
    beautyHTML,
    collectTranslationTargets,
    getTranslationTargetText,
    getTranslationTargetSourceKey,
    getTranslationTargetSourceText,
    grabTranslationTarget,
    insertTranslationNodeForTarget,
    LLMStandardHTML,
    resetTranslationTargetDom,
    SOURCE_KEY_ATTR,
    type TranslationTarget
} from "@/entrypoints/main/dom";
import { detectlang, throttle } from "@/entrypoints/utils/common";
import { getMainDomain, replaceCompatFn } from "@/entrypoints/main/compat";
import { config } from "@/entrypoints/utils/config";
import { translateText, cancelAllTranslations } from '@/entrypoints/utils/translateApi';

let hoverTimer: any; // 鼠标悬停计时器
let htmlSet = new Set(); // 防抖
export let originalContents = new Map(); // 保存原始内容
let isAutoTranslating = false; // 控制是否继续翻译新内容
let observer: IntersectionObserver | null = null; // 保存观察器实例
let mutationObserver: MutationObserver | null = null; // 保存 DOM 变化观察器实例
let observedTargetMap = new Map<Element, TranslationTarget[]>();
let observedHosts = new WeakSet<Element>();
let processedTargetSourceKeys = new WeakMap<Node, string>();
let xScrollHandler: (() => void) | null = null;
let xScanTimer: ReturnType<typeof setTimeout> | null = null;
let xRoutePollTimer: ReturnType<typeof setInterval> | null = null;
let xLastUrl = "";
let xShowMorePendingTargets = new WeakSet<Element>();

// 使用自定义属性标记已翻译的节点
const TRANSLATED_ATTR = 'data-bt-translated';
const TRANSLATED_ID_ATTR = 'data-bt-node-id'; // 添加节点ID属性
const X_SHOW_MORE_WAIT_MS = 2000;
const X_SHOW_MORE_TEXTS = new Set(['show more', '显示更多', '查看更多']);
const X_SHOW_MORE_CANDIDATE_SELECTOR = 'button, [role="button"], a, [role="link"], span, div';
const X_SHOW_MORE_EXCLUDED_SELECTOR = [
    'aside',
    'header',
    'nav',
    '[role="group"]',
    '[data-testid^="tweetTextarea"]',
    '[data-testid="sidebarColumn"]',
    '[data-testid="User-Name"]',
    '[data-testid="UserName"]',
    '[data-testid="reply"]',
    '[data-testid="retweet"]',
    '[data-testid="like"]',
    '[data-testid="bookmark"]',
    '[data-testid="share"]',
    '[data-testid="caret"]',
].join(',');

let nodeIdCounter = 0; // 节点ID计数器

// 恢复原文内容
export function restoreOriginalContent() {
    // 取消所有等待中的翻译任务
    cancelAllTranslations();
    stopXContinuousTranslation();
    
    // 1. 遍历所有已翻译的节点
    document.querySelectorAll(`[${TRANSLATED_ATTR}="true"]`).forEach(node => {
        const nodeId = node.getAttribute(TRANSLATED_ID_ATTR);
        if (nodeId && originalContents.has(nodeId)) {
            const originalContent = originalContents.get(nodeId);
            node.innerHTML = originalContent;
            node.removeAttribute(TRANSLATED_ATTR);
            node.removeAttribute(TRANSLATED_ID_ATTR);
            node.removeAttribute(SOURCE_KEY_ATTR);
            
            // 移除可能添加的翻译相关类
            node.classList.remove('bilingual-translate-bilingual');
        }
    });
    
    // 2. 移除所有翻译内容元素
    document.querySelectorAll('.bilingual-translate-bilingual-content').forEach(element => {
        element.remove();
    });
    
    // 3. 移除所有翻译过程中添加的加载动画和错误提示
    document.querySelectorAll('.bilingual-translate-loading, .bilingual-translate-retry-wrapper').forEach(element => {
        element.remove();
    });
    
    // 4. 清空存储的原始内容
    originalContents.clear();
    
    // 5. 停止所有观察器
    if (observer) {
        observer.disconnect();
        observer = null;
    }
    if (mutationObserver) {
        mutationObserver.disconnect();
        mutationObserver = null;
    }
    
    // 6. 重置所有翻译相关的状态
    isAutoTranslating = false;
    htmlSet.clear(); // 清空防抖集合
    observedTargetMap = new Map<Element, TranslationTarget[]>();
    observedHosts = new WeakSet<Element>();
    processedTargetSourceKeys = new WeakMap<Node, string>();
    xShowMorePendingTargets = new WeakSet<Element>();
    nodeIdCounter = 0; // 重置节点ID计数器
    
    // 7. 消除可能存在的全局样式污染
    const tempStyleElements = document.querySelectorAll('style[data-bt-temp-style]');
    tempStyleElements.forEach(el => el.remove());
}

// 自动翻译整个页面的功能
export function autoTranslateEnglishPage() {
    // 如果已经在翻译中，则返回
    if (isAutoTranslating) return;
    
    // 获取当前页面的语言（暂时注释，存在识别问题）
    // const text = document.documentElement.innerText || '';
    // const cleanText = text.replace(/[\s\u3000]+/g, ' ').trim().slice(0, 500);
    // const language = detectlang(cleanText);
    // console.log('当前页面语言：', language);
    // const to = config.to;
    // if (to.includes(language)) {
    //     console.log('目标语言与当前页面语言相同，不进行翻译');
    //     return;
    // }
    // console.log('当前页面非目标语言，开始翻译');

    const isX = isXDomain();
    const targets = isX ? collectXTranslationTargets() : collectTranslationTargets(document.body);
    if (!targets.length && !isX) return;

    isAutoTranslating = true;

    // 创建观察器
    observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && isAutoTranslating) {
                const host = entry.target as Element;
                const targets = observedTargetMap.get(host) || [];
                targets.forEach(target => void processTranslationTarget(target));

                // 停止观察该节点
                observer.unobserve(host);
                observedHosts.delete(host);
                observedTargetMap.delete(host);
            }
        });
    }, {
        root: null,
        rootMargin: isX ? '800px' : '50px',
        threshold: 0.1 // 只要出现10%就开始翻译
    });

    // 开始观察所有目标
    if (isX) {
        scheduleXTranslationTargetScan('initial');
    } else {
        scheduleTranslationTargetScan(document.body, 'initial');
    }

    // 创建 MutationObserver 监听 DOM 变化
    mutationObserver = new MutationObserver((mutations) => {
        if (!isAutoTranslating) return;

        let shouldRescanX = false;
        mutations.forEach(mutation => {
            if (isX && (mutation.type === 'characterData' || mutation.type === 'attributes')) {
                shouldRescanX = true;
            }

            mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1) { // 元素节点
                    if (isX) {
                        shouldRescanX = true;
                        return;
                    }
                    // 只处理未翻译的新目标
                    scheduleTranslationTargetScan(node as Element, 'mutation');
                }
            });
        });

        if (shouldRescanX) {
            scheduleXTranslationScan('mutation');
        }
    });

    // 监听整个 body 的变化
    mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: isX,
        attributes: isX,
        attributeFilter: isX ? ['data-testid', 'lang'] : undefined
    });

    if (isX) {
        startXContinuousTranslation();
    }
}

export function scheduleTranslationTargetScan(rootNode: Node = document.body, _reason: string = 'manual') {
    if (!isAutoTranslating || !observer) return;
    observeTranslationTargets(collectTranslationTargets(rootNode));
}

function observeTranslationTargets(targets: TranslationTarget[]) {
    targets
        .filter(target => !isTargetProcessed(target))
        .forEach(target => {
            const hostTargets = observedTargetMap.get(target.host) || [];
            const keyNode = getTargetKeyNode(target);
            if (hostTargets.some(existing => getTargetKeyNode(existing) === keyNode)) return;
            hostTargets.push(target);
            observedTargetMap.set(target.host, hostTargets);

            if (!observedHosts.has(target.host)) {
                observer?.observe(target.host);
                observedHosts.add(target.host);
            }
        });
}

async function processTranslationTarget(target: TranslationTarget) {
    const preparedTarget = await prepareXTranslationTarget(target);
    if (!preparedTarget || isTargetProcessed(preparedTarget)) return;

    const sourceKey = getTranslationTargetSourceKey(preparedTarget);
    markTargetProcessing(preparedTarget, sourceKey);

    if (preparedTarget.kind === 'element') {
        const node = preparedTarget.element;
        const nodeId = `bt-node-${nodeIdCounter++}`;
        node.setAttribute(TRANSLATED_ID_ATTR, nodeId);
        node.setAttribute(SOURCE_KEY_ATTR, sourceKey);
        originalContents.set(nodeId, node.innerHTML);
        node.setAttribute(TRANSLATED_ATTR, 'true');

        if (config.display === styles.bilingualTranslation) {
            handleBilingualTranslation(node, false);
        } else {
            handleSingleTranslation(node, false);
        }
        return;
    }

    if (config.display === styles.bilingualTranslation) {
        handleBilingualTargetTranslation(preparedTarget);
    }
}

export async function prepareXTranslationTarget(target: TranslationTarget): Promise<TranslationTarget | false> {
    const tweetText = getXTweetTextElement(target);
    if (!tweetText) return target;

    const article = tweetText.closest('article');
    if (!(article instanceof HTMLElement)) return target;

    if (xShowMorePendingTargets.has(tweetText)) return false;

    const showMoreButton = findInlineXShowMoreButton(tweetText, article);
    if (!showMoreButton) return target;

    const oldSourceKey = getTranslationTargetSourceKey(target);
    const targetScope = getXTweetTextScope(tweetText, article);
    xShowMorePendingTargets.add(tweetText);

    try {
        showMoreButton.click();
        await waitForXExpandedTweet(article, oldSourceKey, targetScope);
        return findCurrentXTweetTextTarget(tweetText, targetScope, article) || target;
    } finally {
        xShowMorePendingTargets.delete(tweetText);
    }
}

export function findInlineXShowMoreButton(tweetTextEl: HTMLElement, article: Element): HTMLElement | null {
    const seenClickTargets = new Set<HTMLElement>();
    const candidates = Array.from(article.querySelectorAll<HTMLElement>(X_SHOW_MORE_CANDIDATE_SELECTOR));

    for (const candidate of candidates) {
        if (!isVisibleXShowMoreCandidate(candidate)) continue;
        if (!isAllowedXShowMoreText(candidate.textContent || '')) continue;

        const clickTarget = getXShowMoreClickTarget(candidate, article);
        if (!clickTarget || seenClickTargets.has(clickTarget)) continue;
        seenClickTargets.add(clickTarget);

        if (!isInlineXShowMoreCandidate(clickTarget, tweetTextEl, article)) continue;
        if (isNavigatingXShowMoreLink(clickTarget)) continue;

        return clickTarget;
    }

    return null;
}

export function waitForXExpandedTweet(article: Element, oldSourceKey: string, scope: Element = article): Promise<void> {
    return new Promise(resolve => {
        let settled = false;
        let observer: MutationObserver | null = null;
        let timeout: ReturnType<typeof setTimeout> | null = null;

        const finish = () => {
            if (settled) return;
            settled = true;
            observer?.disconnect();
            if (timeout) clearTimeout(timeout);
            resolve();
        };

        const checkExpanded = () => {
            const currentTarget = findFirstXTweetTextTarget(scope) || findFirstXTweetTextTarget(article);
            if (!currentTarget || currentTarget.kind !== 'element') return;

            const currentSourceKey = getTranslationTargetSourceKey(currentTarget);
            if (currentSourceKey && currentSourceKey !== oldSourceKey) {
                finish();
                return;
            }

            if (!findInlineXShowMoreButton(currentTarget.element as HTMLElement, article)) {
                finish();
            }
        };

        observer = new MutationObserver(checkExpanded);
        observer.observe(article, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['data-testid', 'lang', 'href', 'aria-expanded']
        });

        timeout = setTimeout(finish, X_SHOW_MORE_WAIT_MS);
        setTimeout(checkExpanded, 0);
    });
}

function getXTweetTextElement(target: TranslationTarget): HTMLElement | null {
    if (!isXDomain() || target.kind !== 'element' || !(target.element instanceof HTMLElement)) return null;
    if (!target.element.matches('[data-testid="tweetText"]')) return null;
    return target.element;
}

function getXTweetTextScope(tweetText: HTMLElement, article: HTMLElement): Element {
    const quotedScope = tweetText.closest('[role="link"][aria-label*="Quoted"], [role="link"][aria-label*="quoted"], [role="link"][aria-label*="引用"]');
    if (quotedScope instanceof HTMLElement && article.contains(quotedScope)) return quotedScope;
    return article;
}

function findCurrentXTweetTextTarget(originalTweetText: HTMLElement, scope: Element, article: Element): TranslationTarget | false {
    if (originalTweetText.isConnected) {
        const sameNodeTarget = collectTranslationTargets(scope)
            .find(target => target.kind === 'element' && target.element === originalTweetText);
        if (sameNodeTarget) return sameNodeTarget;
    }

    return findFirstXTweetTextTarget(scope) || findFirstXTweetTextTarget(article) || false;
}

function findFirstXTweetTextTarget(root: Element): TranslationTarget | false {
    return collectTranslationTargets(root)
        .find(target => target.kind === 'element' && target.element.matches('[data-testid="tweetText"]')) || false;
}

function isAllowedXShowMoreText(text: string): boolean {
    return X_SHOW_MORE_TEXTS.has(normalizeXShowMoreText(text));
}

function normalizeXShowMoreText(text: string): string {
    return text
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[\p{P}\p{S}]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function getXShowMoreClickTarget(candidate: HTMLElement, article: Element): HTMLElement | null {
    const clickable = candidate.closest<HTMLElement>('button, [role="button"], a[href], a[role="link"]');
    if (clickable && article.contains(clickable)) return clickable;
    return candidate;
}

function isInlineXShowMoreCandidate(candidate: HTMLElement, tweetTextEl: HTMLElement, article: Element): boolean {
    if (!article.contains(candidate)) return false;
    if (candidate.closest(X_SHOW_MORE_EXCLUDED_SELECTOR)) return false;
    if (tweetTextEl.contains(candidate)) return true;

    const textContainer = tweetTextEl.parentElement;
    if (!textContainer || !textContainer.contains(candidate)) return false;

    return Boolean(tweetTextEl.compareDocumentPosition(candidate) & Node.DOCUMENT_POSITION_FOLLOWING);
}

function isNavigatingXShowMoreLink(candidate: HTMLElement): boolean {
    const link = candidate.closest<HTMLAnchorElement>('a[href]');
    if (!link) return false;

    const href = link.getAttribute('href');
    if (!href || href.startsWith('#')) return false;

    const targetUrl = new URL(href, location.href);
    const currentUrl = new URL(location.href);
    if (targetUrl.origin !== currentUrl.origin) return true;

    const isStatusLink = /\/status\/\d+/.test(targetUrl.pathname);
    return isStatusLink && targetUrl.pathname !== currentUrl.pathname;
}

function isVisibleXShowMoreCandidate(candidate: HTMLElement): boolean {
    if (candidate.hidden || candidate.getAttribute('aria-hidden') === 'true') return false;

    let current: HTMLElement | null = candidate;
    while (current && current !== document.body) {
        const style = window.getComputedStyle(current);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        current = current.parentElement;
    }

    return true;
}

function isTargetProcessed(target: TranslationTarget): boolean {
    const sourceKey = getTranslationTargetSourceKey(target);

    if (target.kind === 'element') {
        const currentSourceKey = target.element.getAttribute(SOURCE_KEY_ATTR);
        if (target.element.hasAttribute(TRANSLATED_ATTR) && currentSourceKey === sourceKey) return true;
        if (currentSourceKey && currentSourceKey !== sourceKey) {
            resetTranslatedTarget(target);
            return false;
        }
        if (target.element.hasAttribute(TRANSLATED_ATTR)) return true;
    }

    const processedSourceKey = processedTargetSourceKeys.get(getTargetKeyNode(target));
    if (processedSourceKey === sourceKey) return true;
    if (processedSourceKey && processedSourceKey !== sourceKey) {
        resetTranslatedTarget(target);
    }
    return false;
}

function getTargetKeyNode(target: TranslationTarget): Node {
    return target.kind === 'element' ? target.element : target.nodes[0];
}

function markTargetProcessing(target: TranslationTarget, sourceKey: string) {
    processedTargetSourceKeys.set(getTargetKeyNode(target), sourceKey);
}

function resetTranslatedTarget(target: TranslationTarget) {
    const keyNode = getTargetKeyNode(target);
    const oldSourceKey = processedTargetSourceKeys.get(keyNode);

    if (target.kind === 'element') {
        const oldNodeId = target.element.getAttribute(TRANSLATED_ID_ATTR);
        if (oldNodeId) originalContents.delete(oldNodeId);
    }

    resetTranslationTargetDom(target, oldSourceKey);
    processedTargetSourceKeys.delete(keyNode);
}

function isXDomain(): boolean {
    return getMainDomain(location.href) === 'x.com';
}

function collectXTranslationTargets(): TranslationTarget[] {
    const targets = new Map<Node, TranslationTarget>();

    getXScanRoots().forEach(root => {
        collectTranslationTargets(root).forEach(target => {
            targets.set(getTargetKeyNode(target), target);
        });
    });

    return Array.from(targets.values());
}

function scheduleXTranslationTargetScan(reason: string) {
    getXScanRoots().forEach(root => scheduleTranslationTargetScan(root, reason));
}

export function getXScanRoots(): Element[] {
    const roots = new Set<Element>();
    const addRoot = (node: Element | null | undefined) => {
        if (node) roots.add(node);
    };

    addRoot(document.querySelector('main[role="main"]'));
    addRoot(document.querySelector('[data-testid="primaryColumn"]'));

    document.querySelectorAll('[role="dialog"], [aria-label^="Timeline:"]').forEach(root => {
        addRoot(root);
    });

    document.querySelectorAll('article').forEach(article => {
        addRoot(
            article.closest('[aria-label^="Timeline:"], [role="dialog"], [data-testid="primaryColumn"], main[role="main"]') ||
            article.parentElement
        );
    });

    if (isXPhotoRoute()) {
        addRoot(document.body);
    }

    if (!roots.size) roots.add(document.body);

    return Array.from(roots);
}

function isXPhotoRoute(): boolean {
    return /\/status\/\d+\/photo\/\d+/.test(location.pathname);
}

function startXContinuousTranslation() {
    stopXContinuousTranslation();
    xLastUrl = location.href;
    xScrollHandler = () => scheduleXTranslationScan('scroll');
    window.addEventListener('scroll', xScrollHandler, true);
    xRoutePollTimer = setInterval(() => {
        if (xLastUrl === location.href) return;
        xLastUrl = location.href;
        scheduleXTranslationScan('route');
    }, 1000);
    scheduleXTranslationScan('start');
}

function stopXContinuousTranslation() {
    if (xScrollHandler) {
        window.removeEventListener('scroll', xScrollHandler, true);
        xScrollHandler = null;
    }
    if (xScanTimer) {
        clearTimeout(xScanTimer);
        xScanTimer = null;
    }
    if (xRoutePollTimer) {
        clearInterval(xRoutePollTimer);
        xRoutePollTimer = null;
    }
}

function scheduleXTranslationScan(reason: string) {
    if (!isAutoTranslating) return;
    if (xScanTimer) clearTimeout(xScanTimer);
    xScanTimer = setTimeout(() => {
        xScanTimer = null;
        scheduleXTranslationTargetScan(reason);
    }, 250);
}

// 处理鼠标悬停翻译的主函数
export function handleTranslation(mouseX: number, mouseY: number, delayTime: number = 0) {
    // 检查配置
    if (!checkConfig()) return;

    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {

        const target = grabTranslationTarget(document.elementFromPoint(mouseX, mouseY));
        if (!target) return;
        const node = target.kind === 'element' ? target.element : target.host;

        // 判断是否跳过节点
        if (skipNode(node)) return;

        // 防抖
        const debounceKey = target.kind === 'element' ? target.element.outerHTML : getTranslationTargetText(target);
        if (htmlSet.has(debounceKey)) return;
        htmlSet.add(debounceKey);

        // 根据翻译模式进行翻译
        if (config.display === styles.bilingualTranslation) {
            if (target.kind === 'element') {
                handleBilingualTranslation(target.element, delayTime > 0);  // 根据 delayTime 可判断是否为滑动翻译
            } else if (!isTargetProcessed(target)) {
                markTargetProcessing(target, getTranslationTargetSourceKey(target));
                handleBilingualTargetTranslation(target);
            }
        } else if (target.kind === 'element') {
            handleSingleTranslation(node, delayTime > 0);
        }
    }, delayTime);
}

// 双语翻译
export function handleBilingualTranslation(node: any, slide: boolean) {
    let nodeOuterHTML = node.outerHTML;
    // 如果已经翻译过，250ms 后删除翻译结果
    let bilingualNode = searchClassName(node, 'bilingual-translate-bilingual');
    if (bilingualNode) {
        if (slide) {
            htmlSet.delete(nodeOuterHTML);
            return;
        }
        let spinner = insertLoadingSpinner(bilingualNode as HTMLElement, true);
        setTimeout(() => {
            spinner.remove();
            const content = searchClassName(bilingualNode as HTMLElement, 'bilingual-translate-bilingual-content');
            if (content && content instanceof HTMLElement) content.remove();
            (bilingualNode as HTMLElement).classList.remove('bilingual-translate-bilingual');
            htmlSet.delete(nodeOuterHTML);
        }, 250);
        return;
    }

    // 检查是否有缓存
    let cached = cache.localGet(node.textContent);
    if (cached) {
        let spinner = insertLoadingSpinner(node, true);
        setTimeout(() => {
            spinner.remove();
            htmlSet.delete(nodeOuterHTML);
            bilingualAppendChild(node, cached);
        }, 250);
        return;
    }

    // 翻译
    bilingualTranslate(node, nodeOuterHTML);
}

// 单语翻译
export function handleSingleTranslation(node: any, slide: boolean) {
    let nodeOuterHTML = node.outerHTML;
    let outerHTMLCache = cache.localGet(node.outerHTML);


    if (outerHTMLCache) {
        // handleTranslation 已处理防抖 故删除判断 原bug 在保存完成后 刷新页面 可以取得缓存 直接return并没有翻译
        let spinner = insertLoadingSpinner(node, true);
        setTimeout(() => {
            spinner.remove();
            htmlSet.delete(nodeOuterHTML);

            // 兼容部分网站独特的 DOM 结构
            let fn = replaceCompatFn[getMainDomain(document.location.hostname)];
            if (fn) fn(node, outerHTMLCache);
            else node.outerHTML = outerHTMLCache;

        }, 250);
        return;
    }

    singleTranslate(node);
}


function bilingualTranslate(node: any, nodeOuterHTML: any) {
    if (detectlang(node.textContent.replace(/[\s\u3000]/g, '')) === config.to) return;

    let origin = node.textContent;
    let spinner = insertLoadingSpinner(node);
    
    // 使用队列管理的翻译API
    translateText(origin, document.title)
        .then((text: string) => {
            spinner.remove();
            htmlSet.delete(nodeOuterHTML);
            bilingualAppendChild(node, text);
        })
        .catch((error: Error) => {
            spinner.remove();
            insertFailedTip(node, error.toString() || "翻译失败", spinner);
        });
}

function handleBilingualTargetTranslation(target: TranslationTarget) {
    const origin = getTranslationTargetSourceText(target);
    if (detectlang(origin.replace(/[\s\u3000]/g, '')) === config.to) return;

    const cached = cache.localGet(origin);
    if (cached) {
        appendBilingualTranslationForTarget(target, cached);
        return;
    }

    translateText(origin, document.title)
        .then((text: string) => {
            appendBilingualTranslationForTarget(target, text);
        })
        .catch((error: Error) => {
            console.error('翻译失败:', error);
        });
}


export function singleTranslate(node: any) {
    if (detectlang(node.textContent.replace(/[\s\u3000]/g, '')) === config.to) return;

    let origin = servicesType.isMachine(config.service) ? node.innerHTML : LLMStandardHTML(node);
    let spinner = insertLoadingSpinner(node);
    
    // 使用队列管理的翻译API
    translateText(origin, document.title)
        .then((text: string) => {
            spinner.remove();
            
            text = beautyHTML(text);
            
            if (!text || origin === text) return;
            
            let oldOuterHtml = node.outerHTML;
            node.innerHTML = text;
            let newOuterHtml = node.outerHTML;
            
            // 缓存翻译结果
            cache.localSetDual(oldOuterHtml, newOuterHtml);
            cache.set(htmlSet, newOuterHtml, 250);
            htmlSet.delete(oldOuterHtml);
        })
        .catch((error: Error) => {
            spinner.remove();
            insertFailedTip(node, error.toString() || "翻译失败", spinner);
        });
}

export const handleBtnTranslation = throttle((node: any) => {
    let origin = node.innerText;
    let rs = cache.localGet(origin);
    if (rs) {
        node.innerText = rs;
        return;
    }

    config.count++ && storage.setItem('local:config', JSON.stringify(config));

    browser.runtime.sendMessage({ context: document.title, origin: origin })
        .then((text: string) => {
            cache.localSetDual(origin, text);
            node.innerText = text;
        }).catch((error: any) => console.error('调用失败:', error))
}, 250)


function bilingualAppendChild(node: any, text: string) {
    appendBilingualTranslationForTarget({
        kind: 'element',
        host: node,
        nodes: [node],
        anchor: node,
        element: node
    }, text);
}

function appendBilingualTranslationForTarget(target: TranslationTarget, text: string) {
    const newNode = createBilingualContentNode(text);
    newNode.setAttribute(SOURCE_KEY_ATTR, getTranslationTargetSourceKey(target));
    insertTranslationNodeForTarget(target, newNode);
}

export function createBilingualContentNode(text: string): HTMLElement {
    const newNode = document.createElement("span");
    newNode.classList.add("bilingual-translate-bilingual-content");

    const textNode = document.createElement("span");
    textNode.classList.add("bilingual-translate-bilingual-text");

    // find the style
    const style = options.styles.find(s => s.value === config.style && !s.disabled);
    if (style?.class) {
        textNode.classList.add(style.class);
    }
    textNode.append(text);
    newNode.append(textNode);
    return newNode;
}
