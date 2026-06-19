// 翻译相关的 DOM 节点判定（从 check.ts 拆出）：是否跳过、是否含 loading/重试标记、按类名查找。
export function skipNode(node: Node): boolean {
    return !node || !node.textContent?.trim() || hasLoadingSpinner(node) || hasRetryTag(node);
}

// 节点或其子树是否含 loading spinner
export function hasLoadingSpinner(node: Node): boolean {
    if (node.nodeType === Node.TEXT_NODE) return false;
    if (node instanceof Element && node.classList.contains('bilingual-translate-loading')) return true;
    if (node instanceof Element) {
        return Array.from(node.children).some(child => hasLoadingSpinner(child));
    }
    return false;
}

// 节点或其子树是否含重试标记
export function hasRetryTag(node: Node): boolean {
    if (node.nodeType === Node.TEXT_NODE) return false;
    if (node instanceof Element && node.classList.contains('bilingual-translate-failure')) return true;
    if (node instanceof Element) {
        return Array.from(node.children).some(child => hasRetryTag(child));
    }
    return false;
}

// 在子树中查找带指定类名的节点
export function searchClassName(node: Node, className: string): Node | null {
    if (node instanceof Element && node.classList.contains(className)) return node;
    if (node instanceof Element) {
        for (let child of node.children) {
            let result = searchClassName(child, className);
            if (result) return result;
        }
    }
    return null;
}
