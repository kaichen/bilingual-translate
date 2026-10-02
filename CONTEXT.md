# CONTEXT.md — 领域术语表

本文件给项目里反复出现的概念命名，统一架构与领域用语。操作指南见 `AGENTS.md`。

## 翻译服务（Provider）

一个可被选用的翻译来源——机器翻译引擎或 AI 大模型（deepseek、microsoft、google…）。名字常量集中在 `config/option.ts` 的 `services`。当前保留微软、谷歌、Chrome 内置 AI、自定义接口、DeepSeek、OpenRouter。

## Provider 注册表（Provider Registry / PROVIDERS）

`providers/registry.ts` 中的单一真相源：每个 Provider 一条记录，描述它的全部静态事实——

```ts
{ name, kind: 'machine' | 'ai', url?, models?, needs: Need[], label }
```

`servicesType`（能力集合与谓词）、`urls`、`models` 都是对 `PROVIDERS` 做一次 **派生（derived view）** 得到的，不再手工与之并列维护。新增 Provider = 往 `PROVIDERS` 加一条记录 + 往下拉 `options.services` 加一项展示。

> 注册表是**纯数据**，不 import 任何 service 实现，故可在 vitest 下直接 import 并测试派生结果。

## 能力词表（Capability / needs）

一个 Provider 需要哪些配置字段，用 `needs` 数组声明，取代过去散落的 5 个 `servicesType` Set 与一批硬编码服务名谓词：

`token · model · proxy · customUrl · nativeAI`

UI（`Main.tsx`）据 `needs` 决定显示哪些输入框；约定**勿在业务里硬编码服务名**，一律走 `needs`。

`Config` 构造函数统一加载持久化与导入配置，忽略已移除服务的字段和映射；已移除的服务选择回到默认服务。

## 分发接线（Dispatch）

`name → 翻译函数` 的绑定，住在 `providers/service.ts`。它 import 各 service 实现（进而 import `config`，带 storage 副作用），与纯数据的注册表**刻意分离**：注册表可测，dispatch 不污染其可测性。

## chat-completion adapter

`providers/llm/chat.ts` 的 `chatCompletion(hooks, message)` 是一个深 adapter，拥有 fetch / 错误处理 / `contentPostHandler`。几乎所有 AI 大模型服务（OpenAI 兼容及其变体）经它统一分发，per-provider 变化点收敛为两段生命周期钩子：

- `onRequest(message) => { url, headers, body }`（可 async），缺省 `openaiRequest`（Bearer token + `proxy‖urls[name]` + `commonMsgTemplate`）
- `onResponse(json) => string`，缺省取 `choices[0].message.content`

`chatServices` 集中登记自定义接口、DeepSeek、OpenRouter。微软、谷歌与 Chrome 内置翻译使用独立实现。

## 站点规则注册表（Site Rule / Site-Rule Registry）

`main/site-rules/` 是站点适配的单一真相源。`index.ts` 持有引擎与注册表 `siteRules`，每个站点一条 `SiteRule`，描述「这站翻什么、跳过什么、怎么回填」——

```ts
{ pattern, roots?, segment?, ignore?, autoScan?, selector?, skipNode?, replace?, styles… }
```

- `selector: string | string[]` —— **按序匹配**：每项可为逗号串（任一最近祖先），项间先到先得。约定 **首项是全局批量扫描选择器，整个数组是 hover 单节点上卷链**（吸收了旧 `selectCompatFn` 的 `findMatchingElement` 链）。
- `skipNode?(node) => boolean` —— 命令式跳过逃生舱，表达 CSS `ignoreSelector` 表达不了的启发式（Twitter 类名前缀、GitHub 路径/标签、YouTube 控制区…）。**仅在 `selectSiteRuleNode` 单节点路径生效**，全局 `querySiteRuleNodes` 不调它（沿用迁移前「全局批量 / hover 单点」的分工）。
- `replace?(node, text)` —— 译文回填逃生舱（如 YouTube 保留 `yt-formatted-string` 的链接结构），挂在 `trans.ts` 的回填环节。

`grabNode`（hover/TreeWalker）与 `querySiteRuleNodes`（全局扫描）共用同一条 rule，分发**单路**：`skipNode`/`ignore` 判跳过 → `select[]` 按序上卷 → 注入样式。新增站点 = 加一个 `xxx.ts` 文件导出 `xxxRule`、在 `index.ts` 注册；只有 CSS 选择器表达不了的，才用 `skipNode`/`replace` 钩子。每个站点的规则与逃生舱各住一文件（`github`/`youtube`/`x`/`reddit`/`hacker-news`/`stackoverflow`/`medium`），`shared.ts` 放跨站点共用的 `isSpecialContent`/`debugLog`。

> 与 Provider 注册表同构：站点适配从「一域名一命令式函数 + 一份并行 selector 数据」收敛为「一条数据记录 + 必要时的逃生舱钩子」。`site-rules/` 不 import `config`，可在 vitest 下直接测（见 `tests/site-rules.test.ts` 黄金快照）。

## Chrome 内置 AI

`providers/translate/chrome-builtin-ai.ts` 直接在扩展 Service Worker 调用当前 `Translator`、`LanguageDetector`、`LanguageModel`。`chromeTranslationEngine` 为 `translator`（默认）或 `prompt`，两种引擎仍共用 `chromeTranslator` provider；`nativeAI` 能力用于设置展示与请求路由。

Gemma 4 模型由 Chrome 的实验配置和组件分发管理，扩展不传模型名称。Prompt 的真实输入语言包含英语系统提示和源语言，输出声明目标语言；翻译提示与分块逻辑位于 `providers/llm/chrome-prompt.ts`。

下载由设置面板的 `initializeChromeAI` 显式启动，`getChromeAIStatus` 返回下载进度。后台跨页面串行执行原生任务，复用检测器和当前语言对会话，空闲 60 秒销毁。Prompt 每块从仅含系统提示的基础会话克隆并释放，预留一半上下文给输出。

大模型会话必须带 `samplingMode: 'most-predictable'`，否则 Chrome 154 的 Gemma 4 直接返回 unavailable。页面一次放行最多 8 个大模型请求，后台把排队中同配置的短段落用 `[[n]]` 标记合并成一次推理（`translateBatchWithPrompt`）；标记缺失或重复时逐段重译。短文本按每字符 2 个 token 粗估，不调用 `measureContextUsage`。

原生翻译请求携带配置快照、requestId 和推理超时；后台通过 AbortSignal 处理超时，`cancelChromeTranslation` 按发送页面隔离取消。确定性的模型/语言状态不会走网络重试。缓存包含引擎、源语言和 Prompt 模板版本，防止读到旧原生译文。
