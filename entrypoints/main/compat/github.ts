import type {SiteCompatRule} from "./index";
import {debugLog, isSpecialContent} from "./shared";

export const githubRule: SiteCompatRule = {
    pattern: "github.com",
    selector: [
        "h1, h2, h3, h4, h5, h6, .markdown-body li, p, dd, blockquote, figcaption, label, legend, .user-profile-bio>div, [data-testid=\"results-list\"] .search-match, .Subhead-description, [class^=\"prc-SelectPanel-Subtitle-\"], [class^=\"prc-ActionList-ItemLabel-\"], [role=\"dialog\"] .overflow-auto, .h4, .repos-list-description, .discussion-title, [class*=\"PinnedIssue-module__Link\"] span, .js-wiki-sidebar-page-container :is(.Truncate-text, .Link--primary)",
        "div.comment-body",
        "div.comment-body td.comment-body",
        "div.js-issue-title",
        "div.pull-request-review-comment",
        "p.f4.my-3",
        "div.commit-desc pre",
        "div.BorderGrid-cell > p",
        "div.merge-status-item span.status-meta",
        "div.f6.color-fg-muted.mt-2",
        "div.p-note.user-profile-bio",
        "p.pinned-item-desc",
        "div.js-log-container pre",
    ],
    ignoreSelector: "button, p.pinned-item-desc+p",
    autoScan: false,
    skipNode: shouldSkipGitHubElement,
};

/**
 * 判断是否应该跳过GitHub网站上的特定元素
 */
