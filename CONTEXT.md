# CONTEXT.md — 领域术语表

本文件给项目里反复出现的概念命名，统一架构与领域用语。操作指南见 `AGENTS.md`。

## 翻译服务（Provider）

一个可被选用的翻译来源——机器翻译引擎或 AI 大模型（deepseek、microsoft、google…）。名字常量集中在 `config/option.ts` 的 `services`。当前保留微软、谷歌、Chrome 本地翻译、Chrome Gemma 4、自定义接口、DeepSeek、OpenRouter。

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

## 原文语言（sourceLanguages）

全局配置 `sourceLanguages: string[]` 表示「只翻译这些语言」，空数组即自动检测、全部翻译。旧配置的单值 `from` 在 `Config` 构造时迁移；构造时还会去重，并只保留 `options.to` 里有、且不等于当前目标语言的值（设置面板隐藏了目标语言的勾选框，留着它用户清不掉，会导致什么都不翻译；导入的配置同理）。所有服务的翻译缓存 key（`translate/cache-key.ts` 的 `buildKey`）都含排序后的原文语言列表（空列表为 `auto`），改了列表不会读到按旧列表缓存的译文。

## 语言检测

页面侧只有一个语言闸：`utils/common.ts` 的 `shouldSkipTranslation`（业务代码经 `translateApi.ts` 的 `shouldSkipByLanguage` 调用）。没有文字、已是目标语言、或**确定**不在原文语言列表内的文本跳过；判断不出语言时放行。`trans.ts` 在插入 spinner 前对 `textContent` 判断一次，随后以 `skipLanguageCheck` 调 `translateText`，不对 HTML 原文重复检测。

`detectTextLanguage(text, pageLanguage)` 返回 `{ language, certain }`，顺序：先看文字种类（假名→日语，韩文→韩语，纯汉字→日语页面按日语、其余按中文，中日韩文字按 3 倍权重压过夹杂的拉丁字母，持平算中日韩），这些结果确定；拉丁/西里尔字母满 60 字符才用 franc（结果确定），否则跟随页面语言（非拉丁语页面里的短拉丁文本按英语，短西里尔文本默认俄语），这类结果**不确定**；阿拉伯、泰、希腊、天城文等其他文字占多数时不论长短都用 franc，认不出就当未知，绝不取页面语言。不确定的结果只用来判断「已是目标语言」，不用来把文本排除出原文语言列表。页面语言以函数传入，只有纯汉字、短拉丁/西里尔文本这几个分支才求值。`getPageLanguage` 用 `collectPageSample` 递归 `childNodes` 从 `main, article` 或 body 收集前 2000 字符（不用 `innerText`，免得强制布局；跳过 script/style/noscript、`[hidden]`、本扩展注入的译文/加载/重试/提示元素和单语模式下已换成译文的 `[data-bt-translated]` 节点，双语模式的原文节点保留），不足 200 字符时用 `html lang` / meta 声明。结果按地址缓存：样本不足 2 秒过期、样本足够 10 秒过期，地址变了立即重算。

Chrome 本地服务不在页面侧按原文语言列表过滤，由后台 `resolveSource` 用 `LanguageDetector` 逐段判断：置信度低于 0.5 或检测不出时，只勾选一种原文语言就按它翻译，否则保持原样；检测结果不在列表内也保持原样。谷歌、微软一律让服务自动检测。

## Chrome 内置 AI

`providers/translate/chrome-builtin-ai.ts` 直接在扩展 Service Worker 调用当前 `Translator`、`LanguageDetector`、`LanguageModel`。`chromeTranslator`（Translator API）和 `chromeGemma`（Prompt API）是两个独立服务，共用这一套实现；引擎由 `registry.ts` 的 `chromeEngineOf(service)` 从服务名派生，不再有单独的引擎配置项。`nativeAI` 能力用于设置展示与请求路由。

Gemma 4 模型由 Chrome 的实验配置和组件分发管理，扩展不传模型名称。Prompt 的真实输入语言包含英语系统提示和源语言，输出声明目标语言；翻译提示与分块逻辑位于 `providers/llm/chrome-prompt.ts`。

下载由设置面板的 `initializeChromeAI` 显式启动，`getChromeAIStatus` 返回下载进度。后台跨页面串行执行原生任务，复用检测器和当前语言对会话，空闲 60 秒销毁。Prompt 每块从仅含系统提示的基础会话克隆并释放，预留一半上下文给输出。

大模型会话必须带 `samplingMode: 'most-predictable'`，否则 Chrome 154 的 Gemma 4 直接返回 unavailable。页面一次放行最多 8 个大模型请求，后台把排队中同配置的短段落用 `[[n]]` 标记合并成一次推理（`translateBatchWithPrompt`）；标记缺失或重复时逐段重译。短文本按每字符 2 个 token 粗估，不调用 `measureContextUsage`。

原生翻译请求携带配置快照、requestId 和推理超时；后台通过 AbortSignal 处理超时，`cancelChromeTranslation` 按发送页面隔离取消。确定性的模型/语言状态不会走网络重试。缓存包含引擎、原文语言列表和 Prompt 模板版本，防止读到旧原生译文。
