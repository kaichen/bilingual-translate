import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { storage } from '@wxt-dev/storage';
import browser from 'webextension-polyfill';
import { defaultOption, options, services } from '../entrypoints/config/option';
import { chromeEngineOf, models, providerOf, type Need } from '@/entrypoints/providers/registry';
import { Config } from '@/entrypoints/config/model';
import { parseHotkey } from './hotkey';
import { type BackgroundMessage, type ContentMessage, type ContextMenuTranslateResponse, type TranslationProgressResponse, type PageDomainResponse, type PageTranslatedResponse } from '@/entrypoints/utils/messages';
import CustomHotkeyInput from './CustomHotkeyInput';
import ChromeAISettings from './ChromeAISettings';
import './Main.css';

type ToastType = 'success' | 'warning' | 'error';

// 消息与响应类型集中在 utils/messages.ts
type SelectOption = {
  value: string | number | boolean;
  label: string;
  disabled?: boolean;
  group?: string;
};

function cloneConfig(source: Config): Config {
  return new Config(JSON.parse(JSON.stringify(source)));
}

function validateConfig(configData: unknown): configData is Partial<Config> {
  if (typeof configData !== 'object' || configData === null) return false;
  const requiredFields = ['on', 'service', 'display', 'from', 'to'];
  return requiredFields.every((field) => field in configData);
}