export function shouldSkipGitHubElement(node: any): boolean {
    // 检查是否为特殊内容（URL、邮箱、用户名等）
    if (node.textContent && isSpecialContent(node.textContent)) {
        debugLog('GitHub', '特殊内容跳过', node.textContent);
        return true;
    }
    
    // 判断是否为目录名称或路径
    if (isGitHubPathOrFileName(node)) {
        debugLog('GitHub', '目录/文件名跳过', node.textContent);
        return true;
    }
    
    // 检查是否为GitHub特定的标签文本
    const gitHubLabels = [
        'bug', 'feature', 'enhancement', 'documentation', 'duplicate', 'good first issue',
        'help wanted', 'invalid', 'question', 'wontfix', 'dependencies', 'security',
        'enhancement', 'open', 'closed', 'merged', 'draft', 'done', 'in progress',
        'pending', 'fixed', 'resolved', 'won\'t fix', 'needs review', 'approved',
        'blocked', 'stale', 'needs work', 'ready for review', 'needs more information',
        'enhancement', 'frontend', 'backend', 'api', 'ui', 'ux', 'refactor', 'test',
        'needs tests', 'ready for work', 'wip', 'top priority', 'low priority', 'medium priority',
        'high priority', 'work in progress', 'needs investigation', 'feature request',
        'discussion', 'breaking change', 'needs triage'
    ];
    
    // GitHub状态文本
    const gitHubStatusTexts = [
        'Open', 'Closed', 'Merged', 'Draft', 'Pending', 'Approved',
        'Changes requested', 'Review required', 'Needs work', 'Ready for review',
        'Assignee', 'Author', 'Changed', 'Comments', 'Commits', 'Conversation',
        'Files changed', 'Participants', 'Reviewers', 'Unresolved conversations',
        'View changes', 'Clone', 'Code', 'Contributors', 'Raw', 'Blame', 'History',
        'is:issue', 'is:pr', 'is:open', 'is:closed', 'state:open', 'state:closed',
        'No wrap', 'Soft wrap', 'Set status'
    ];
    
    // 如果节点文本是GitHub标签或状态文本，跳过翻译
    if (node.textContent) {
        const text = node.textContent.trim();
        
        // 检查是否为GitHub Label文本
        for (const label of gitHubLabels) {
            if (text.toLowerCase() === label.toLowerCase()) {
                debugLog('GitHub', 'GitHub Label跳过', text);
                return true;
            }
        }
        
        // 检查是否为GitHub状态文本
        for (const status of gitHubStatusTexts) {
            if (text === status) {
                debugLog('GitHub', 'GitHub状态文本跳过', text);
                return true;
            }
        }
        
        // 检查是否为搜索过滤器语法
        if (/^([a-z]+):([a-z]+)(\s+([a-z]+):([a-z]+))*$/.test(text)) {
            debugLog('GitHub', '搜索过滤器语法跳过', text);
            return true;
        }
        
        // 检查是否为版本号或数字统计
        if (/^v?\d+\.\d+(\.\d+)?(-[a-z0-9.]+)?$/.test(text) || 
            /^\d+\s+(issues|pull requests|commits|stars|forks|watching)$/.test(text.toLowerCase())) {
            debugLog('GitHub', '版本号或数字统计跳过', text);
            return true;
        }
    }
    
    // 如果当前节点或其祖先节点匹配这些选择器，则跳过
    const skipSelectors = [
        // 导航栏和菜单
        'header.Header',
        'nav.js-repo-nav',
        'nav.menu',
        // 侧边栏
        'div.Layout-sidebar',
        // 表单元素
        'form',
        'input',
        'textarea',
        'button',
        // 代码块和相关元素
        'pre.highlight',
        'code',
        'table.highlight',
        'table.diff-table',
        // 分页和过滤器
        'div.pagination',
        'div.subnav',
        // 操作按钮区域
        'div.file-header',
        'div.file-actions',
        // 贡献图
        'div.js-calendar-graph',
        // 统计信息区
        'ul.repository-lang-stats-numbers',
        // 按钮文本
        'summary',
        'span.Counter',
        'div.controls',
        'span.js-hidden-pane-button',
        // 文件树
        'div.js-details-container Details',
        'div.Box-row',
        // 目录文件名相关
        'div.react-directory-filename-column',
        'div.react-directory-filename-cell',
        'div.react-directory-truncate',
        'div[class*="directory-"]', // 匹配所有包含directory-的类名
        'a[title][aria-label*="Directory"]',
        'a[title][aria-label*="File"]',
        // 底部
        'footer',
        // 用户名相关
        'a.author',
        'span.author',
        'a.user-mention',
        'a.commit-author',
        // Pull Request和Issue相关元素
        'div.merge-status-list',
        'div.js-navigation-container',
        'span.State', // PR状态标签
        'div.TimelineItem-badge',
        'div.color-fg-muted', // 灰色提示文本
        'div.Box-header',
        'div.js-details-container', // 折叠的详情容器
        'span.Link--secondary', // 次要链接文本
        // 仓库元数据
        'div.BorderGrid-row',
        
        // 仓库统计信息和小组件
        '.repo-language-color', // 语言颜色指示器
        'a.topic-tag', // 话题标签
        'span.d-inline-block.mr-3', // 内联统计块
        'a.Link--muted', // 次要链接
        'span.no-wrap', // 不换行的文本（通常是统计数据）
        '.octicon', // 图标
        'a.Link--primary > svg.octicon', // 主要链接中的图标
        'div.d-flex', // 弹性布局容器（常用于统计信息）
        'div.repo-and-owner', // 仓库和所有者信息
        
        // 仓库顶部区域
        'nav.js-repo-nav',
        'h1.flex-auto', // 标题
        'div.pagehead', // 页面头部
        'div.pagehead-actions', // 页面头部操作区
        'div.f4.mt-3', // 主要描述
        'h2#files', // 文件列表标题
        
        // 底部区域元素
        'div.commit-tease', // 提交信息预览
        'div.file-wrap', // 文件包装器
        'ul.repository-lang-stats-numbers', // 语言统计数字
        
        // 统计计数器和标签
        'span.Counter', // 计数器
        'a.UnderlineNav-item', // 导航下划线项
        'span[data-view-component="true"]', // 视图组件
        'span.color-fg-muted', // 灰色文本
        'span.text-bold', // 粗体文本
        
        // Issue/PR导航区域
        'div.tabnav', // 标签导航
        'div.tabnav-tabs', // 标签导航标签
        'div.table-list-header-toggle', // 表格列表头切换
        
        // 活动区域
        'div.Box-header',
        'div.TimelineItem-badge',
        
        // 包管理和发布区域
        'div.package-list', // 包列表
        'div.release-entry', // 发布条目
        
        // 通用组件
        'span.Label', // 标签
        'span.State', // 状态指示器
        'a.social-count', // 社交计数
        'a.pl-3', // 带左内边距的链接
        'div[role="grid"]', // 网格角色的div
        'div.flash', // 闪烁通知
        
        // 仓库信息卡片
        'div.Box-row--gray', // 灰色行
        'div.BorderGrid-cell', // 边框网格单元格
        
        // Issue和PR搜索结果页面的元素
        'div.issue-item', // Issue项
        'div.issue-item-header', // Issue项头部
        'span.opened-by', // 打开者标记
        'div.issue-item-body', // Issue项内容
        'div.issue-item-footer', // Issue项底部
        'span.issue-item-meta', // Issue项元数据
        'span.issue-meta-section', // Issue元数据区域
        'div.flex-auto.min-width-0', // 弹性自动最小宽度容器
        'div.issues-reset-query-wrapper', // 重置查询包装器
        'span.issue-keyword', // Issue关键字
        'a.issues-reset-query', // 重置查询链接
        'span.selected-text', // 选中文本
        'a.filter-item', // 过滤项
        'span.label', // 标签
        'span.tooltipped', // 提示标签
        'div.select-menu-item-text', // 选择菜单项文本
        'div.select-menu-filters', // 选择菜单过滤器
        'a.select-menu-item', // 选择菜单项
        'div.select-menu-list', // 选择菜单列表
        'nav.subnav', // 子导航
        'div.flex-column.flex-auto', // 弹性列自动容器
        'div.table-list-filters', // 表格列表过滤器
        'div.table-list-header', // 表格列表头
        'div.flex-items-center.flex-justify-between', // 弹性项目居中和两端对齐
        'div.js-issue-row', // Issue行
        'div.lh-default', // 默认行高
        'a.js-selected-navigation-item', // 选中的导航项
        'nav.d-flex', // 弹性导航
        'div.js-check-all-container', // 全选容器
        'div.flex-shrink-0', // 弹性收缩为0
        'div.timeline-comment-header', // 时间线评论头
        'div.comment-form-textarea', // 评论表单文本域
        'div.sidebar-notifications', // 侧边栏通知
        'div.gh-header', // GitHub头部
        'span.js-issue-title', // Issue标题
        'a.js-hard-refresh', // 强制刷新链接
        'div.Link--muted', // 次要链接
        
        // 新增：Issue标签元素
        'a.IssueLabel', // Issue标签链接
        'span.IssueLabel', // Issue标签
        'span.Label', // 通用标签
        'span.labels', // 标签容器
        'span.label-link', // 标签链接
        'a.label-link', // 标签链接
        'div.labels', // 标签容器
        'span.color-label', // 颜色标签
        'span.bg-yellow', // 黄色背景（通常用于标签）
        'span.bg-green', // 绿色背景
        'span.bg-red', // 红色背景
        'span.bg-purple', // 紫色背景
        'span.bg-blue', // 蓝色背景
        'span.text-green', // 绿色文本
        'span.text-red', // 红色文本
        'span.text-gray', // 灰色文本
        'div.js-issue-labels', // Issue标签容器
        'div.js-issue-labels .labels a', // Issue标签链接
        'div.js-issue-labels .IssueLabel', // Issue标签
        'span.js-issue-labels', // Issue标签
        'span.issue-meta-section.ml-2.issue-label-group', // Issue标签组
        'span.color-fg-danger', // 危险颜色（通常用于closed/rejected状态）
        'span.color-fg-success', // 成功颜色（通常用于open/accepted状态）
        'span.color-fg-muted', // 暗淡颜色（通常用于辅助信息）
        'span.color-fg-done', // 完成颜色
    ];

    // 检查当前节点是否匹配跳过选择器
    for (const selector of skipSelectors) {
        if (node.matches?.(selector)) {
            debugLog('GitHub', '选择器匹配跳过', selector, node.textContent);
            return true;
        }
    }
    
    // 检查节点的类名是否包含特定关键字
    const skipClassKeywords = [
        'octicon', 'anim-', 'btn', 'menu', 'icon', 'Avatar', 'repo', 
        'branch', 'commits', 'issues', 'pull', 'directory', 'filename', 
        'Counter', 'topic-tag', 'social-count', 'State', 'Label', 'UnderlineNav',
        'IssueLabel', 'issue-keyword', 'issue-label', 'label-link', 'color-label',
        'js-issue-labels', 'issue-meta', 'bg-',  'color-text-'
    ];
    
    if (node.className && typeof node.className === 'string') {
        for (const keyword of skipClassKeywords) {
            if (node.className.includes(keyword)) {
                debugLog('GitHub', '类名关键字跳过', keyword, node.className);
                return true;
            }
        }
    }
    
    // 检查特定属性
    const skipAttributes = [
        'data-hovercard-type', 'data-issue-and-pr-hovercards-enabled',
        'data-issue-title', 'data-url', 'data-pjax', 'data-hotkey', 'data-target', 
        'data-filter-value', 'data-direction', 'data-state'
    ];
    
    for (const attr of skipAttributes) {
        if (node.hasAttribute && node.hasAttribute(attr)) {
            debugLog('GitHub', '属性匹配跳过', attr);
            return true;
        }
    }
    
    // 检查是否为用户名或@提及
    if (node.textContent?.trim().startsWith('@')) {
        debugLog('GitHub', '用户名@提及跳过', node.textContent);
        return true;
    }
    
    // 忽略代码片段
    if (node.tagName?.toLowerCase() === 'pre' || node.tagName?.toLowerCase() === 'code') {
        debugLog('GitHub', '代码片段跳过', node.tagName);
        return true;
    }
    
    // 忽略图标
    if (node.tagName?.toLowerCase() === 'svg') {
        debugLog('GitHub', 'SVG图标跳过');
        return true;
    }
    
    // 检查是否为统计数字和计数（例如：16.3k stars, 854 watching等）
    const statCountPattern = /^\s*\d+(\.\d+)?[kKmMbB]?\s*(stars|watching|forks|views|issues|pull|commits|watchers)?\s*$/;
    if (statCountPattern.test(node.textContent?.trim())) {
        debugLog('GitHub', '统计数字跳过', node.textContent);
        return true;
    }
    
    // 检查是否为仓库标签文本
    if (node.className?.includes('topic-tag-link') || 
        node.className?.includes('topic-tag') || 
        node.parentElement?.className?.includes('topic-tag')) {
        debugLog('GitHub', '仓库标签跳过', node.textContent);
        return true;
    }
    
    // 检查是否为许可证文本
    if (/^Apache-[\d.]+|MIT|GPL-[\d.]+|BSD|LGPL/.test(node.textContent?.trim())) {
        debugLog('GitHub', '许可证文本跳过', node.textContent);
        return true;
    }
    
    return false;
}

