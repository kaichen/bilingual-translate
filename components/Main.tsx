import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { storage } from '@wxt-dev/storage';
import browser from 'webextension-polyfill';
import { defaultOption, models, options, services, servicesType } from '../entrypoints/utils/option';
import { Config } from '@/entrypoints/utils/model';
import { parseHotkey } from '@/entrypoints/utils/hotkey';
import CustomHotkeyInput from './CustomHotkeyInput';
import './Main.css';

type ToastType = 'success' | 'warning' | 'error';

type TranslatePageResponse = {
  status?: string;
  action?: string;
};

type TranslationStateResponse = {
  isTranslated?: boolean;
};

type SelectOption = {
  value: string | number | boolean;
  label: string;
  disabled?: boolean;
  group?: string;
};

function cloneConfig(source: Config): Config {
  return Object.assign(new Config(), JSON.parse(JSON.stringify(source)));
}

function validateConfig(configData: unknown): configData is Partial<Config> {
  if (typeof configData !== 'object' || configData === null) return false;
  const requiredFields = ['on', 'service', 'display', 'from', 'to'];
  return requiredFields.every((field) => field in configData);
}

function isValidAzureEndpoint(endpoint: string) {
  if (!endpoint || endpoint.trim() === '') return false;
  return endpoint.startsWith('https://') && endpoint.includes('openai.azure.com') && endpoint.includes('/chat/completions');
}

function SelectControl({
  value,
  onChange,
  options: selectOptions,
  placeholder,
}: {
  value: string | number | boolean;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
}) {
  return (
    <select className="bt-select" value={String(value)} onChange={(event) => onChange(event.target.value)} aria-label={placeholder}>
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
  invalid = false,
}: {
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'password' | 'url';
  placeholder?: string;
  invalid?: boolean;
}) {
  return (
    <input
      className={`bt-input ${invalid ? 'input-error' : ''}`}
      value={value}
      type={type}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
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
      onChange={(event) => onChange?.(event.target.value)}
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
  children: ReactNode;
}) {
  return (
    <div className={`bt-setting-row ${wide ? 'wide' : ''}`}>
      <div className="bt-setting-label" title={hint}>
        <span>{label}</span>
        {hint && <span className="bt-help-icon">?</span>}
      </div>
      <div className="bt-setting-control">{children}</div>
    </div>
  );
}

