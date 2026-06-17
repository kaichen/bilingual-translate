import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { autoUpdate, computePosition, flip, hide, inline, offset, shift } from '@floating-ui/dom';
import { config } from '@/entrypoints/utils/config';
import { translateText } from '@/entrypoints/utils/translateApi';
import './SelectionTranslator.css';

const MAX_SELECTION_LENGTH = 4096;

function CopyIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function SpeakerIcon({ paused = false }: { paused?: boolean }) {
  if (paused) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="6" y="4" width="4" height="16" />
        <rect x="14" y="4" width="4" height="16" />
      </svg>
    );
  }

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}

function HeadphonesIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default function SelectionTranslator() {
  const [selectedText, setSelectedText] = useState('');
  const [translationResult, setTranslationResult] = useState('');
  const [selectRange, setSelectRange] = useState<Range | null>(null);
  const [showIndicator, setShowIndicator] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isHoveringTooltip, setIsHoveringTooltip] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPlayingText, setCurrentPlayingText] = useState('');
  const [isDarkTheme, setIsDarkTheme] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hideTooltipTimer = useRef<number | null>(null);
  const debounceTimer = useRef<number | null>(null);
  const audioElement = useRef<HTMLAudioElement | null>(null);
  const lastSelectedText = useRef('');
  const isSelecting = useRef(false);
  const isPlayingRef = useRef(false);
  const showIndicatorRef = useRef(false);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    showIndicatorRef.current = showIndicator;
  }, [showIndicator]);

  const clearHideTooltipTimer = useCallback(() => {
    if (hideTooltipTimer.current !== null) {
      window.clearTimeout(hideTooltipTimer.current);
      hideTooltipTimer.current = null;
    }
  }, []);

  const setHideTooltipTimer = useCallback(() => {
    clearHideTooltipTimer();
    hideTooltipTimer.current = window.setTimeout(() => {
      if (isPlayingRef.current) return;
      setShowTooltip(false);
    }, 250);
  }, [clearHideTooltipTimer]);

  const stopAudio = useCallback((event?: Event | ReactMouseEvent) => {
    event?.stopPropagation();
    event?.preventDefault();

    if (audioElement.current) {
      audioElement.current.pause();
      audioElement.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    setIsPlaying(false);
    setCurrentPlayingText('');
  }, []);

  const closeTooltip = useCallback(() => {
    setShowTooltip(false);
    stopAudio();
  }, [stopAudio]);

  const hideIndicator = useCallback(() => {
    setShowIndicator(false);
    setHideTooltipTimer();
  }, [setHideTooltipTimer]);

  const getTranslation = useCallback(async () => {
    if (!selectedText) return;

    setIsLoading(true);
    setError('');

    try {
      const result = await translateText(selectedText);
      setTranslationResult(result);
    } catch (err) {
      setError('翻译失败，请重试');
      console.error('Translation error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedText]);

  useEffect(() => {
    if (showTooltip) {
      void getTranslation();
    } else if (isPlayingRef.current) {
      stopAudio();
    }
  }, [showTooltip, getTranslation, stopAudio]);

  useEffect(() => {
    if ((!showIndicator && !showTooltip) || !selectRange || !containerRef.current) return;

    const updatePosition = () => {
      const container = containerRef.current;
      if (!container) return;

      void computePosition(selectRange as unknown as Element, container, {
        placement: 'right',
        strategy: 'fixed',
        middleware: [
          offset(2),
          flip({
            fallbackPlacements: ['left', 'right', 'top-start', 'top-end', 'bottom-start', 'bottom-end'],
            padding: { top: 100, bottom: 100 },
          }),
          shift(),
          hide(),
          inline(),
        ],
      }).then(({ x, y, placement, middlewareData }) => {
        Object.assign(container.style, {
          left: `${x}px`,
          top: `${y}px`,
          visibility: middlewareData.hide?.referenceHidden ? 'hidden' : 'visible',
        });
        container.setAttribute('data-placement', placement);
      });
    };

    const cleanup = autoUpdate(selectRange as unknown as Element, containerRef.current, updatePosition, {
      animationFrame: true,
    });
    return cleanup;
  }, [selectRange, showIndicator, showTooltip]);

  useEffect(() => {
    if (!showIndicator && !showTooltip) {
      setSelectRange(null);
    }
  }, [showIndicator, showTooltip]);

  const debounce = useCallback((fn: () => void, delay: number) => {
    if (debounceTimer.current) {
      window.clearTimeout(debounceTimer.current);
    }
    debounceTimer.current = window.setTimeout(() => {
      fn();
      debounceTimer.current = null;
    }, delay);
  }, []);

  const handleTextSelection = useCallback(() => {
    if (isSelecting.current) return;

    debounce(() => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        hideIndicator();
        return;
      }

      const selectedTextContent = selection.toString().trim();
      if (!selectedTextContent) return;

      if (selectedTextContent === lastSelectedText.current) {
        const range = selection.getRangeAt(0);
        setSelectRange(range);
        setShowIndicator(true);
        return;
      }

      if (selectedTextContent.length < 2 || selectedTextContent.length > MAX_SELECTION_LENGTH) {
        hideIndicator();
        return;
      }

      const range = selection.getRangeAt(0);
      setSelectedText(selectedTextContent);
      lastSelectedText.current = selectedTextContent;
      setSelectRange(range);
      setShowIndicator(true);
      setTranslationResult('');
      setError('');
    }, 200);
  }, [debounce, hideIndicator]);

  const copyTranslation = useCallback(() => {
    if (!translationResult) return;

    navigator.clipboard
      .writeText(translationResult)
      .then(() => {
        setCopySuccess(true);
        window.setTimeout(() => setCopySuccess(false), 1500);
      })
      .catch((err) => {
        console.error('复制失败:', err);
      });
  }, [translationResult]);

  const detectLanguage = (text: string): string => {
    if (/[\u4e00-\u9fa5]/.test(text)) return 'zh-CN';
    if (/[\u3040-\u30ff]/.test(text)) return 'ja-JP';
    if (/[\uAC00-\uD7A3]/.test(text)) return 'ko-KR';
    if (/[\u0400-\u04FF]/.test(text)) return 'ru-RU';
    if (/[äöüßÄÖÜ]/.test(text)) return 'de-DE';
    if (/[àâçéèêëîïôùûüÿæœÀÂÇÉÈÊËÎÏÔÙÛÜŸÆŒ]/.test(text)) return 'fr-FR';
    if (/[áéíóúüñÁÉÍÓÚÜÑ]/.test(text)) return 'es-ES';
    return 'en-US';
  };

  const tryWebSpeechAPI = useCallback((text: string, language: string) => {
    if (isPlayingRef.current || !('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language;
    setIsPlaying(true);
    setCurrentPlayingText(text);

    utterance.onstart = () => {
      setIsPlaying(true);
      setCurrentPlayingText(text);
    };
    utterance.onend = () => {
      setIsPlaying(false);
      setCurrentPlayingText('');
    };
    utterance.onerror = () => {
      setIsPlaying(false);
      setCurrentPlayingText('');
    };

    window.speechSynthesis.speak(utterance);
  }, []);

  const toggleAudio = useCallback(
    (text: string, event?: ReactMouseEvent) => {
      if (!text) return;

      event?.stopPropagation();
      event?.preventDefault();
      clearHideTooltipTimer();
      setIsHoveringTooltip(true);

      if (isPlayingRef.current && currentPlayingText === text) {
        stopAudio(event);
        return;
      }

      if (isPlayingRef.current) {
        stopAudio(event);
      }

      const language = detectLanguage(text);
      const speechUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${language}&client=tw-ob&q=${encodeURIComponent(text)}`;
      const audio = new Audio(speechUrl);
      audioElement.current = audio;
      setIsPlaying(true);
      setCurrentPlayingText(text);

      audio.onplay = () => {
        setIsPlaying(true);
        setCurrentPlayingText(text);
      };
      audio.onended = () => {
        setIsPlaying(false);
        audioElement.current = null;
        setCurrentPlayingText('');
      };
      audio.onerror = (err) => {
        console.error('音频播放失败:', err);
        setIsPlaying(false);
        audioElement.current = null;
        setCurrentPlayingText('');
      };

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.error('音频播放出错:', err);
          setIsPlaying(false);
          audioElement.current = null;
          setCurrentPlayingText('');
          tryWebSpeechAPI(text, language);
        });
      }
    },
    [clearHideTooltipTimer, currentPlayingText, stopAudio, tryWebSpeechAPI],
  );

  useEffect(() => {
    const updateTheme = () => {
      const currentTheme = config.theme || 'auto';
      setIsDarkTheme(
        currentTheme === 'auto'
          ? window.matchMedia('(prefers-color-scheme: dark)').matches
          : currentTheme === 'dark',
      );
    };
    const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = () => {
      if (config.theme === 'auto') updateTheme();
    };
    const mouseDownHandler = () => {
      isSelecting.current = true;
    };
    const mouseUpHandler = () => {
      isSelecting.current = false;
      handleTextSelection();
    };
    let lastSelectionChangeTime = 0;
    const selectionChangeHandler = () => {
      const now = Date.now();
      if (now - lastSelectionChangeTime > 500 && !isSelecting.current) {
        lastSelectionChangeTime = now;
        window.setTimeout(() => {
          if (!isSelecting.current) {
            handleTextSelection();
          }
        }, 100);
      }
    };
    const clickHandler = (event: Event) => {
      const target = event.target as HTMLElement;
      const isOutsideIndicator = !target.closest('.bt-selection-indicator');
      const isOutsideTooltip = !target.closest('.bt-translation-tooltip');
      const isAudioButton = target.closest('.bt-text-audio-btn') || target.closest('.bt-stop-audio-btn');

      if (isAudioButton) return;
      if (isOutsideIndicator && isOutsideTooltip && showIndicatorRef.current) {
        hideIndicator();
        closeTooltip();
      }
    };

    updateTheme();
    darkModeMediaQuery.addEventListener('change', handleSystemThemeChange);
    document.addEventListener('mousedown', mouseDownHandler);
    document.addEventListener('mouseup', mouseUpHandler);
    document.addEventListener('selectionchange', selectionChangeHandler);
    document.addEventListener('click', clickHandler);

    return () => {
      darkModeMediaQuery.removeEventListener('change', handleSystemThemeChange);
      document.removeEventListener('mousedown', mouseDownHandler);
      document.removeEventListener('mouseup', mouseUpHandler);
      document.removeEventListener('selectionchange', selectionChangeHandler);
      document.removeEventListener('click', clickHandler);
      clearHideTooltipTimer();
      if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
      stopAudio();
    };
  }, [clearHideTooltipTimer, closeTooltip, handleTextSelection, hideIndicator, stopAudio]);

  return (
    <>
      <div ref={containerRef} className="bt-selection-translator-wrapper">
        {showIndicator && (
          <div
            className="bt-selection-indicator"
            onMouseEnter={() => {
              clearHideTooltipTimer();
              setShowTooltip(true);
            }}
            onMouseLeave={() => {
              if (!isHoveringTooltip) setHideTooltipTimer();
            }}
          />
        )}

        {showTooltip && (
          <div
            className={`bt-translation-tooltip ${isDarkTheme ? 'bt-dark-theme' : ''}`}
            onMouseEnter={() => {
              setIsHoveringTooltip(true);
              clearHideTooltipTimer();
            }}
            onMouseLeave={() => {
              setIsHoveringTooltip(false);
              if (!isPlaying) setHideTooltipTimer();
            }}
          >
            <div className="bt-tooltip-header">
              <span>
                翻译结果<small>（via bilingual translate）</small>
              </span>
              <div className="bt-tooltip-actions">
                <button className="bt-action-btn" type="button" onClick={copyTranslation} title="复制译文">
                  <CopyIcon />
                </button>
                <button className="bt-close-btn" type="button" onClick={closeTooltip}>
                  ×
                </button>
              </div>
            </div>
            <div className="bt-tooltip-content">
              {isLoading ? (
                <div className={`bt-loading-spinner ${!config.animations ? 'bt-static' : ''}`} />
              ) : error ? (
                <div className="bt-error-message">{error}</div>
              ) : (
                <div className="bt-translation-container">
                  {config.selectionTranslatorMode === 'bilingual' && (
                    <div className="bt-original-text bt-no-select">
                      <pre>{selectedText}</pre>
                      <button className="bt-text-audio-btn" type="button" onClick={(event) => toggleAudio(selectedText, event)} title="播放/停止原文">
                        <SpeakerIcon paused={isPlaying && currentPlayingText === selectedText} />
                      </button>
                    </div>
                  )}
                  {(config.selectionTranslatorMode === 'bilingual' || config.selectionTranslatorMode === 'translation-only') && (
                    <div className="bt-translation-result bt-no-select">
                      <pre>{translationResult}</pre>
                      <button className="bt-text-audio-btn" type="button" onClick={(event) => toggleAudio(translationResult, event)} title="播放/停止译文">
                        <SpeakerIcon paused={isPlaying && currentPlayingText === translationResult} />
                      </button>
                    </div>
                  )}

                  {isPlaying && (
                    <div className="bt-playing-status">
                      <div className="bt-playing-status-icon">
                        <HeadphonesIcon />
                      </div>
                      <span>正在播放: {currentPlayingText === selectedText ? '原文' : '译文'}</span>
                      <button className="bt-stop-audio-btn" type="button" onClick={(event) => stopAudio(event)}>
                        <SpeakerIcon paused />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {copySuccess && (
        <div className={`bt-copy-success-toast ${isDarkTheme ? 'bt-dark-theme' : ''}`}>
          <div className="bt-copy-success-icon">
            <CheckIcon />
          </div>
          <span>复制译文成功!</span>
        </div>
      )}
    </>
  );
}
