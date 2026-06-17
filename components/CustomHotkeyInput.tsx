import type { JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { parseHotkey, validateHotkeyConflicts, type ParsedHotkey } from '@/entrypoints/utils/hotkey';
import './popup-components.css';

interface CustomHotkeyInputProps {
  open: boolean;
  currentValue?: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (hotkey: string) => void;
  onCancel: () => void;
}

const recommendedHotkeys = [
  { value: 'Alt+T', label: 'Alt+T' },
  { value: 'Alt+Q', label: 'Alt+Q' },
  { value: 'Alt+D', label: 'Alt+D' },
  { value: 'F9', label: 'F9' },
  { value: 'F10', label: 'F10' },
];

export default function CustomHotkeyInput({
  open,
  currentValue = '',
  onOpenChange,
  onConfirm,
  onCancel,
}: CustomHotkeyInputProps) {
  const [currentHotkey, setCurrentHotkey] = useState(currentValue);
  const [isRecording, setIsRecording] = useState(false);
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());
  const [errorMessage, setErrorMessage] = useState('');
  const [conflictWarning, setConflictWarning] = useState('');
  const inputFieldRef = useRef<HTMLDivElement | null>(null);

  const parsedHotkey = useMemo<ParsedHotkey | null>(() => {
    if (!currentHotkey || currentHotkey === 'none') return null;
    return parseHotkey(currentHotkey);
  }, [currentHotkey]);

  const canConfirm = currentHotkey === 'none' || Boolean(parsedHotkey?.isValid && !errorMessage);

  useEffect(() => {
    if (open) {
      setCurrentHotkey(currentValue || '');
      setIsRecording(false);
      setPressedKeys(new Set());
      setErrorMessage('');
      setConflictWarning('');
    }
  }, [currentValue, open]);

  useEffect(() => {
    setErrorMessage('');
    setConflictWarning('');

    if (!currentHotkey || currentHotkey === 'none') return;

    const parsed = parseHotkey(currentHotkey);
    if (!parsed.isValid) {
      setErrorMessage(parsed.errorMessage || '无效的快捷键');
      return;
    }

    const conflictCheck = validateHotkeyConflicts(parsed);
    if (conflictCheck.hasConflict) {
      setConflictWarning(conflictCheck.conflictDescription || '可能存在冲突');
    }
  }, [currentHotkey]);

  if (!open) return null;

  async function startRecording() {
    if (isRecording) return;
    setIsRecording(true);
    setPressedKeys(new Set());
    setErrorMessage('');
    setConflictWarning('');
    window.requestAnimationFrame(() => inputFieldRef.current?.focus());
  }

  function handleKeyDown(event: JSX.TargetedKeyboardEvent<HTMLDivElement>) {
    if (!isRecording) return;

    event.preventDefault();
    event.stopPropagation();

    const nextKeys = new Set(pressedKeys);
    if (event.ctrlKey) nextKeys.add('ctrl');
    if (event.altKey) nextKeys.add('alt');
    if (event.shiftKey) nextKeys.add('shift');
    if (event.metaKey) nextKeys.add('meta');

    const key = event.key.toLowerCase();
    const code = event.code?.toLowerCase();
    if (['control', 'alt', 'shift', 'meta'].includes(key)) {
      setPressedKeys(nextKeys);
      return;
    }

    if (key.length === 1) {
      nextKeys.add(key);
    } else if (code?.startsWith('key')) {
      nextKeys.add(code.slice(3));
    } else if (/^f\d+$/.test(key)) {
      nextKeys.add(key);
    } else {
      const specialKeys: Record<string, string> = {
        escape: 'escape',
        enter: 'enter',
        space: 'space',
        tab: 'tab',
        backspace: 'backspace',
        delete: 'delete',
        arrowup: 'arrowup',
        arrowdown: 'arrowdown',
        arrowleft: 'arrowleft',
        arrowright: 'arrowright',
      };
      if (specialKeys[key]) nextKeys.add(specialKeys[key]);
    }

    setPressedKeys(nextKeys);
  }

  function handleKeyUp(event: JSX.TargetedKeyboardEvent<HTMLDivElement>) {
    if (!isRecording) return;

    event.preventDefault();
    event.stopPropagation();
    window.setTimeout(() => {
      setPressedKeys((keys) => {
        if (keys.size === 0) return keys;

        const modifiers: string[] = [];
        let regularKey = '';
        if (keys.has('ctrl')) modifiers.push('Ctrl');
        if (keys.has('alt')) modifiers.push('Alt');
        if (keys.has('shift')) modifiers.push('Shift');
        if (keys.has('meta')) modifiers.push('Meta');
        keys.forEach((key) => {
          if (!['ctrl', 'alt', 'shift', 'meta'].includes(key)) {
            regularKey = key.toUpperCase();
          }
        });
        if (regularKey) setCurrentHotkey([...modifiers, regularKey].join('+'));
        setIsRecording(false);
        return new Set();
      });
    }, 100);
  }

  function handleCancel() {
    setCurrentHotkey(currentValue || '');
    setIsRecording(false);
    setPressedKeys(new Set());
    setErrorMessage('');
    setConflictWarning('');
    onCancel();
    onOpenChange(false);
  }

  function handleConfirm() {
    if (!canConfirm) return;
    onConfirm(currentHotkey);
    onOpenChange(false);
  }

  return (
    <div className="bt-modal-layer" role="dialog" aria-modal="true" aria-labelledby="bt-hotkey-title">
      <div className="bt-modal">
        <div className="bt-modal-header">
          <h2 id="bt-hotkey-title">自定义快捷键</h2>
          <button className="bt-icon-button" type="button" onClick={handleCancel} aria-label="关闭">
            ×
          </button>
        </div>

        <div className="bt-hotkey-input-container">
          <div className="bt-input-section">
            <div className="bt-input-label">请按下您想要设置的快捷键组合：</div>
            <div
              ref={inputFieldRef}
              className={[
                'bt-hotkey-input-field',
                isRecording ? 'recording' : '',
                errorMessage ? 'error' : '',
                parsedHotkey?.isValid && !errorMessage ? 'success' : '',
              ].filter(Boolean).join(' ')}
              onClick={startRecording}
              onKeyDown={handleKeyDown}
              onKeyUp={handleKeyUp}
              tabIndex={0}
            >
              {!isRecording && !currentHotkey && <div className="bt-placeholder">点击这里开始录制快捷键...</div>}
              {isRecording && (
                <div className="bt-recording-text">
                  <span className="bt-loading-dot" />
                  正在录制，请按下快捷键...
                </div>
              )}
              {!isRecording && currentHotkey && (
                <div className="bt-hotkey-display">{parsedHotkey?.displayName || currentHotkey}</div>
              )}
            </div>

            {errorMessage && <div className="bt-error-message">! {errorMessage}</div>}
            {conflictWarning && <div className="bt-warning-message">! {conflictWarning}</div>}
            {parsedHotkey?.isValid && !errorMessage && !conflictWarning && (
              <div className="bt-success-message">✓ 快捷键有效，可以使用</div>
            )}
          </div>

          <div className="bt-preset-section">
            <div className="bt-section-title">或选择推荐的快捷键：</div>
            <div className="bt-preset-buttons">
              {recommendedHotkeys.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  className={`bt-button bt-button-small ${currentHotkey === preset.value ? 'primary' : ''}`}
                  onClick={() => {
                    setCurrentHotkey(preset.value);
                    setIsRecording(false);
                    setPressedKeys(new Set());
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bt-help-section">
            提示：建议使用修饰键组合（如 Ctrl+字母），避免与系统快捷键冲突。注意：不能使用 CMD 充当快捷键。
          </div>
        </div>

        <div className="bt-dialog-footer">
          <button className="bt-button" type="button" onClick={handleCancel}>取消</button>
          {currentHotkey && (
            <button
              className="bt-button"
              type="button"
              onClick={() => {
                setCurrentHotkey('');
                setIsRecording(false);
                setPressedKeys(new Set());
                setErrorMessage('');
                setConflictWarning('');
              }}
            >
              清除
            </button>
          )}
          <button className="bt-button primary" type="button" onClick={handleConfirm} disabled={!canConfirm}>
            确认
          </button>
        </div>
      </div>
    </div>
  );
}
