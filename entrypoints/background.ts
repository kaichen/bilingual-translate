import {_service} from "@/entrypoints/providers/service";
import {config} from "@/entrypoints/config/config";
import {CONTEXT_MENU_IDS} from "@/entrypoints/utils/constant";
import {type BackgroundMessage, type TranslateRequest} from "@/entrypoints/utils/messages";
import {microsoftTranslate} from "@/entrypoints/providers/translate/microsoft";

// 翻译状态管理
let translationStateMap = new Map<number, boolean>(); // tabId -> isTranslated

export default defineBackground({
    persistent: {
        safari: false,
    },
    main() {
        const isContextMenuSupported = !!browser.contextMenus

        // 创建右键菜单项
        if (isContextMenuSupported) {
            try {
                // 创建父菜单
                browser.contextMenus.create({
                    id: 'bilingualtranslate-parent',
                    title: 'bilingual translate',
                    contexts: ['page', 'selection'],
                });

                // 创建全文翻译子菜单
                browser.contextMenus.create({
                    id: CONTEXT_MENU_IDS.TRANSLATE_FULL_PAGE,
                    title: '全文翻译',
                    parentId: 'bilingualtranslate-parent',
                    contexts: ['page', 'selection'],
                });

                // 创建撤销翻译子菜单
                browser.contextMenus.create({
                    id: CONTEXT_MENU_IDS.RESTORE_ORIGINAL,
                    title: '撤销翻译',
                    parentId: 'bilingualtranslate-parent',
                    contexts: ['page', 'selection'],
                    enabled: false, // 初始状态为禁用
                });

                // 监听右键菜单点击事件
                browser.contextMenus.onClicked.addListener((info: any, tab: any) => {
                    if (!tab?.id) return;

                    if (info.menuItemId === CONTEXT_MENU_IDS.TRANSLATE_FULL_PAGE) {
                        // 发送消息到内容脚本触发全文翻译
                        browser.tabs.sendMessage(tab.id, {
                            type: 'contextMenuTranslate',
                            action: 'fullPage'
                        }).then(() => {
                            // 更新翻译状态
                            translationStateMap.set(tab.id!, true);
                            updateContextMenus(tab.id!);
                        }).catch((error: any) => {
                            console.error('Failed to send message to content script:', error);
                        });
                    } else if (info.menuItemId === CONTEXT_MENU_IDS.RESTORE_ORIGINAL) {
                        // 发送消息到内容脚本撤销翻译
                        browser.tabs.sendMessage(tab.id, {
                            type: 'contextMenuTranslate',
                            action: 'restore'
                        }).then(() => {
                            // 更新翻译状态
                            translationStateMap.set(tab.id!, false);
                            updateContextMenus(tab.id!);
                        }).catch((error: any) => {
                            console.error('Failed to send message to content script:', error);
                        });
                    }
                });

            } catch (error) {
                console.error('Error setting up context menu:', error);
            }
        } else {
            console.log("不支持右键菜单")
        }

        // 更新右键菜单状态
        const updateContextMenus = (tabId: number) => {
            const isTranslated = translationStateMap.get(tabId) || false;

            try {
                // 更新全文翻译菜单项
                browser.contextMenus.update(CONTEXT_MENU_IDS.TRANSLATE_FULL_PAGE, {
                    enabled: !isTranslated,
                    title: isTranslated ? '全文翻译 (已翻译)' : '全文翻译'
                });
                // 更新撤销翻译菜单项
                browser.contextMenus.update(CONTEXT_MENU_IDS.RESTORE_ORIGINAL, {
                    enabled: isTranslated,
                    title: isTranslated ? '撤销翻译' : '撤销翻译 (无翻译)'
                });
            } catch (error) {
                console.error('Failed to update context menus:', error);
            }
        };

        // 监听标签页切换事件，更新菜单状态
        browser.tabs.onActivated.addListener((activeInfo: any) => {
            if (isContextMenuSupported) updateContextMenus(activeInfo.tabId);
        });

        // 监听标签页更新事件（页面刷新等）
        browser.tabs.onUpdated.addListener((tabId: any, changeInfo: any) => {
            if (changeInfo.status === 'complete') {
                // 页面加载完成，重置翻译状态
                translationStateMap.set(tabId, false);
                if (isContextMenuSupported) updateContextMenus(tabId);
            }
        });

        // 监听标签页关闭事件，清理状态
        browser.tabs.onRemoved.addListener((tabId: any) => {
            translationStateMap.delete(tabId);
        });

        // 处理消息：带 type 的是指令消息（穷尽 switch），无 type 的是普通翻译请求（交 _service 分发）
        browser.runtime.onMessage.addListener((message: BackgroundMessage | TranslateRequest) => {
            return new Promise(async (resolve, reject) => {
                try {
                    if ('type' in message) {
                        switch (message.type) {
                            case 'getTranslationState':
                                resolve({ isTranslated: translationStateMap.get(message.tabId) || false });
                                return;
                            case 'setTranslationState':
                                translationStateMap.set(message.tabId, Boolean(message.isTranslated));
                                if (isContextMenuSupported) updateContextMenus(message.tabId);
                                resolve({ success: true });
                                return;
                            case 'inputBoxTranslation': {
                                // 输入框翻译固定走微软，自动检测源语言、译到指定目标语言（复用 provider 微软核心）
                                const translatedText = await microsoftTranslate(message.text, '', message.targetLang);
                                resolve({ success: true, translatedText });
                                return;
                            }
                        }
                        return;
                    }

                    // 无 type：普通翻译请求，交 _service 分发
                    _service[config.service](message)
                        .then(resp => resolve(resp))    // 成功
                        .catch(error => reject(error)); // 失败
                } catch (error) {
                    resolve({ success: false, error: error instanceof Error ? error.message : String(error) });
                }
            });
        });
    }
});
