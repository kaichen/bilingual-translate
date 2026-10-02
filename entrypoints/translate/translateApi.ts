/**
 * 翻译API代理模块
 * 整合翻译队列管理，作为翻译函数和后台翻译服务之间的中间层
 */

import { enqueueTranslation, clearTranslationQueue, configureQueue } from './translateQueue';
import browser from 'webextension-polyfill';
import { config } from '../config/config';
import { cache } from './cache';
import { shouldSkipTranslation } from '../utils/common';
import { storage } from '@wxt-dev/storage';
import { TranslationCancelledError } from './errors';
import { servicesType } from '../providers/registry';
import { sendSuccessMessage } from '../ui/tip';
import { PROMPT_BATCH_MAX_SEGMENTS } from '../providers/llm/chrome-prompt';
import type { ChromeTranslationResponse, TranslateRequest } from '../utils/messages';

// 调试相关
const isDev = process.env.NODE_ENV === 'development';

// 把并发上限的实时读取注入翻译队列（队列本身不 import config，保持可单测）
// 原生翻译逐段串行；大模型放行一批，由后台合并成一次推理。
configureQueue(() => !servicesType.isNativeAI(config.service) ? config.maxConcurrentTranslations
  : config.chromeTranslationEngine === 'prompt' ? PROMPT_BATCH_MAX_SEGMENTS : 1);
const activeChromeRequests = new Set<string>();

// 后台空闲被回收后，本地大模型要重新加载；等待较久时提示一次，避免用户以为卡死。
const SLOW_MODEL_HINT_DELAY = 3000;
const SLOW_MODEL_HINT_INTERVAL = 30_000;
let lastSlowModelHint = 0;
function showSlowModelHint() {
  if (Date.now() - lastSlowModelHint < SLOW_MODEL_HINT_INTERVAL) return;
  lastSlowModelHint = Date.now();
  sendSuccessMessage('本地大模型处理中，首次加载较慢，请稍候…');
}
if (typeof window !== 'undefined') window.addEventListener('pagehide', cancelAllTranslations);

/**
 * 翻译API的统一入口
 * 所有翻译请求都应该通过此函数发送，以便集中管理队列和重试逻辑
 * 
 * @param origin 原始文本
 * @param context 上下文信息，通常是页面标题
 * @param options 翻译选项
 * @returns 翻译结果的Promise
 */
export async function translateText(origin: string, context: string = document.title, options: TranslateOptions = {}): Promise<string> {
  const {
    maxRetries = 3, 
    retryDelay = 1000, 
    timeout = 45000,
    useCache = config.useCache,
  } = options;

  // 如果目标语言与当前文本语言相同，直接返回原文
  if (shouldSkipTranslation(origin, config.to)) {
    return origin;
  }

  // 检查缓存
  if (useCache) {
    const cachedResult = cache.localGet(origin);
    if (cachedResult) {
      if (isDev) {
        console.log('[翻译API] 命中缓存，直接返回缓存结果');
      }
      return cachedResult;
    }
  }

  // 增加翻译计数
  config.count++;
  // 保存配置以确保计数持久化
  storage.setItem('local:config', JSON.stringify(config));

  const nativeSettings = servicesType.isNativeAI(config.service) ? {
    engine: config.chromeTranslationEngine, from: config.from, to: config.to,
  } : undefined;

  // 使用队列处理翻译请求
  return enqueueTranslation(async () => {
    // 创建翻译任务
    const translationTask = async (retryCount: number = 0): Promise<string> => {
      try {
        // 原生推理的计时与中止由后台负责，等待跨页面队列时不消耗推理时限。
        let result: string;
        if (nativeSettings) {
          const requestId = crypto.randomUUID();
          activeChromeRequests.add(requestId);
          const slowHint = nativeSettings.engine === 'prompt' ? setTimeout(showSlowModelHint, SLOW_MODEL_HINT_DELAY) : undefined;
          try {
            const response = await browser.runtime.sendMessage({ context, origin, requestId, timeout, chromeAI: nativeSettings } satisfies TranslateRequest) as ChromeTranslationResponse;
            if (!response.success) {
              if (response.cancelled) throw new TranslationCancelledError();
              throw new Error(response.error);
            }
            result = response.result;
          } finally {
            clearTimeout(slowHint);
            activeChromeRequests.delete(requestId);
          }
        } else {
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            result = await Promise.race([
              browser.runtime.sendMessage({ context, origin }),
              new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error('翻译请求超时')), timeout);
              }),
            ]) as string;
          } finally { clearTimeout(timer); }
        }

        // 如果翻译结果为空或与原文完全相同，直接返回原文
        if (!result || result === origin) {
          return origin;
        }

        // 缓存翻译结果
        if (useCache && (!nativeSettings || (servicesType.isNativeAI(config.service)
          && config.chromeTranslationEngine === nativeSettings.engine && config.from === nativeSettings.from && config.to === nativeSettings.to))) {
          cache.localSet(origin, result);
        }

        return result;
      } catch (error) {
        // 处理错误，根据重试策略决定是否重试
        if (!nativeSettings && retryCount < maxRetries) {
          if (isDev) {
            console.log(`[翻译API] 翻译失败，${retryCount + 1}/${maxRetries} 次重试，原因:`, error);
          }
          
          // 等待一段时间后重试
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          return translationTask(retryCount + 1);
        }
        
        // 超过最大重试次数，抛出异常
        throw error;
      }
    };

    // 开始执行翻译任务
    return translationTask();
  });
}

/**
 * 当用户离开页面或主动取消翻译时，清空翻译队列
 */
export function cancelAllTranslations() {
  if (isDev) {
    console.log('[翻译API] 取消所有等待中的翻译任务');
  }
  clearTranslationQueue();
  for (const requestId of activeChromeRequests) {
    void browser.runtime.sendMessage({ type: 'cancelChromeTranslation', requestId }).catch(() => {});
  }
}

/**
 * 翻译参数接口
 */
export interface TranslateOptions {
  /** 最大重试次数 */
  maxRetries?: number;
  /** 重试间隔(毫秒) */
  retryDelay?: number;
  /** 超时时间(毫秒) */
  timeout?: number;
  /** 是否使用缓存 */
  useCache?: boolean;
} 