export default function Main() {
  const [config, setConfig] = useState(() => new Config());
  const [ready, setReady] = useState(false);
  const [translatePageLoading, setTranslatePageLoading] = useState(false);
  const [translatePageActive, setTranslatePageActive] = useState(false);
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
      const nextConfig = new Config();
      if (typeof value === 'string' && value) {
        Object.assign(nextConfig, JSON.parse(value));
      }
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
      const response = (await browser.runtime.sendMessage({
        type: 'getTranslationState',
        tabId,
      })) as TranslationStateResponse;
      setTranslatePageActive(Boolean(response?.isTranslated));
    }).catch(() => undefined);
  }, [ready]);

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

  function setMapField(mapName: 'token' | 'model' | 'customModel' | 'proxy' | 'robot_id' | 'system_role' | 'user_role', service: string, value: string) {
    updateConfig((draft) => {
      draft[mapName] = { ...draft[mapName], [service]: value };
    });
  }

  async function translateCurrentPage() {
    if (translatePageLoading) return;

    setTranslatePageLoading(true);
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      const tabId = tabs[0]?.id;
      if (!tabId) throw new Error('无法获取当前标签页');

      const response = (await browser.tabs.sendMessage(tabId, {
        type: 'contextMenuTranslate',
        action: translatePageActive ? 'restore' : 'fullPage',
      })) as TranslatePageResponse;

      if (response?.status !== 'success') throw new Error('内容脚本未返回成功状态');

      const nextActive = response.action === 'translated';
      setTranslatePageActive(nextActive);
      void browser.runtime.sendMessage({
        type: 'setTranslationState',
        tabId,
        isTranslated: nextActive,
      }).catch(() => undefined);
      notify('success', nextActive ? '已开始翻译当前网页' : '已移除当前网页翻译');
    } catch (error) {
      console.error('触发当前网页翻译失败:', error);
      notify('error', translatePageActive ? '无法移除翻译，请刷新页面后重试' : '无法翻译当前网页，请刷新页面后重试');
    } finally {
      setTranslatePageLoading(false);
    }
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
      const nextConfig = Object.assign(new Config(), parsedConfig);
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

  const computed = useMemo(() => ({
    showAI: servicesType.isAI(config.service),
    showProxy: servicesType.isUseProxy(config.service),
    showModel: servicesType.isUseModel(config.service),
    showToken: servicesType.isUseToken(config.service),
    showAkSk: servicesType.isUseAkSk(config.service),
    showYoudao: servicesType.isYoudao(config.service),
    showTencent: servicesType.isTencent(config.service),
    model: models.get(config.service) || [],
    showCustom: servicesType.isCustom(config.service),
    showDeepLX: config.service === 'deeplx',
    showCustomModel: servicesType.isAI(config.service) && config.model[config.service] === '自定义模型',
    filteredServices: options.services.filter((serviceOption) => !(serviceOption.value === services.google && config.display !== 1)),
    showRobotId: servicesType.isCoze(config.service),
    showNewAPI: servicesType.isNewApi(config.service),
    showAzureOpenaiEndpoint: servicesType.isAzureOpenai(config.service),
  }), [config]);

  const styleGroups = useMemo(() => {
    const groups = options.styles.filter((item) => item.disabled);
    return groups.map((group) => ({
      ...group,
      options: options.styles.filter((item) => !item.disabled && item.group === group.value),
    }));
  }, []);

  return (
    <div className="bt-main-panel">
      {toast && <div className={`bt-toast ${toast.type}`}>{toast.message}</div>}

      <div className="bt-setting-row wide">
        <button
          className={`bt-button ${translatePageActive ? 'success' : 'primary'} bt-full-width`}
          type="button"
          onClick={translateCurrentPage}
          disabled={translatePageLoading}
        >
          {translatePageLoading && <span className="bt-loading-dot" />}
          {translatePageActive ? '移除翻译' : '翻译当前网页'}
        </button>
      </div>

          <SettingRow label="翻译模式">
            <SelectControl value={config.display} options={options.display} onChange={(value) => setField('display', Number(value))} />
          </SettingRow>

          {config.display === 1 && (
            <SettingRow label="译文样式" hint="选择双语模式下译文的显示样式，提供多种美观的效果">
              <select className="bt-select" value={String(config.style)} onChange={(event) => setField('style', Number(event.target.value))}>
                {styleGroups.map((group) => (
                  <optgroup key={String(group.value)} label={group.label}>
                    {group.options.map((item) => (
                      <option key={String(item.value)} value={String(item.value)}>{item.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </SettingRow>
          )}

          <SettingRow label="翻译服务" hint="机器翻译：快速稳定；AI翻译：更自然流畅，需要配置令牌">
            <SelectControl value={config.service} options={computed.filteredServices} onChange={(value) => setField('service', value)} />
          </SettingRow>

          <SettingRow label="目标语言">
            <SelectControl value={config.to} options={options.to} onChange={(value) => setField('to', value)} />
          </SettingRow>

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

          {computed.showAzureOpenaiEndpoint && (
            <SettingRow label="Azure 端点" hint="Azure OpenAI 服务端点地址，必须包含完整的部署信息">
              <TextInput
                value={config.azureOpenaiEndpoint}
                placeholder="https://your-resource.openai.azure.com/openai/deployments/your-model/chat/completions?api-version=2024-02-15-preview"
                invalid={Boolean(config.azureOpenaiEndpoint && !isValidAzureEndpoint(config.azureOpenaiEndpoint))}
                onChange={(value) => setField('azureOpenaiEndpoint', value)}
              />
              {config.azureOpenaiEndpoint && !isValidAzureEndpoint(config.azureOpenaiEndpoint) && (
                <div className="error-text">端点地址格式不正确，请确保包含 openai.azure.com 域名和 /chat/completions 路径</div>
              )}
            </SettingRow>
          )}

          {computed.showDeepLX && (
            <SettingRow label="服务地址" hint="DeepLX API 服务地址，默认为本地地址">
              <TextInput value={config.deeplx} placeholder="http://localhost:1188/translate" onChange={(value) => setField('deeplx', value)} />
            </SettingRow>
          )}

          {computed.showAkSk && (
            <>
              <SettingRow label="API Key" hint="百度文心一言API密钥对">
                <TextInput value={config.ak} placeholder="请输入Access Key" onChange={(value) => setField('ak', value)} />
              </SettingRow>
              <SettingRow label="Secret Key" hint="百度文心一言API密钥对">
                <TextInput value={config.sk} type="password" placeholder="请输入Secret Key" onChange={(value) => setField('sk', value)} />
              </SettingRow>
            </>
          )}

          {computed.showYoudao && (
            <>
              <SettingRow label="App Key" hint="有道智云翻译API应用ID">
                <TextInput value={config.youdaoAppKey} placeholder="有道 AppKey" onChange={(value) => setField('youdaoAppKey', value)} />
              </SettingRow>
              <SettingRow label="App Secret" hint="有道智云翻译API应用密钥">
                <TextInput value={config.youdaoAppSecret} type="password" placeholder="有道 AppSecret" onChange={(value) => setField('youdaoAppSecret', value)} />
              </SettingRow>
            </>
          )}

          {computed.showTencent && (
            <>
              <SettingRow label="Secret ID" hint="腾讯云API访问密钥ID">
                <TextInput value={config.tencentSecretId} placeholder="腾讯云 SecretId" onChange={(value) => setField('tencentSecretId', value)} />
              </SettingRow>
              <SettingRow label="Secret Key" hint="腾讯云API访问密钥">
                <TextInput value={config.tencentSecretKey} type="password" placeholder="腾讯云 SecretKey" onChange={(value) => setField('tencentSecretKey', value)} />
              </SettingRow>
            </>
          )}

          {computed.showRobotId && (
            <SettingRow label="机器人ID" hint="Coze机器人ID">
              <TextInput value={config.robot_id[config.service] || ''} placeholder="请输入Coze机器人ID" onChange={(value) => setMapField('robot_id', config.service, value)} />
            </SettingRow>
          )}

          {computed.showCustom && (
            <SettingRow label="自定义接口" hint="目前仅支持OpenAI格式的请求接口">
              <TextInput value={config.custom} placeholder="请输入自定义接口地址" onChange={(value) => setField('custom', value)} />
            </SettingRow>
          )}

          {computed.showNewAPI && (
            <SettingRow label="NewAPI接口" hint="填写 New API 的访问地址，如：http://localhost:3000">
              <TextInput value={config.newApiUrl} placeholder="请输入您的New API接口地址" onChange={(value) => setField('newApiUrl', value)} />
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
            <SettingRow label={config.service === 'doubao' ? '接入点' : '自定义模型'} hint="自定义模型名称需要与服务商提供的模型名称一致">
              <TextInput value={config.customModel[config.service] || ''} placeholder="例如：gemma:7b" onChange={(value) => setMapField('customModel', config.service, value)} />
            </SettingRow>
          )}

          <details className="bt-advanced-panel">
            <summary>高级选项</summary>

            <SettingRow label="主题设置">
              <SelectControl value={config.theme} options={options.theme} onChange={(value) => setField('theme', value)} />
            </SettingRow>

            <SettingRow label="缓存翻译结果" hint="开启缓存可以提高翻译速度，减少重复请求">
              <SwitchControl checked={config.useCache} onChange={(value) => setField('useCache', value)} />
            </SettingRow>

            <SettingRow label="动画效果" hint="禁用后将关闭加载/悬浮等动画">
              <SwitchControl checked={config.animations} onChange={(value) => setField('animations', value)} />
            </SettingRow>

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
                onChange={(event) => handleConcurrentChange(event.target.value)}
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
