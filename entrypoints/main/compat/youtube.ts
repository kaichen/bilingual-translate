import type {SiteCompatRule} from "./index";
import {DEFAULT_SELECT_STYLE, debugLog, isSpecialContent} from "./shared";

const parser = new DOMParser();

export const youtubeLiveChatRule: SiteCompatRule = {
    pattern: "www.youtube.com/live_chat",
    rootsSelector: "div#items",
    selector: "span.yt-live-chat-text-message-renderer",
    autoScan: false,
};

export const youtubeRule: SiteCompatRule = {
    pattern: "youtube.com",
    rootsSelector: "ytd-page-manager",
    selector: [
        "h1.title",
        "div#description-inline-expander",
        "yt-formatted-string#content-text",
        "div#description",
        "yt-formatted-string.ytd-playlist-panel-renderer",
        "yt-formatted-string.ytd-compact-video-renderer",
        "ytd-backstage-post-renderer div#content",
        "span.captions-text",
        "yt-formatted-string",
    ],
    ignoreSelector: "aside, button, footer, form, header, pre, mark, nav, #player, #container, .caption-window, .ytp-settings-menu, #kiss-youtube-subtitle-list-container",
    selectStyle: DEFAULT_SELECT_STYLE,
    parentStyle: DEFAULT_SELECT_STYLE,
    grandStyle: DEFAULT_SELECT_STYLE,
    skipNode: shouldSkipYouTubeElement,
    replace: youtubeReplace,
};

// 译文回填：保留 YouTube yt-formatted-string 的链接/格式结构（原 replaceCompatFn['youtube.com']，挂在 rule.replace）
export function youtubeReplace(node: any, text: any) {
    // 使用DOMParser解析翻译后的HTML
    const doc = parser.parseFromString(text, 'text/html');
    const newNode = doc.body.firstChild as HTMLElement;

    // 针对YouTube特有的格式化字符串进行特殊处理
    if (node.tagName.toLowerCase() === 'yt-formatted-string') {
        // 尝试保留原有的属性和样式
        if (node.hasAttribute('has-link-only_')) {
            node.innerHTML = newNode.innerHTML;
            return;
        }

        // 处理具有特殊格式的内容
        if (node.querySelector('a') || node.querySelector('span')) {
            const links = node.querySelectorAll('a');
            const spans = node.querySelectorAll('span');

            if (links.length > 0 || spans.length > 0) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = newNode.innerHTML;

                node.childNodes.forEach((child: Node) => {
                    if (child.nodeType === Node.ELEMENT_NODE) {
                        if (child.nodeName.toLowerCase() === 'a' || child.nodeName.toLowerCase() === 'span') {
                            (child as HTMLElement).textContent = tempDiv.textContent || '';
                        }
                    }
                });
                return;
            }
        }
    }

    // 默认处理：直接替换innerHTML
    node.innerHTML = newNode.innerHTML;
}

/**
 * 判断是否应该跳过YouTube网站上的特定元素
 */
