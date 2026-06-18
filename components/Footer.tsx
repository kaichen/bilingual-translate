import { useEffect, useState } from 'preact/hooks';
import { storage } from '@wxt-dev/storage';
import browser from 'webextension-polyfill';
import { Config } from '../entrypoints/utils/model';
import { type ContentMessage } from '@/entrypoints/utils/messages';
import './popup-components.css';

export default function Footer() {
  const [count, setCount] = useState(0);
  const [buttonText, setButtonText] = useState('清除翻译缓存');
  const [buttonDisabled, setButtonDisabled] = useState(false);
  const [showLoading, setShowLoading] = useState(false);

  useEffect(() => {
    const applyConfig = (value: unknown) => {
      const nextConfig = new Config();
      if (typeof value === 'string' && value) {
        Object.assign(nextConfig, JSON.parse(value));
      }
      setCount(nextConfig.count);
    };

    void storage.getItem('local:config').then(applyConfig);
    const unwatch = storage.watch('local:config', (newValue) => applyConfig(newValue));
    return () => unwatch();
  }, []);

  async function clearCache() {
    try {
      setButtonDisabled(true);
      setButtonText('正在清除...');
      setShowLoading(true);

      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]?.id) {
        throw new Error('No active tab found');
      }

      await browser.tabs.sendMessage(tabs[0].id, { type: 'clearCache' } satisfies ContentMessage);
      setButtonText('清除成功');
    } catch (error) {
      console.error('清除缓存失败:', error);
      setButtonText('清除失败');
    } finally {
      window.setTimeout(() => {
        setButtonDisabled(false);
        setButtonText('清除翻译缓存');
        setShowLoading(false);
      }, 1500);
    }
  }

  return (
    <div className="bt-footer-container bt-footer-size">
      <p className="bt-translation-count">
        你已经翻译 <span className="bt-count-number">{count}</span> 次
      </p>
      <div className="bt-footer-links">
        <button
          className={`bt-action-link ${buttonText === '清除失败' ? 'failed' : ''} ${buttonText === '清除成功' ? 'success' : ''}`}
          type="button"
          onClick={clearCache}
          disabled={buttonDisabled}
        >
          {showLoading && <span className="bt-loading-dot" />}
          {buttonText}
        </button>
      </div>
    </div>
  );
}
