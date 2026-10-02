export const services = {
    // 传统机器翻译
    microsoft: "microsoft",
    google: "google",
    chromeTranslator: "chromeTranslator", // Chrome 内置翻译 API
    // 大模型翻译
    custom: "custom",
    deepseek: "deepseek",
    openrouter: "openrouter",
};

export const customModelString = "自定义模型";
export const options = {
    chromeTranslationEngine: [
        {value: 'translator', label: '原生翻译'},
        {value: 'prompt', label: 'Chrome Gemma 4'},
    ],
    // 是否即时翻译
    autoTranslate: [
        {value: true, label: "开启"},
        {value: false, label: "关闭"},
    ],
    // 是否使用缓存
    useCache: [
        {value: true, label: "开启"},
        {value: false, label: "关闭"},
    ],
    form: [{value: "auto", label: "自动检测"}],
    to: [
        {value: "zh-Hans", label: "中文"},
        {value: "en", label: "英语"},
        {value: "ja", label: "日语"},
        {value: "ko", label: "韩语"},
        {value: "fr", label: "法语"},
        {value: "ru", label: "俄语"},
    ],
    keys: [
        {value: "none", label: "禁用快捷键"},

        {value: "Computer", label: "键盘选项", disabled: true},
        {value: "Control", label: "Ctrl"},
        {value: "Alt", label: "Alt"},
        {value: "Shift", label: "Shift"},
        {value: "Escape", label: "ESC"},
        {value: "`", label: "波浪号键"},

        {value: "mouse", label: "鼠标选项", disabled: true},
        {value: "DoubleClick", label: "鼠标双击"},
        {value: "LongPress", label: "鼠标长按"},
        {value: "MiddleClick", label: "鼠标滚轮单击"},
        {value: "AltClick", label: "Alt/Option+点击"},

        {value: "touchscreen", label: "触屏设备选项", disabled: true},
        {value: "TwoFinger", label: "双指翻译"},
        {value: "ThreeFinger", label: "三指翻译"},
        {value: "FourFinger", label: "四指翻译"},
        {value: "DoubleClickScree", label: "双击翻译"},
        {value: "TripleClickScree", label: "三击翻译"},
        
        {value: "custom", label: "自定义快捷键（测试版）"},
    ],
    services: [
        // 传统机器翻译
        {value: "machine", label: "机器翻译", disabled: true},
        {value: services.microsoft, label: "微软翻译"},
        {value: services.google, label: "谷歌翻译"},
        // 大模型翻译
        {value: "ai", label: "AI翻译", disabled: true},
        {value: services.chromeTranslator, label: "Chrome内置AI翻译⭐"},
        {value: services.deepseek, label: "DeepSeek️"},
        {value: services.openrouter, label: "OpenRouter"},
        {value: services.custom, label: "自定义接口⭐️"},
    ],
    display: [
        {value: 0, label: "仅译文模式"},
        {value: 1, label: "双语对照模式"},
    ],
    // 双语翻译样式（扁平列表，无分组）
    styles: [
        {value: 0, label: "无样式", class: "bilingual-display-default"},
        {value: 4, label: "蓝色实线", class: "bilingual-display-solid-underline"},
        {value: 5, label: "优雅虚线", class: "bilingual-display-dot-underline"},
        {value: 6, label: "活泼波浪", class: "bilingual-display-wavy"},
        {value: 10, label: "荧光划线", class: "bilingual-display-highlight-underline"},
        {value: 11, label: "荧光标记", class: "bilingual-display-marker"},
        {value: 13, label: "温暖黄底", class: "bilingual-display-lightyellow"},
        {value: 17, label: "轻巧边框", class: "bilingual-display-border"},
    ],
    theme: [
        {value: "auto", label: "跟随操作系统"},
        {value: "light", label: "亮色主题"},
        {value: "dark", label: "暗色主题"},
    ],
    // 输入框翻译目标语言选项
    inputBoxTranslationTarget: [
        {value: "zh-Hans", label: "中文"},
        {value: "en", label: "英语"},
        {value: "ja", label: "日语"},
        {value: "ko", label: "韩语"},
        {value: "fr", label: "法语"},
        {value: "ru", label: "俄语"},
        {value: "es", label: "西班牙语"},
        {value: "de", label: "德语"},
        {value: "pt", label: "葡萄牙语"},
        {value: "it", label: "意大利语"},
    ],
    // 输入框翻译触发方式选项
    inputBoxTranslationTrigger: [
        {value: "disabled", label: "关闭"},
        {value: "triple_space", label: "连按三下空格"},
        {value: "triple_equal", label: "连按三下等号(=)"},
        {value: "triple_dash", label: "连按三下短横线(-)"},
    ],
    // 字幕配音朗读内容
    youtubeDubbingSource: [
        {value: "translation", label: "译文"},
        {value: "origin", label: "原文"},
    ],
};

export const defaultOption = {
    on: true,
    from: "auto",
    to: "zh-Hans",
    style: 5,
    display: 1,
    hotkey: "Control",
    service: services.microsoft,
    chromeTranslationEngine: "translator" as const,
    custom: "http://localhost:11434/v1/chat/completions",
    system_role:
        "You are a professional, authentic machine translation engine.",
    user_role: `Translate the following text into {{to}}, If translation is unnecessary (e.g. proper nouns, codes, etc.), return the original text. NO explanations. NO notes:

{{origin}}`,
    count: 0,
    useCache: true,
    inputBoxTranslationTrigger: "disabled", // 默认关闭输入框翻译
    inputBoxTranslationTarget: "en", // 默认翻译成英文
};