/**
 * 判断节点是否包含GitHub的路径或文件名
 */
export function isGitHubPathOrFileName(node: any): boolean {
    if (!node || !node.textContent) return false;
    
    const text = node.textContent.trim();
    if (!text) return false;
    
    // 检查节点是否为导航路径元素
    if (node.matches?.('nav[aria-label="Breadcrumb"]') || 
        node.matches?.('span.final-path') || 
        node.matches?.('span.js-repo-root') ||
        node.matches?.('a[title][aria-label*="Directory"]') ||
        node.matches?.('a[title][aria-label*="File"]')) {
        debugLog('GitHub', '路径导航元素', '匹配选择器', node.outerHTML?.substring(0, 100));
        return true;
    }
    
    // 检查父元素是否为目录元素
    let parent = node.parentElement;
    while (parent) {
        if (parent.matches?.('div.react-directory-filename-column') || 
            parent.matches?.('div.react-directory-filename-cell') ||
            parent.matches?.('div.react-directory-truncate') ||
            parent.className?.includes('directory-')) {
            debugLog('GitHub', '目录元素父节点', '匹配父元素选择器', parent.outerHTML?.substring(0, 100));
            return true;
        }
        parent = parent.parentElement;
    }
    
    // 检查是否为目录链接
    if (node.tagName?.toLowerCase() === 'a' && 
        node.getAttribute('aria-label')?.includes('Directory')) {
        debugLog('GitHub', '目录链接', 'aria-label包含Directory', node.getAttribute('aria-label'));
        return true;
    }
    
    // 检查是否为常见目录或文件名
    if (/^\.github|^src\/|^test\/|^docs\/|^\.gitignore$|^LICENSE$|^README\.md$|^CHANGELOG\.md$|^package\.json$|^Dockerfile$/i.test(text)) {
        // 如果当前节点是链接或者在文件列表中
        if (node.tagName?.toLowerCase() === 'a' || 
            node.parentElement?.matches?.('div.Box-row')) {
            debugLog('GitHub', '常见目录或文件名', text);
            return true;
        }
    }
    
    // 检查是否为路径格式（包含/的短文本）
    if (text.includes('/') && text.length < 100 && 
        !/\s/.test(text) && // 不包含空格
        !/[，。？！；：""''（）【】「」『』〔〕]/.test(text)) { // 不包含中文标点
        debugLog('GitHub', '路径格式文本', text);
        return true;
    }
    
    // 检查是否为常见的开发相关文件扩展名
    if (/\.(js|ts|jsx|tsx|css|scss|html|json|md|py|java|go|rs|c|cpp|h|hpp|rb|php|sh|bat|cmd|yaml|yml|xml)$/i.test(text)) {
        debugLog('GitHub', '文件扩展名匹配', text);
        return true;
    }
    
    // 检查是否为Issue/PR编号格式
    if (/^#\d+$/.test(text) || /^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+#\d+$/.test(text)) {
        debugLog('GitHub', 'Issue/PR编号', text);
        return true;
    }
    
    return false;
}
