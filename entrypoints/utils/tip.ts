import {throttle} from "@/entrypoints/utils/common";

// deprecated
const prefix = "";

function showMessage(message: string, type: 'success' | 'error') {
    const toast = document.createElement('div');
    toast.className = `bilingual-translate-toast ${type}`;
    toast.textContent = prefix + message;
    Object.assign(toast.style, {
        position: 'fixed',
        top: '18px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: '2147483647',
        maxWidth: 'min(420px, calc(100vw - 32px))',
        padding: '10px 14px',
        borderRadius: '8px',
        color: '#fff',
        background: type === 'error' ? 'rgba(220, 38, 38, 0.95)' : 'rgba(34, 139, 34, 0.95)',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.22)',
        fontSize: '14px',
        lineHeight: '1.5',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        pointerEvents: 'none',
    });

    document.body.appendChild(toast);
    window.setTimeout(() => {
        toast.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(-6px)';
        window.setTimeout(() => toast.remove(), 250);
    }, 2200);
}

function _sendErrorMessage(message: string) {
    showMessage(message, 'error');
}

function _sendSuccessMessage(message: string) {
    showMessage(message, 'success');
}

// 使用防抖函数包装，1s 内只能发送一次消息
export const sendErrorMessage = throttle(_sendErrorMessage, 1000);
export const sendSuccessMessage = throttle(_sendSuccessMessage, 1000);