export function shouldSkipYouTubeElement(node: any): boolean {
    // 检查是否为特殊内容（URL、邮箱、用户名等）
    if (node.textContent && isSpecialContent(node.textContent)) {
        debugLog('YouTube', '特殊内容跳过', node.textContent);
        return true;
    }
    
    // 如果当前节点或其祖先节点匹配这些选择器，则跳过
    const skipSelectors = [
        // 导航和菜单相关
        'div#masthead-container', // 顶部导航栏
        'div#guide-content', // 左侧菜单
        'ytd-mini-guide-renderer', // 迷你导航
        'div#buttons', // 按钮区域
        'ytd-topbar-menu-button-renderer', // 顶部菜单按钮
        'ytd-guide-entry-renderer', // 导航入口
        'ytd-guide-section-renderer h3', // 导航区标题
        'div#channel-header', // 频道头部区域
        'div#channel-navigation', // 频道导航区域
        
        // 视频控制相关
        'div.ytp-chrome-bottom', // 播放器底部控制栏
        'div.ytp-chrome-top', // 播放器顶部控制栏
        'div.ytp-right-controls', // 右侧控制
        'div.ytp-left-controls', // 左侧控制
        'div.ytp-progress-bar-container', // 进度条容器
        'span.ytp-time-current', // 当前时间
        'span.ytp-time-duration', // 视频总时长
        'button.ytp-button', // 所有播放器按钮
        'div.ytp-chapter-container', // 章节容器
        
        // 统计和互动区域
        'div#info-contents ytd-video-primary-info-renderer div#top-level-buttons-computed', // 点赞/分享按钮
        'span#dot', // 分隔点
        'span.ytd-video-view-count-renderer', // 观看次数
        'span.ytd-video-owner-renderer', // 频道信息区域
        'div#owner', // 视频所有者区域
        'a.ytd-video-owner-renderer', // 频道链接
        'ytd-subscribe-button-renderer', // 订阅按钮
        'div.ytd-subscribe-button-renderer', // 订阅按钮渲染器
        'ytd-button-renderer', // 按钮渲染器
        'ytd-menu-renderer', // 菜单渲染器
        'ytd-badge-supported-renderer', // 徽章支持渲染器
        'div#sponsor-button', // 赞助按钮
        
        // 评论区控制元素
        'div#action-buttons', // 评论操作按钮
        'ytd-toggle-button-renderer', // 切换按钮
        'div#vote-count-middle', // 评论投票计数
        'ytd-comments-header-renderer', // 评论头部渲染器
        'div#title.ytd-comments-header-renderer', // 评论标题
        'span.ytd-comments-header-renderer', // 评论数量
        'ytd-sort-filter-sub-menu-renderer', // 评论排序选项
        'ytd-comment-action-buttons-renderer', // 评论操作按钮
        
        // 内容卡片和元数据
        'div.ytd-metadata-row-container-renderer', // 元数据行
        'div#subscribe-button', // 订阅按钮
        'span.ytd-channel-name', // 频道名称
        'div#owner-sub-count', // 订阅者数量
        'div.ytd-watch-metadata yt-formatted-string[is-empty]', // 空格式化字符串
        'ytd-metadata-row-renderer', // 元数据行
        'div#above-the-fold', // 页面顶部区域
        'div#primary-inner ytd-merch-shelf-renderer', // 商品架
        'div.ytd-structured-description-content-renderer', // 结构化描述内容
        'ytd-info-panel-content-renderer', // 信息面板内容
        'ytd-info-panel-container-renderer', // 信息面板容器
        
        // 缩略图和推荐视频信息
        'span.ytd-thumbnail-overlay-time-status-renderer', // 视频时长
        'span.ytd-video-meta-block', // 视频元数据块
        'div#metadata-line', // 元数据行
        'span.ytd-grid-video-renderer', // 网格视频渲染器
        'div#video-title.ytd-grid-video-renderer', // 视频网格标题
        'a.yt-simple-endpoint.ytd-grid-video-renderer', // 视频网格链接
        'ytd-thumbnail', // 缩略图
        'div#hover-overlays', // 悬停叠加层
        
        // 其他UI元素
        'button', // 所有按钮
        'yt-icon', // YouTube图标
        'a.yt-simple-endpoint[href^="/hashtag/"]', // 话题标签链接
        'a.yt-simple-endpoint[href^="/channel/"]', // 频道链接
        'div#text.ytd-channel-name', // 频道名文本
        'span.yt-core-attributed-string--link-inherit-color', // 特定格式化字符串
        'ytd-notification-topbar-button-renderer', // 通知按钮
        'ytd-searchbox', // 搜索框
        'ytd-dropdown-renderer', // 下拉菜单
        'ytd-live-chat-frame', // 直播聊天
        'ytd-playlist-header-renderer div#stats', // 播放列表统计数据
        'ytd-playlist-panel-renderer div#header-count', // 播放列表计数
        'ytd-playlist-panel-renderer div#play-button', // 播放列表播放按钮
        'ytd-playlist-panel-renderer a.ytd-playlist-panel-video-renderer', // 播放列表视频链接
        'ytd-playlist-byline-renderer', // 播放列表署名
    ];
    
    // 检查当前节点是否匹配跳过选择器
    for (const selector of skipSelectors) {
        if (node.matches?.(selector)) {
            debugLog('YouTube', '选择器匹配跳过', selector, node.textContent);
            return true;
        }
    }
    
    // 检查节点的类名是否包含特定关键字
    const skipClassKeywords = ['ytp-', 'button', 'badge', 'menu', 'selector', 'icon', 'thumbnail', 'avatar'];
    
    if (node.className && typeof node.className === 'string') {
        for (const keyword of skipClassKeywords) {
            if (node.className.includes(keyword)) {
                debugLog('YouTube', '类名关键字跳过', keyword, node.className);
                return true;
            }
        }
    }
    
    // 检查文本内容特征
    const textContent = node.textContent?.trim();
    if (textContent) {
        // 跳过纯数字、视图计数、日期等
        if (/^\d+(\.\d+)?[KMB]?$/.test(textContent)) {
            debugLog('YouTube', '数字计数跳过', textContent);
            return true;
        }
        
        // 跳过视频时长格式
        if (/^\d+:\d+$/.test(textContent) || /^\d+:\d+:\d+$/.test(textContent)) {
            debugLog('YouTube', '时间格式跳过', textContent);
            return true;
        }
        
        // 跳过视图计数和日期组合
        if (/^\d+(\.\d+)?[KMB]? views/.test(textContent) || 
            /\d+ (days|months|years) ago$/.test(textContent) ||
            /^\d+(\.\d+)?[KMB]? watching now$/.test(textContent)) {
            debugLog('YouTube', '视图计数/日期跳过', textContent);
            return true;
        }
        
        // 跳过YouTube常用单词和短语
        const skipPhrases = [
            'Subscribe', 'subscribed', 'subscribers', 'Join', 'Share', 'Save', 
            'Report', 'Download', 'Add to', 'Show more', 'Show less', 
            'Like', 'Dislike', 'Reply', 'Sort by', 'Top comments', 'Newest first',
            'Edit', 'View', 'playlist', 'Autoplay', 'Cast', 'Settings', 'Play',
            'Pause', 'Stream', 'Live', 'Premiere', 'Premieres', 'Premiered',
            'Skip', 'Next', 'Previous', 'Shuffle', 'Transcript', 'Captions',
            'Quality', 'Playback speed', 'More', 'Stats for nerds'
        ];
        
        for (const phrase of skipPhrases) {
            if (textContent.includes(phrase) && textContent.length < 30) {
                debugLog('YouTube', '特定短语跳过', phrase, textContent);
                return true;
            }
        }
        
        // 检查是否为频道名/@用户名
        if (/^@\w+$/.test(textContent) || 
            (textContent.startsWith('@') && textContent.length < 30)) {
            debugLog('YouTube', '频道/用户名跳过', textContent);
            return true;
        }
    }
    
    // 忽略图标和图像
    if (node.tagName?.toLowerCase() === 'svg' || node.tagName?.toLowerCase() === 'img') {
        debugLog('YouTube', '图标/图像跳过');
        return true;
    }
    
    return false;
}
