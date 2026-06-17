import { useEffect, useMemo, useState } from 'react';
import { getTranslationStatus } from '../entrypoints/utils/translateApi';
import './TranslationStatus.css';

interface TranslationStatusSnapshot {
  activeTranslations: number;
  pendingTranslations: number;
  maxConcurrent: number;
  isQueueFull: boolean;
  totalTasksInProcess: number;
}

const initialStatus: TranslationStatusSnapshot = {
  activeTranslations: 0,
  pendingTranslations: 0,
  maxConcurrent: 6,
  isQueueFull: false,
  totalTasksInProcess: 0,
};

export default function TranslationStatus() {
  const [status, setStatus] = useState<TranslationStatusSnapshot>(initialStatus);
  const [isVisible, setIsVisible] = useState(false);
  const [isFloatingBallTranslating, setIsFloatingBallTranslating] = useState(false);
  const [userClosed, setUserClosed] = useState(false);

  const progressStyle = useMemo(() => {
    const percent = status.maxConcurrent > 0 ? (status.activeTranslations / status.maxConcurrent) * 100 : 0;
    return {
      width: `${percent}%`,
      backgroundColor: percent > 80 ? '#ff7675' : percent > 50 ? '#fdcb6e' : '#00cec9',
    };
  }, [status.activeTranslations, status.maxConcurrent]);

  useEffect(() => {
    const updateStatus = () => {
      const currentStatus = getTranslationStatus();
      setStatus(currentStatus);
      setIsVisible(currentStatus.activeTranslations > 0 || currentStatus.pendingTranslations > 0);
    };

    updateStatus();
    const timer = window.setInterval(updateStatus, 500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleTranslationStarted = () => {
      setIsFloatingBallTranslating(true);
      setIsVisible((visible) => {
        if (!visible) setUserClosed(false);
        return visible;
      });
    };
    const handleTranslationEnded = () => setIsFloatingBallTranslating(false);

    document.addEventListener('bilingualtranslate-translation-started', handleTranslationStarted);
    document.addEventListener('bilingualtranslate-translation-ended', handleTranslationEnded);

    return () => {
      document.removeEventListener('bilingualtranslate-translation-started', handleTranslationStarted);
      document.removeEventListener('bilingualtranslate-translation-ended', handleTranslationEnded);
    };
  }, []);

  useEffect(() => {
    let lastUrl = location.href;
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        window.setTimeout(() => setUserClosed(false), 1000);
      }
    };
    const urlObserver = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        setUserClosed(false);
      }
    });

    document.addEventListener('visibilitychange', handleVisibilityChange);
    urlObserver.observe(document, { subtree: true, childList: true });

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      urlObserver.disconnect();
    };
  }, []);

  if (!isVisible || !isFloatingBallTranslating || userClosed) {
    return null;
  }

  return (
    <div className="translation-status-container">
      <div className="translation-status-card">
        <div className="translation-status-header">
          <div className="translation-status-title">翻译进度</div>
          <button className="translation-status-close" type="button" onClick={() => setUserClosed(true)}>
            ×
          </button>
        </div>
        <div className="translation-status-content">
          <div className="translation-status-row">
            <div className="translation-status-label">当前活跃任务:</div>
            <div className="translation-status-value">
              {status.activeTranslations} / {status.maxConcurrent}
            </div>
          </div>
          <div className="translation-status-row">
            <div className="translation-status-label">等待中的任务:</div>
            <div className="translation-status-value">{status.pendingTranslations}</div>
          </div>
          <div className="translation-status-progress">
            <div className="translation-status-progress-bar" style={progressStyle} />
          </div>
        </div>
      </div>
    </div>
  );
}
