// 鼠标悬停快捷键的纯触发逻辑（从 content.ts 提取，不 import config → 可单测）。
//
// 与 utils/hotkey.ts 区分：
// - hotkey.ts 处理 popup 设置的「组合动作键」(Alt+T)的解析/校验/显示，要求最后一段是普通键。
// - 本文件处理内容脚本「按住修饰键悬停翻译」的持续按键追踪与精确匹配，**支持纯修饰键**(Control/Alt)。

// keydown/keyup 中作为主键追踪的特殊键白名单（合并原 content.ts 两张逐字相同的 specialKeys 表）。
const HOVER_SPECIAL_KEYS = new Set([
    'escape', 'enter', 'space', 'tab', 'backspace', 'delete', 'insert',
    'home', 'end', 'pageup', 'pagedown', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright',
]);

// 配置的悬停快捷键 → 期望按下的键 token 数组（修饰键统一为 control/alt/shift）。
// hotkey='custom' 用 customHotkey；'none'/空 → 空数组（表示禁用）。
export function parseHoverHotkey(hotkey: string, customHotkey: string): string[] {
    const hotkeyString = hotkey === 'custom' ? customHotkey : hotkey;
    if (!hotkeyString || hotkeyString === 'none') return [];

    // 单键格式（含纯修饰键，如 'Control' / 'Alt'）
    if (!hotkeyString.includes('+')) {
        const k = hotkeyString.toLowerCase();
        if (k === 'ctrl') return ['control'];
        if (k === 'option') return ['alt'];
        return [k];
    }

    // 组合键格式
    return hotkeyString.split('+').map(key => {
        const k = key.toLowerCase();
        if (k === 'ctrl') return 'control';
        if (k === 'option') return 'alt';
        return k;
    });
}

// 从键盘事件提取主键 token（非修饰键）：字母键 / 功能键 / 单字符 / 特殊键白名单；都不是则 null。
export function eventMainKeyToken(event: KeyboardEvent): string | null {
    const key = event.key.toLowerCase();
    const code = event.code?.toLowerCase();

    if (code && code.startsWith('key')) return code.slice(3);
    if (key.length === 1) return key;
    if (/^f\d+$/.test(key)) return key;
    if (HOVER_SPECIAL_KEYS.has(key)) return key;
    return null;
}

// 当前按下的键集是否精确匹配配置（不多不少）。空配置（禁用）恒不匹配。
export function isHoverMatch(pressed: Set<string>, parts: string[]): boolean {
    if (parts.length === 0) return false;
    return parts.every(k => pressed.has(k)) && parts.length === pressed.size;
}
