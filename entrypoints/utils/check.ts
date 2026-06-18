import { validateConfig } from "./config-check";
import { sendErrorMessage } from "./tip";
import { config } from "@/entrypoints/utils/config";

// 翻译前校验配置：纯校验逻辑在 config-check.ts，这里负责读 config 单例并把失败原因弹 toast
export function checkConfig(): boolean {
    const { valid, reason } = validateConfig(config);
    if (!valid) {
        if (reason) sendErrorMessage(reason);
        return false;
    }
    return true;
}

// Check if the node needs to be translated
export function skipNode(node: Node): boolean {
    return !node || !node.textContent?.trim() || hasLoadingSpinner(node) || hasRetryTag(node);
}

// Check if the node or any of its children contains a loading spinner
export function hasLoadingSpinner(node: Node): boolean {
    if (node.nodeType === Node.TEXT_NODE) return false;

    // Type guard to check if the node is an Element
    if (node instanceof Element && node.classList.contains('bilingual-translate-loading')) return true;

    // Check children only if the node is an Element
    if (node instanceof Element) {
        return Array.from(node.children).some(child => hasLoadingSpinner(child));
    }

    return false;
}

// Check if the node or any of its children contains a retry tag
export function hasRetryTag(node: Node): boolean {
    if (node.nodeType === Node.TEXT_NODE) return false;

    // Type guard to check if the node is an Element
    if (node instanceof Element && node.classList.contains('bilingual-translate-failure')) return true;

    // Check children only if the node is an Element
    if (node instanceof Element) {
        return Array.from(node.children).some(child => hasRetryTag(child));
    }

    return false;
}

// Search for a node with a specific class name
export function searchClassName(node: Node, className: string): Node | null {
    if (node instanceof Element && node.classList.contains(className)) return node;

    // Check children only if the node is an Element
    if (node instanceof Element) {
        for (let child of node.children) {
            let result = searchClassName(child, className);
            if (result) return result;
        }
    }

    return null;
}

export function contentPostHandler(text: string) {
    // 替换掉<think>与</think>之间的内容
    let content = text;
    content = content.replace(/^<think>[\s\S]*?<\/think>/, "");
    return content;
}
