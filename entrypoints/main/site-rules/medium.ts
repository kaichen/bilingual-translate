import type {SiteRule} from "./index";

// 自身或任一祖先匹配即跳过：导航/侧栏/UI/代码块/页脚/作者卡/分享与响应区
const MEDIUM_SKIP_SELECTOR = [
    "nav",
    "div.metabar",
    "div.js-metabar",
    "div.js-sidebarContainer",
    "div.js-sidebar",
    "button",
    "input",
    "textarea",
    "pre",
    "code",
    "footer",
    "div.pw-multi-author-card",
    "div.pw-card-body div.pw-card-description ~ *",
    "div.pw-post-actions",
    "div.pw-responses-header",
].join(", ");

const MEDIUM_SKIP_CLASS_KEYWORDS = ["js-", "btn", "button", "u-", "overlay", "postActionsBar"];

function shouldSkipMediumElement(node: any): boolean {
    // 节点或祖先命中跳过选择器（closest 等价于原逐项 matches + parentElement 上卷）
    if (node.closest?.(MEDIUM_SKIP_SELECTOR)) return true;

    // 类名含特定关键字
    if (typeof node.className === "string" && MEDIUM_SKIP_CLASS_KEYWORDS.some(kw => node.className.includes(kw))) {
        return true;
    }

    // 忽略代码片段与图片图标
    const tag = node.tagName?.toLowerCase();
    return tag === "pre" || tag === "code" || tag === "svg" || tag === "img";
}

export const mediumRule: SiteRule = {
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
};
