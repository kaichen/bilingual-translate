# bilingual translate

<img src="public/icon/128.png" alt="bilingual translate" width="96" />

网页翻译浏览器插件，双语对照呈现。

支持微软翻译、谷歌翻译、Chrome 内置 AI 翻译、自定义接口、DeepSeek 和 OpenRouter。

## 安装

```bash
pnpm install
pnpm build
```

构建结果位于 `.output/chrome-mv3`，可在浏览器扩展管理页面中以开发者模式加载。

## Chrome 内置 AI

Chrome 服务提供两种引擎：默认「原生翻译」使用 Translator；「内置大模型（Gemma 4）」使用 Prompt API。两者在扩展后台本地执行，无需 API 令牌。

Gemma 4 使用 Chrome 154 或更高版本：

1. 在 `chrome://flags/#gemma4-for-built-in-ai` 选择 Enabled。
2. 在 `chrome://flags/#prompt-api` 选择 Enabled Multilingual，以支持中文等语言。
3. 重启 Chrome，在插件中选择 Chrome 内置 AI → 内置大模型（Gemma 4）。
4. 选择目标语言，点击「下载并初始化模型」。状态显示就绪后开始翻译。

模型及版本由 Chrome 管理，插件不能指定模型版本。实际支持以设置面板的可用状态为准。首次下载需要网络和足够磁盘空间，之后可以离线使用。[Chrome 官方要求](https://developer.chrome.com/docs/ai/get-started)

自动检测先准备英语到目标语言；其他源语言的翻译包需要下载时，选择对应源语言并初始化。大模型按真实源/目标语言检查能力，逐段隔离会话，长文本完整分块。

## 参考

基于 FluentRead 改造重写，参考 Kiss Translator 功能实现

- https://github.com/Bistutu/FluentRead
- https://github.com/fishjar/kiss-translator

## 开源协议

GNU General Public License v3.0
