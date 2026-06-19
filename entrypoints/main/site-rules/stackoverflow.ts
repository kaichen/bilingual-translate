import type {SiteRule} from "./index";

// 自身或任一祖先匹配即跳过：导航/侧栏/表单/代码块/操作按钮/标签/统计/页脚
const STACKOVERFLOW_SKIP_SELECTOR = [
    "nav.s-topbar",
    "div.s-topbar",
    "div.s-sidebarwidget",
    "form",
    "input",
    "textarea",
    "button",
    "pre.s-code-block",
    "code",
    "div.js-voting-container",
    "div.js-post-menu",
    "div.post-taglist",
    "div.module.community-bulletin",
    "div.-flair",
    "div.s-stats",
    "div.s-badge",
    "footer",
    "div.site-footer",
].join(", ");

const STACKOVERFLOW_SKIP_CLASS_KEYWORDS = ["js-", "icon", "btn", "badge", "vote", "tag", "s-btn", "vote-count"];

function shouldSkipStackOverflowElement(node: any): boolean {
    // 节点或祖先命中跳过选择器（closest 等价于原逐项 matches + parentElement 上卷）
    if (node.closest?.(STACKOVERFLOW_SKIP_SELECTOR)) return true;

    // 类名含特定关键字
    if (typeof node.className === "string" && STACKOVERFLOW_SKIP_CLASS_KEYWORDS.some(kw => node.className.includes(kw))) {
        return true;
    }

    // 忽略代码片段与图标
    const tag = node.tagName?.toLowerCase();
    return tag === "pre" || tag === "code" || tag === "svg";
}

export const stackOverflowRule: SiteRule = {
    pattern: "stackoverflow.com",
    selector: [
        "h1.question-hyperlink",
        "div.excerpt",
        "div.question-status",
        "div.profile-about",
        "div.s-notice",
    ],
    skipNode: shouldSkipStackOverflowElement,
};