function SelectControl({
  value,
  onChange,
  options: selectOptions,
  placeholder,
  disabled = false,
}: {
  value: string | number | boolean;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <select className="bt-select" value={String(value)} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value)} aria-label={placeholder}>
      {placeholder && <option value="">{placeholder}</option>}
      {selectOptions.map((option) => (
        <option key={`${option.value}-${option.label}`} value={String(option.value)} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function TextInput({
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'password' | 'url';
  placeholder?: string;
}) {
  return (
    <input
      className="bt-input"
      value={value}
      type={type}
      placeholder={placeholder}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}

function TextArea({
  value,
  onChange,
  placeholder,
  readOnly = false,
  rows = 4,
}: {
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  rows?: number;
}) {
  return (
    <textarea
      className="bt-textarea"
      value={value}
      rows={rows}
      readOnly={readOnly}
      placeholder={placeholder}
      onChange={(event) => onChange?.(event.currentTarget.value)}
    />
  );
}

function SwitchControl({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      className={`bt-switch ${checked ? 'checked' : ''}`}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
    >
      <span className="bt-switch-thumb" />
      <span className="bt-switch-label">{checked ? '开' : '关'}</span>
    </button>
  );
}

function SettingRow({
  label,
  hint,
  wide = false,
  children,
}: {
  label: string;
  hint?: string;
  wide?: boolean;
  children: ComponentChildren;
}) {
  return (
    <div className={`bt-setting-row ${wide ? 'wide' : ''}`}>
      <div className="bt-setting-label">
        <span>{label}</span>
        {hint && <span className="bt-help-icon" tabIndex={0} aria-label={hint} data-hint={hint}>?</span>}
      </div>
      <div className="bt-setting-control">{children}</div>
    </div>
  );
}

export default function Main() {
  const [config, setConfig] = useState(() => new Config());
  const [ready, setReady] = useState(false);
  const [pageStatus, setPageStatus] = useState<'untranslated' | 'translating' | 'translated'>('untranslated');
  const [currentDomain, setCurrentDomain] = useState('');
  const [translateBtnError, setTranslateBtnError] = useState('');
  const busyRef = useRef(false);          // 防止消息往返期间重入
  const pollAbortRef = useRef(false);     // popup 关闭/视频切换时停轮询
  const btnErrorTimerRef = useRef<number | null>(null);
  const [toast, setToast] = useState<{ type: ToastType; message: string } | null>(null);
  const [showCustomMouseHotkeyDialog, setShowCustomMouseHotkeyDialog] = useState(false);
  const [showExportBox, setShowExportBox] = useState(false);
  const [exportData, setExportData] = useState('');
  const [showImportBox, setShowImportBox] = useState(false);
  const [importData, setImportData] = useState('');
  const suppressPersistRef = useRef(false);
  const toastTimerRef = useRef<number | null>(null);

  const notify = (type: ToastType, message: string) => {
    setToast({ type, message });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2200);
  };

  useEffect(() => {
    const applyStoredConfig = (value: unknown) => {
      const nextConfig = new Config(typeof value === 'string' && value ? JSON.parse(value) : {});
      nextConfig.on = true;
      suppressPersistRef.current = true;
      setConfig(nextConfig);
      setReady(true);
      updateTheme(nextConfig.theme || 'auto');
    };

    void storage.getItem('local:config').then(applyStoredConfig);
    const unwatch = storage.watch('local:config', (newValue) => applyStoredConfig(newValue));
    return () => {
      unwatch();
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (suppressPersistRef.current) {
      suppressPersistRef.current = false;
      return;
    }
    void storage.setItem('local:config', JSON.stringify(config));
  }, [config, ready]);

  useEffect(() => {
    updateTheme(config.theme || 'auto');
  }, [config.theme]);

  useEffect(() => {
    if (!ready) return;

    void browser.tabs.query({ active: true, currentWindow: true }).then(async (tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId) return;
      // 按钮状态以 content 实际翻译态为准（常开自动翻译时 background 状态会在每次加载被复位，故不可靠）
      const stateResp = (await browser.tabs.sendMessage(tabId, { type: 'getPageTranslated' } satisfies ContentMessage).catch(() => undefined)) as PageTranslatedResponse | undefined;
      setPageStatus(stateResp?.translated ? 'translated' : 'untranslated');

      // 当前页站点 key（向 content 询问，避免依赖 tabs 权限读取 tab.url）
      const domainResp = (await browser.tabs.sendMessage(tabId, { type: 'getPageDomain' } satisfies ContentMessage).catch(() => undefined)) as PageDomainResponse | undefined;
      setCurrentDomain(domainResp?.domain || '');
    }).catch(() => undefined);
  }, [ready]);

  // popup 卸载时停止进度轮询
  useEffect(() => () => { pollAbortRef.current = true; }, []);

  useEffect(() => {
    const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = () => {
      if (config.theme === 'auto') updateTheme('auto');
    };
    darkModeMediaQuery.addEventListener('change', handleSystemThemeChange);
    return () => darkModeMediaQuery.removeEventListener('change', handleSystemThemeChange);
  }, [config.theme]);

  function updateTheme(theme: string) {
    const isDark = theme === 'auto' ? window.matchMedia('(prefers-color-scheme: dark)').matches : theme === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
  }

  function updateConfig(updater: (draft: Config) => void) {
    setConfig((current) => {
      const draft = cloneConfig(current);
      updater(draft);
      return draft;
    });
  }

  function setField<K extends keyof Config>(key: K, value: Config[K]) {
    updateConfig((draft) => {
      draft[key] = value;
    });
  }

  function setMapField(mapName: 'token' | 'model' | 'customModel' | 'proxy' | 'system_role' | 'user_role', service: string, value: string) {
    updateConfig((draft) => {
      draft[mapName] = { ...draft[mapName], [service]: value };
    });
  }

  function showBtnError(message: string) {
    setTranslateBtnError(message);
    if (btnErrorTimerRef.current) window.clearTimeout(btnErrorTimerRef.current);
    btnErrorTimerRef.current = window.setTimeout(() => setTranslateBtnError(''), 2200);
  }

  // 轮询 content 队列活动量：见到活动后连续两次归零（或封顶超时）即判「已翻译」
  async function pollUntilTranslated(tabId: number) {
    pollAbortRef.current = false;
    const POLL_MS = 400, GRACE_MS = 600, MAX_MS = 30000;
    const start = Date.now();
    let seenActivity = false;
    let idleHits = 0;
    while (!pollAbortRef.current) {
      await new Promise((r) => window.setTimeout(r, POLL_MS));
      if (pollAbortRef.current) return;
      if (Date.now() - start > MAX_MS) break;
      let progress: TranslationProgressResponse | undefined;
      try {
        progress = (await browser.tabs.sendMessage(tabId, { type: 'getTranslationProgress' } satisfies ContentMessage)) as TranslationProgressResponse;
      } catch {
        break; // 页面不可达（已关闭/跳转）→ 视为结束
      }
      const busy = ((progress?.active ?? 0) + (progress?.pending ?? 0)) > 0;
      if (busy) { seenActivity = true; idleHits = 0; continue; }
      if (Date.now() - start < GRACE_MS && !seenActivity) continue; // 宽限：扫描尚未入队
      if (++idleHits >= 2) break; // 连续两次空 → 首屏批次译完
    }
    if (!pollAbortRef.current) setPageStatus('translated');
  }

  // 开启整页翻译（按钮"翻译"方向 / 常开开关打开时复用）。已翻译或翻译中则不重复触发。
  async function startFullPageTranslation() {
    if (busyRef.current || pageStatus === 'translating' || pageStatus === 'translated') return;
    busyRef.current = true;
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      const tabId = tabs[0]?.id;
      if (!tabId) throw new Error('无法获取当前标签页');

      const response = (await browser.tabs.sendMessage(tabId, {
        type: 'contextMenuTranslate', action: 'fullPage',
      } satisfies ContentMessage)) as ContextMenuTranslateResponse;
      if (response?.status !== 'success') throw new Error(`内容脚本未返回成功状态: ${JSON.stringify(response)}`);

      void browser.runtime.sendMessage({ type: 'setTranslationState', tabId, isTranslated: true } satisfies BackgroundMessage).catch(() => undefined);
      setPageStatus('translating');   // 进入「翻译中」并轮询真实进度
      void pollUntilTranslated(tabId);
    } catch (error) {
      console.error('触发当前网页翻译失败:', error);
      showBtnError('翻译失败，请刷新重试');
    } finally {
      busyRef.current = false;
    }
  }

  // 移除当前页翻译（按钮"还原"方向）
  async function restoreCurrentPage() {
    if (busyRef.current || pageStatus === 'translating') return;
    busyRef.current = true;
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      const tabId = tabs[0]?.id;
      if (!tabId) throw new Error('无法获取当前标签页');

      const response = (await browser.tabs.sendMessage(tabId, {
        type: 'contextMenuTranslate', action: 'restore',
      } satisfies ContentMessage)) as ContextMenuTranslateResponse;
      if (response?.status !== 'success') throw new Error(`内容脚本未返回成功状态: ${JSON.stringify(response)}`);

      void browser.runtime.sendMessage({ type: 'setTranslationState', tabId, isTranslated: false } satisfies BackgroundMessage).catch(() => undefined);
      pollAbortRef.current = true;     // 还原即停止任何进行中的轮询
      setPageStatus('untranslated');
    } catch (error) {
      console.error('移除翻译失败:', error);
      showBtnError('移除失败，请刷新重试');
    } finally {
      busyRef.current = false;
    }
  }

  function translateCurrentPage() {
    if (pageStatus === 'translated') void restoreCurrentPage();
    else void startFullPageTranslation();
  }

  // 切换「始终翻译此网站」：增删站点 key；打开时立即翻译当前页
  function toggleAlwaysTranslateSite(enabled: boolean) {
    const list = config.autoTranslateDomains || [];
    setField('autoTranslateDomains',
      enabled ? Array.from(new Set([...list, currentDomain])) : list.filter((d) => d !== currentDomain));
    if (enabled) void startFullPageTranslation();
  }

  function handleMouseHotkeyChange(value: string) {
    setField('hotkey', value);
    if (value === 'custom' && !config.customHotkey) {
      window.setTimeout(() => setShowCustomMouseHotkeyDialog(true), 100);
    }
  }

  function getCustomMouseHotkeyDisplayName() {
    if (!config.customHotkey) return '';
    if (config.customHotkey === 'none') return '已禁用';
    const parsed = parseHotkey(config.customHotkey);
    return parsed.isValid ? parsed.displayName : config.customHotkey;
  }

  function handleConcurrentChange(value: string) {
    const nextValue = Number(value);
    if (!Number.isFinite(nextValue) || nextValue < 1 || nextValue > 100) {
      setField('maxConcurrentTranslations', 6);
      notify('warning', '并发数量必须在 1-100 之间');
      return;
    }
    setField('maxConcurrentTranslations', nextValue);
    notify('success', `并发数量已更新为 ${nextValue}`);
  }

  async function handleExport() {
    const configStr = await storage.getItem('local:config');
    if (!configStr) {
      notify('warning', '没有找到配置信息');
      return;
    }

    const configToExport = JSON.parse(configStr as string);
    const cleanedConfig = JSON.parse(JSON.stringify(configToExport));

    if (cleanedConfig.system_role) {
      for (const service in cleanedConfig.system_role) {
        if (cleanedConfig.system_role[service] === defaultOption.system_role) {
          delete cleanedConfig.system_role[service];
        }
      }
      if (Object.keys(cleanedConfig.system_role).length === 0) delete cleanedConfig.system_role;
    }

    if (cleanedConfig.user_role) {
      for (const service in cleanedConfig.user_role) {
        if (cleanedConfig.user_role[service] === defaultOption.user_role) {
          delete cleanedConfig.user_role[service];
        }
      }
      if (Object.keys(cleanedConfig.user_role).length === 0) delete cleanedConfig.user_role;
    }

    setExportData(JSON.stringify(cleanedConfig, null, 2));
    setShowExportBox((visible) => !visible);
    setShowImportBox(false);
  }

  async function saveImport() {
    try {
      const parsedConfig = JSON.parse(importData);
      if (!validateConfig(parsedConfig)) {
        notify('error', '配置无效或格式不正确, 请检查!');
        return;
      }
      const nextConfig = new Config(parsedConfig);
      nextConfig.on = true;
      suppressPersistRef.current = true;
      setConfig(nextConfig);
      await storage.setItem('local:config', JSON.stringify(nextConfig));
      notify('success', '配置导入成功!');
      setShowImportBox(false);
      setImportData('');
    } catch {
      notify('error', '配置格式错误, 请检查!');
    }
  }

  function resetTemplate() {
    if (!window.confirm('确定要恢复默认的 system 和 user 模板吗？此操作将覆盖当前的自定义模板。')) return;
    updateConfig((draft) => {
      draft.system_role = { ...draft.system_role, [draft.service]: defaultOption.system_role };
      draft.user_role = { ...draft.user_role, [draft.service]: defaultOption.user_role };
    });
    notify('success', '已成功恢复默认翻译模板');
  }

  const computed = useMemo(() => {
    const p = providerOf(config.service);
    const need = (n: Need) => !!p?.needs.includes(n);
    const isAI = p?.kind === 'ai';
    return {
      showAI: isAI,
      showNativeAI: need('nativeAI'),
      showProxy: need('proxy'),
      showModel: need('model'),
      showToken: need('token'),
      model: models.get(config.service) || [],
      showCustom: config.service === services.custom,
      showCustomModel: isAI && config.model[config.service] === '自定义模型',
      filteredServices: options.services.filter((serviceOption) => !(serviceOption.value === services.google && config.display !== 1)),
    };
  }, [config]);

  return (
    <div className="bt-main-panel">
      {toast && <div className={`bt-toast ${toast.type}`}>{toast.message}</div>}

      <div className="bt-setting-row wide">
        <button
          className={`bt-button bt-full-width is-${pageStatus}`}
          type="button"
          onClick={translateCurrentPage}
          aria-busy={pageStatus === 'translating'}
        >
          {translateBtnError
            ? translateBtnError
            : pageStatus === 'translating'
              ? '翻译中…'
              : pageStatus === 'translated'
                ? '移除翻译'
                : '翻译当前网页'}
        </button>
      </div>

          {currentDomain && (
            <div className="bt-always-block">
              <SettingRow label="始终翻译此网站" hint="开启后访问此网站将自动翻译整页，并立即翻译当前页">
                <SwitchControl
                  checked={(config.autoTranslateDomains || []).includes(currentDomain)}
                  onChange={toggleAlwaysTranslateSite}
                />
              </SettingRow>
              <div className="bt-always-domain" title={currentDomain}>{currentDomain}</div>
            </div>
          )}

          <SettingRow label="翻译模式" hint="即时切换：页面已翻译时立即按新模式重排（翻译进行中禁用切换）">
            <SelectControl value={config.display} options={options.display} disabled={pageStatus === 'translating'} onChange={(value) => setField('display', Number(value))} />
          </SettingRow>

          {config.display === 1 && (
            <SettingRow label="译文样式" hint="选择双语模式下译文的显示样式，提供多种美观的效果">
              <select className="bt-select" value={String(config.style)} onChange={(event) => setField('style', Number(event.currentTarget.value))}>
                {options.styles.map((item) => (
                  <option key={String(item.value)} value={String(item.value)}>{item.label}</option>
                ))}
              </select>
            </SettingRow>
          )}

          <SettingRow label="翻译服务" hint="机器翻译：快速稳定；云端 AI 需要令牌；带「离线」的 Chrome 服务在本机运行，与在线的谷歌翻译无关">
            <SelectControl value={config.service} options={computed.filteredServices} onChange={(value) => setField('service', value)} />
          </SettingRow>

          <SettingRow label="目标语言">
            <SelectControl value={config.to} options={options.to} onChange={(value) => setField('to', value)} />
          </SettingRow>

          {computed.showNativeAI && <ChromeAISettings
            key={`${config.service}:${config.from}:${config.to}`}
            settings={{ engine: chromeEngineOf(config.service), from: config.from, to: config.to }}
            onSource={value => setField('from', value)}
          />}

          <SettingRow label="鼠标悬浮快捷键" hint="按住指定快捷键并悬停在文本上进行翻译">
            <div className="bt-hotkey-config">
              <SelectControl value={config.hotkey} options={options.keys} onChange={handleMouseHotkeyChange} />
              {config.hotkey === 'custom' && (
                <div className="bt-custom-hotkey-display">
                  <span className={`bt-hotkey-text ${config.customHotkey ? '' : 'placeholder-text'}`}>
                    {config.customHotkey ? getCustomMouseHotkeyDisplayName() : '点击设置自定义快捷键'}
                  </span>
                  <button className="bt-button text bt-compact-button" type="button" onClick={() => setShowCustomMouseHotkeyDialog(true)}>编辑</button>
                </div>
              )}
            </div>
          </SettingRow>

          {computed.showToken && (
            <SettingRow label="访问令牌" hint="API访问令牌仅保存在本地，用于访问翻译服务">
              <TextInput value={config.token[config.service] || ''} type="password" placeholder="请输入API访问令牌" onChange={(value) => setMapField('token', config.service, value)} />
            </SettingRow>
          )}

          {computed.showCustom && (
            <SettingRow label="自定义接口" hint="目前仅支持OpenAI格式的请求接口">
              <TextInput value={config.custom} placeholder="请输入自定义接口地址" onChange={(value) => setField('custom', value)} />
            </SettingRow>
          )}

          {computed.showModel && (
            <SettingRow label="模型">
              <SelectControl
                value={config.model[config.service] || ''}
                options={computed.model.map((modelName) => ({ value: modelName, label: modelName }))}
                placeholder="请选择模型"
                onChange={(value) => setMapField('model', config.service, value)}
              />
            </SettingRow>
          )}

          {computed.showCustomModel && (
            <SettingRow label="自定义模型" hint="自定义模型名称需要与服务商提供的模型名称一致">
              <TextInput value={config.customModel[config.service] || ''} placeholder="例如：gemma:7b" onChange={(value) => setMapField('customModel', config.service, value)} />
            </SettingRow>
          )}

          <details className="bt-advanced-panel">
            <summary>更多选项</summary>

            <SettingRow label="主题设置">
              <SelectControl value={config.theme} options={options.theme} onChange={(value) => setField('theme', value)} />
            </SettingRow>

            <SettingRow label="缓存翻译结果" hint="开启缓存可以提高翻译速度，减少重复请求">
              <SwitchControl checked={config.useCache} onChange={(value) => setField('useCache', value)} />
            </SettingRow>

            <SettingRow label="动画效果" hint="禁用后将关闭加载/悬浮等动画">
              <SwitchControl checked={config.animations} onChange={(value) => setField('animations', value)} />
            </SettingRow>

            <SettingRow label="视频字幕翻译" hint="在 YouTube 或 Substack 播放器打开字幕时，于视频上叠加双语字幕">
              <SwitchControl checked={config.youtubeSubtitle} onChange={(value) => setField('youtubeSubtitle', value)} />
            </SettingRow>

            {config.youtubeSubtitle && (
              <SettingRow label="字幕配音朗读" hint="播放时用系统语音朗读字幕，并静音视频原声（仅 YouTube，需打开 CC 字幕）">
                <SwitchControl checked={config.youtubeDubbing} onChange={(value) => setField('youtubeDubbing', value)} />
              </SettingRow>
            )}

            {config.youtubeSubtitle && config.youtubeDubbing && (
              <SettingRow label="朗读内容">
                <SelectControl value={config.youtubeDubbingSource} options={options.youtubeDubbingSource} onChange={(value) => setField('youtubeDubbingSource', value)} />
              </SettingRow>
            )}

            <SettingRow label="输入框翻译" hint="在任何文本输入框中使用指定方式触发翻译当前输入的内容">
              <SelectControl value={config.inputBoxTranslationTrigger} options={options.inputBoxTranslationTrigger} onChange={(value) => setField('inputBoxTranslationTrigger', value)} />
            </SettingRow>

            {config.inputBoxTranslationTrigger !== 'disabled' && (
              <SettingRow label="翻译目标语言">
                <SelectControl value={config.inputBoxTranslationTarget} options={options.inputBoxTranslationTarget} onChange={(value) => setField('inputBoxTranslationTarget', value)} />
              </SettingRow>
            )}

            <SettingRow label="翻译并发数" hint="控制同时进行的最大翻译任务数">
              <input
                className="bt-input"
                type="number"
                min={1}
                max={100}
                step={1}
                value={config.maxConcurrentTranslations}
                onChange={(event) => handleConcurrentChange(event.currentTarget.value)}
              />
            </SettingRow>

            {computed.showProxy && (
              <SettingRow label="代理地址" hint="使用代理可以解决网络无法访问的问题，如不熟悉代理设置请留空">
                <TextInput value={config.proxy[config.service] || ''} placeholder="默认不使用代理" onChange={(value) => setMapField('proxy', config.service, value)} />
              </SettingRow>
            )}

            {computed.showAI && (
              <>
                <SettingRow label="system" hint="以系统身份 system 发送的对话，常用于指定 AI 要扮演的角色" wide>
                  <TextArea value={config.system_role[config.service] || ''} placeholder="system message" onChange={(value) => setMapField('system_role', config.service, value)} />
                </SettingRow>
                <SettingRow label="user" hint="以用户身份 user 发送的对话，其中 {{to}} 和 {{origin}} 不可缺少" wide>
                  <TextArea value={config.user_role[config.service] || ''} placeholder="user message template" onChange={(value) => setMapField('user_role', config.service, value)} />
                </SettingRow>
                <div className="bt-row-actions">
                  <button className="bt-button text" type="button" onClick={resetTemplate}>恢复默认模板</button>
                </div>
              </>
            )}

            <div className="bt-divider">配置管理</div>
            <div className="bt-config-actions">
              <button className="bt-button primary" type="button" onClick={() => void handleExport()}>导出配置</button>
              <button
                className="bt-button success"
                type="button"
                onClick={() => {
                  setShowImportBox((visible) => !visible);
                  setShowExportBox(false);
                }}
              >
                导入配置
              </button>
            </div>

            {showExportBox && <TextArea value={exportData} readOnly rows={8} />}
            {showImportBox && (
              <div className="bt-import-box">
                <TextArea value={importData} rows={8} placeholder="请在此处粘贴您的JSON配置" onChange={setImportData} />
                <div className="bt-row-actions">
                  <button className="bt-button primary" type="button" onClick={() => void saveImport()}>保存</button>
                </div>
              </div>
            )}
          </details>

      <CustomHotkeyInput
        open={showCustomMouseHotkeyDialog}
        currentValue={config.customHotkey}
        onOpenChange={setShowCustomMouseHotkeyDialog}
        onConfirm={(hotkey) => {
          updateConfig((draft) => {
            draft.customHotkey = hotkey;
            draft.hotkey = 'custom';
          });
          notify('success', hotkey === 'none' ? '已禁用快捷键' : `快捷键已设置为: ${parseHotkey(hotkey).displayName || hotkey}`);
        }}
        onCancel={() => {
          if (!config.customHotkey) setField('hotkey', 'Control');
        }}
      />
    </div>
  );
}
