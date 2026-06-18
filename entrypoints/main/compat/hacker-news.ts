import type {SiteCompatRule} from "./index";

export const hackerNewsRule: SiteCompatRule = {
    pattern: "news.ycombinator.com",
    selector: [
        "p, .titleline, .commtext, .hn-item-title, .hn-comment-text, .hn-story-title",
        "td.title a.titlelink",
        "div.comment span.commtext",
        "div.toptext",
        "td.default",
    ],
    ignoreSelector: "button, code, footer, form, header, mark, nav, pre, .reply",
    autoScan: false,
    skipNode: shouldSkipHNElement,
};

/**
 * 判断是否应该跳过Hacker News网站上的特定元素
 */
export function shouldSkipHNElement(node: any): boolean {
    // 如果当前节点或其祖先节点匹配这些选择器，则跳过
    const skipSelectors = [
        // 顶部和底部导航
        'td.hnnavbar',
        'span.pagetop',
        // 各种链接区
        'td.subtext',
        // 用户信息
        'span.hnuser',
        'span.age',
        // 表单元素
        'form',
        'input',
        'textarea',
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
    
    // 检查节点文本是否为纯按钮/链接文本
    const skipTexts = ['reply', 'flag', 'favorite', 'hide', 'past', 'web', 'comments', 'ask', 'show', 'jobs', 'submit'];
    if (node.textContent && skipTexts.includes(node.textContent.trim().toLowerCase())) {
        return true;
    }
    
    return false;
}
