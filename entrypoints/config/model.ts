import { defaultOption, services } from "./option";
import { providerOf } from "@/entrypoints/providers/registry";

interface IMapping {
    [key: string]: string;
}

export class Config {
    on: boolean; // 是否开启
    autoTranslate: boolean; // 是否即时翻译（全局）
    autoTranslateDomains: string[]; // 始终自动翻译的站点 key 列表（getDomainKey）
    youtubeSubtitle: boolean; // 是否启用视频字幕翻译
    youtubeDubbing: boolean; // 是否启用字幕配音（TTS 朗读字幕并静音原声）
    youtubeDubbingSource: string; // 配音朗读内容：translation=译文，origin=原文
    sourceLanguages: string[]; // 只翻译这些原文语言；空数组表示自动检测、全部翻译
    to: string;
    hotkey: string;
    style: number;
    display: number = 1;
    service: string;
    token: IMapping;
    model: IMapping;
    customModel: IMapping;  // 自定义模型名称
    proxy: IMapping;  // 代理地址
    custom: string; // 本地服务地址
    system_role: IMapping;
    user_role: IMapping;
    count: number;  // 翻译次数
    theme: string;  // 主题模式：'auto' | 'light' | 'dark'
    useCache: boolean; // 是否使用缓存
    customHotkey: string; // 自定义鼠标悬浮快捷键
    maxConcurrentTranslations: number; // 最大并发翻译数量
    animations: boolean; // 是否启用动画效果
    inputBoxTranslationTrigger: string; // 输入框翻译触发方式
    inputBoxTranslationTarget: string; // 输入框翻译目标语言

    constructor(values: Partial<Config> = {}) {
        this.on = true;
        this.autoTranslate = false;
        this.autoTranslateDomains = [];
        this.youtubeSubtitle = false;
        this.youtubeDubbing = false;
        this.youtubeDubbingSource = 'translation';
        this.sourceLanguages = [];
        this.to = defaultOption.to;
        this.style = defaultOption.style;
        this.display = defaultOption.display;
        this.hotkey = defaultOption.hotkey;
        this.service = defaultOption.service;
        this.token = {};
        this.model = {};
        this.customModel = {};
        this.proxy = {};
        this.custom = defaultOption.custom;
        this.system_role = systemRoleFactory();
        this.user_role = userRoleFactory();
        this.count = 0;
        this.theme = 'auto';  // 默认跟随系统
        this.useCache = true; // 默认开启缓存
        this.customHotkey = ''; // 自定义鼠标悬浮快捷键为空
        this.maxConcurrentTranslations = 6; // 默认最大并发数为6
        this.animations = true; // 默认启用动画
        this.inputBoxTranslationTrigger = 'disabled'; // 默认关闭输入框翻译
        this.inputBoxTranslationTarget = 'en'; // 默认翻译成英文

        // 只载入现有配置字段，忽略已移除服务的专属设置。
        for (const key of Object.keys(this) as (keyof Config)[]) {
            if (key in values) Object.assign(this, {[key]: values[key]});
        }
        for (const key of ['token', 'model', 'customModel', 'proxy', 'system_role', 'user_role'] as const) {
            this[key] = Object.fromEntries(Object.entries(this[key]).filter(([service]) => providerOf(service)));
        }
        // 旧配置的单个源语言迁移为原文语言列表。
        const legacyFrom = (values as { from?: string }).from;
        if (!('sourceLanguages' in values) && legacyFrom && legacyFrom !== 'auto') this.sourceLanguages = [legacyFrom];
        if (!Array.isArray(this.sourceLanguages)) this.sourceLanguages = [];
        // 旧配置用引擎字段区分两种 Chrome 本地翻译，现在各是一个服务。
        if (this.service === services.chromeTranslator && (values as { chromeTranslationEngine?: string }).chromeTranslationEngine === 'prompt') {
            this.service = services.chromeGemma;
        }
        if (!providerOf(this.service)) this.service = defaultOption.service;
    }
}

// 构建所有服务的 system_role
function systemRoleFactory(): IMapping {
    let systems_role: IMapping = {};
    Object.keys(services).forEach(key => systems_role[key] = defaultOption.system_role);
    return systems_role;
}

// 构建所有服务的 user_role
function userRoleFactory(): IMapping {
    let users_role: IMapping = {};
    Object.keys(services).forEach(key => users_role[key] = defaultOption.user_role);
    return users_role;
}
