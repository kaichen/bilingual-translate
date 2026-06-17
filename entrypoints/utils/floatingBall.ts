import { createElement, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import FloatingBall, { type FloatingBallHandle } from '@/components/FloatingBall';
import { config } from '@/entrypoints/utils/config';
import browser from 'webextension-polyfill';
import { storage } from '@wxt-dev/storage';
import { autoTranslateEnglishPage, restoreOriginalContent } from '@/entrypoints/main/trans';

let floatingBallInstance: FloatingBallHandle | null = null;
let root: Root | null = null;
let container: HTMLElement | null = null;
let isTranslated = false; // 添加状态变量跟踪翻译状态

/**
 * 创建并挂载悬浮球
 * @param position 悬浮球位置 'left' | 'right'，如果不传入则使用配置中的值
 * @returns 
 */
export function mountFloatingBall(position?: 'left' | 'right') {
  // 如果配置禁用了悬浮球或已存在实例，则不创建
  if (config.disableFloatingBall || floatingBallInstance) {
    return;
  }

  // 使用传入的位置参数或配置中的位置
  const ballPosition = position || config.floatingBallPosition || 'right';
  // 更新配置
  config.floatingBallPosition = ballPosition;

  // 创建容器元素
  container = document.createElement('div');
  container.id = 'bilingual-translate-floating-ball-container';
  document.body.appendChild(container);

  const floatingBallRef = createRef<FloatingBallHandle>();
  const handlePositionChanged = (newPosition: 'left' | 'right') => {
    config.floatingBallPosition = newPosition;
    saveConfig();
  };
  const handleTranslationToggle = (isTranslating: boolean) => {
    if (isTranslating && !isTranslated) {
      document.dispatchEvent(new CustomEvent('bilingualtranslate-translation-started'));
      autoTranslateEnglishPage();
      isTranslated = true;
    } else if (!isTranslating && isTranslated) {
      document.dispatchEvent(new CustomEvent('bilingualtranslate-translation-ended'));
      restoreOriginalContent();
      isTranslated = false;
    }
  };

  root = createRoot(container);
  root.render(
    createElement(FloatingBall, {
      ref: floatingBallRef,
      position: ballPosition,
      onSettingsClick: () => {
        void browser.runtime.sendMessage({ type: 'openOptionsPage' });
      },
      onPositionChanged: handlePositionChanged,
      onTranslationToggle: handleTranslationToggle,
    }),
  );
  floatingBallInstance = floatingBallRef.current;
  
  // 监听自定义事件，用于通过快捷键触发悬浮球
  document.addEventListener('bilingualtranslate-toggle-translation', toggleFloatingBallTranslation);

  requestAnimationFrame(() => {
    floatingBallInstance = floatingBallRef.current;
  });

  return floatingBallRef.current;
}

/**
 * 切换悬浮球翻译状态
 * 通过键盘快捷键触发时使用
 */
export function toggleFloatingBallTranslation() {
  if (!floatingBallInstance) return;

  const currentState = floatingBallInstance.getIsTranslating();
  const newState = !currentState;
  
  // 触发对应的自定义事件
  if (newState) {
    document.dispatchEvent(new CustomEvent('bilingualtranslate-translation-started'));
  } else {
    document.dispatchEvent(new CustomEvent('bilingualtranslate-translation-ended'));
  }
  
  floatingBallInstance.setIsTranslating(newState);
  if (newState) {
    autoTranslateEnglishPage();
    isTranslated = true;
  } else {
    restoreOriginalContent();
    isTranslated = false;
  }
}

/**
 * 处理悬浮球点击事件
 */
function handleFloatingBallClick() {
  if (!floatingBallInstance) return;
  
  // 切换悬浮球翻译状态
  const newState = !floatingBallInstance.getIsTranslating();
  floatingBallInstance.setIsTranslating(newState);
  
  // 触发对应的自定义事件
  if (newState) {
    document.dispatchEvent(new CustomEvent('bilingualtranslate-translation-started'));
  } else {
    document.dispatchEvent(new CustomEvent('bilingualtranslate-translation-ended'));
  }
  
  if (newState) {
    autoTranslateEnglishPage();
    isTranslated = true;
  } else {
    restoreOriginalContent();
    isTranslated = false;
  }
}

// 悬浮球动画效果
function addFloatingBallAnimation(type: 'translate' | 'restore') {
  if (!floatingBallInstance) return;
  
  const ball = floatingBallInstance.element;
  if (!ball) return;
  const originalBackground = ball.style.background;
  const originalTransition = ball.style.transition;
  
  // 设置过渡效果
  ball.style.transition = 'all 0.3s ease';
  
  // 根据类型设置不同动画
  if (type === 'translate') {
    // 翻译激活动画
    ball.style.transform = 'scale(1.2)';
    ball.style.boxShadow = '0 0 15px rgba(0, 128, 255, 0.8)';
    ball.style.background = '#4285f4';
  } else {
    // 恢复原文动画
    ball.style.transform = 'scale(1.2)';
    ball.style.boxShadow = '0 0 15px rgba(76, 175, 80, 0.8)';
    ball.style.background = '#4caf50';
  }
  
  // 恢复原状
  setTimeout(() => {
    if (!floatingBallInstance) return;
    ball.style.transform = '';
    ball.style.boxShadow = '';
    ball.style.background = originalBackground;
    
    // 恢复原来的过渡设置
    setTimeout(() => {
      if (floatingBallInstance) {
        ball.style.transition = originalTransition;
      }
    }, 300);
  }, 300);
}

/**
 * 保存配置到存储
 */
function saveConfig() {
  // 使用插件提供的存储 API 保存配置
  storage.setItem('local:config', JSON.stringify(config)).catch((error) => {
    console.error('Failed to save config:', error);
  });
}

/**
 * 卸载悬浮球
 */
export function unmountFloatingBall() {
  if (floatingBallInstance && root) {
    // 移除事件监听
    document.removeEventListener('bilingualtranslate-toggle-translation', toggleFloatingBallTranslation);

    root.unmount();
    floatingBallInstance = null;
    root = null;
    
    // 移除容器
    if (container) {
      container.remove();
      container = null;
    }
    isTranslated = false;
  }
}

/**
 * 切换悬浮球可见性
 */
export function toggleFloatingBall() {
  if (floatingBallInstance) {
    unmountFloatingBall();
    config.disableFloatingBall = true;
  } else {
    config.disableFloatingBall = false;
    mountFloatingBall();
  }
  
  // 保存配置到存储
  saveConfig();
}

/**
 * 切换悬浮球位置
 */
export function toggleFloatingBallPosition() {
  const newPosition = config.floatingBallPosition === 'left' ? 'right' : 'left';
  if (floatingBallInstance) {
    unmountFloatingBall();
    config.floatingBallPosition = newPosition;
    mountFloatingBall(newPosition);
  } else {
    config.floatingBallPosition = newPosition;
  }
  
  // 保存配置到存储
  saveConfig();
} 
