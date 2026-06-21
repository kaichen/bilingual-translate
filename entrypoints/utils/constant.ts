export const method = {POST: "POST", GET: "GET",};

export const constants = {
    // 键鼠事件
    DoubleClick: "DoubleClick",
    LongPress: "LongPress",
    MiddleClick: "MiddleClick",
    AltClick: "AltClick", // 按住 Alt/Option 点击文字 → 翻译其所在 DOM
    // 触屏设备事件
    TwoFinger: "TwoFinger",
    ThreeFinger: "ThreeFinger",
    FourFinger: "FourFinger",
    DoubleClickScreen: "DoubleClickScree",
    TripleClickScreen: "TripleClickScreen",
}

export const styles = {
    // 仅译文模式
    singleTranslation: 0,
    // 双语对照模式
    bilingualTranslation: 1,
}

// 右键菜单ID常量
export const CONTEXT_MENU_IDS = {
    TRANSLATE_FULL_PAGE: 'bilingual-translate-translate-full-page',
    RESTORE_ORIGINAL: 'bilingual-translate-restore-original',
}
