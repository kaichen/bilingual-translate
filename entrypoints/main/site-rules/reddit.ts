import type {SiteRule} from "./index";

const REDDIT_CONTENT_SELECTOR = [
    "shreddit-post h1",
    "shreddit-post [slot='title']",
    "shreddit-post h3[data-click-id='body']",
    "shreddit-post-text-body p",
    "shreddit-post [slot='text-body'] p",
    "shreddit-post [data-post-click-location='text-body'] p",
    "shreddit-post [property='schema:articleBody'] p",
    "shreddit-comment [slot='comment'] p",
    "shreddit-comment [id*='comment'][id*='rtjson-content'] p",
    ".thing.link .md p",
    ".thing.comment .md p",
    ".thing.link a.title",
].join(", ");


const REDDIT_IGNORE_SELECTOR = [
    "header",
    "nav",
    "aside",
    "button",
    "form",
    "input",
    "textarea",
    "select",
    "[role='menu']",
    "[slot='credit-bar']",
    "[slot='commentAvatar']",
    "[slot='commentMeta']",
    "[slot='commentFooter']",
    "[slot='post-media-container']",
    "[slot='thumbnail']",
    "faceplate-timeago",
    "shreddit-ad-post",
    "shreddit-post-flair",
    "shreddit-post-overflow-menu",
    "shreddit-comment-action-row",
    "[data-testid='post-comment-header']",
    "[data-testid='subreddit-sidebar']",
    "[data-testid='community-sidebar']",
    "[data-testid='frontpage-sidebar']",
    "[data-click-id='subreddit']",
    "[data-promoted='true']",
    "[promoted='true']",
    ".promotedlink",
    "[data-before-content='advertisement']",
].join(", ");

export const redditRule: SiteRule = {
    // reddit 现状走 querySiteRuleNodes 数据路径（原 preferRule 短路了 selectCompatFn），
    // 故迁移后不挂 skipNode，行为等价；shouldSkipRedditElement 随 selectCompatFn 删除。
    pattern: "reddit.com",
    selector: REDDIT_CONTENT_SELECTOR,
    ignoreSelector: REDDIT_IGNORE_SELECTOR,
    autoScan: false,
};
