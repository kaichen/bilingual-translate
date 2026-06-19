# AGENTS.md

> 给 AI 编码助手的工作指南。本文件是该仓库的规范说明，等同 CLAUDE.md。

## 项目简介

**bilingual translate** —— 开源浏览器双语翻译扩展。支持双语对照、全文翻译、悬停翻译、输入框翻译，集成 20+ 翻译引擎（机器翻译 + AI 大模型）。

技术栈：**WXT 0.20** + **Preact 10** + **TypeScript**，浏览器扩展 Manifest V3，目标 Chrome / Edge。

## 环境与命令

- 包管理器固定为 **pnpm**（`packageManager: pnpm@9.12.1`），不要用 npm/yarn。
- 安装：`pnpm install`（`postinstall` 会自动跑 `wxt prepare`）。

| 命令 | 说明 |
|------|------|
| `pnpm dev` | Chrome 开发模式（热重载） |
| `pnpm build` | 生产构建 |
| `pnpm zip` | 打包为可上传商店的 zip |
| `pnpm test` | Vitest 单元测试 |
| `pnpm compile` | `tsc --noEmit` 类型检查（**提交前务必跑**） |

验证以 `pnpm test` + `pnpm compile` + 手动加载扩展实测为主。

## 目录结构

```
entrypoints/
  background.ts        # Service Worker：右键菜单、状态机、消息路由、跨上下文请求
  content.ts           # 内容脚本：注册所有翻译触发器、挂载页面功能
  main/
    dom.ts             # 节点抓取核心：grabNode / grabAllNode，块级/内联/跳过判定
    trans.ts           # 翻译执行：悬停翻译、全文翻译(IntersectionObserver)、还原原文
    skip.ts            # 翻译相关 DOM 判定：skipNode / hasLoadingSpinner / searchClassName
    newApi.ts          # New API 配置预填（content 脚本里的 DOM 事件桥）
    trigger.ts         # 悬停触发纯逻辑：parseHoverHotkey / eventMainKeyToken / isHoverMatch
    site-rules/        # 站点规则注册表：siteRules 单一真相源（index.ts 引擎 + 每站一文件）
  config/              # 配置域：config(响应式单例) · model(Config 类) · option(services/下拉) · config-check/check(校验)
  translate/           # 翻译管线：translateApi(入口) · translateQueue(并发队列) · cache · cache-key
  providers/           # 翻译服务：registry(元数据) · service(分发) · translate/(机翻) · llm/(大模型，含 template)
  ui/                  # 页面注入 UI：tip(toast) · icon(spinner/失败提示)
  offscreen/           # Chrome 内置 Translation API 的 offscreen 文档
  popup/               # 设置面板入口（App.tsx → Header/Main/Footer）
  utils/               # 横切残余：messages(消息契约) · common(throttle/语言检测/getCenterPoint) · constant · declare.d
components/            # Preact 组件(Main/Header/Footer/CustomHotkeyInput) + hotkey.ts(快捷键解析/校验/预设)
styles/ + entrypoints/style.css   # 主题变量与译文样式
```

## 核心架构

### 翻译数据流
1. 触发（快捷键/悬停/全文）→ `main/trans.ts`
2. `main/dom.ts` 的 `grabNode` 决定翻译哪个 DOM 节点（站点差异查 `main/site-rules/` 的 `siteRules` 注册表，单路分发）
3. `translate/translateApi.ts` 统一入口：缓存命中 → 队列(`translateQueue.ts`) → `browser.runtime.sendMessage`
4. `background.ts` 收到消息 → `_service[config.service](message)` 调用具体服务
5. 结果回填 DOM（双语 append / 单语 replace），写入 `translate/cache.ts`（localStorage）

### 全局配置
- 单一响应式对象 `config`（`config/config.ts`，实例化 `config/model.ts` 的 `Config` 类，含全部默认值）。
- 持久化在 `storage.local` 的 `local:config`，通过 `storage.watch` 跨 popup/content/background 同步。
- 改默认值或加配置项时：**同时**改 `config/model.ts`（字段+默认值）和 `config/option.ts`（选项）。服务的能力/URL/模型集中在 `providers/registry.ts` 的 `PROVIDERS`（见 `CONTEXT.md`）。

## 约定

- **语言**：代码注释、commit、与用户交流统一用**中文**。
- **服务能力判定**：一律走 `providers/registry.ts` 的 `servicesType`（`isAI`/`isUseToken`/`isUseModel`/`isUseProxy`）或 `providerOf(name).needs`，勿在业务里硬编码服务名。
- **消息模板**：AI 服务的请求体集中在 `providers/llm/template.ts`，复用 `commonMsgTemplate` 等。
- **样式 class 前缀**：注入页面的元素用 `bilingual-translate-*` / `bilingual-display-*` / `bt-*`，避免污染宿主页面。
- **已翻译标记**：用 `data-bt-translated` / `data-bt-node-id` 属性追踪，便于 `restoreOriginalContent` 还原。
- 优先**最小改动**，遵循既有代码风格，不引入未要求的功能或依赖。

## 添加一个新翻译服务

1. `providers/registry.ts`：在 `PROVIDERS` 加一条记录 —— `name`（用 `services` 里的键）、`kind`（machine/ai）、`url?`（静态翻译 endpoint，动态拼接/无 fetch 的留空）、`models?`、`needs`（能力词表：token/model/proxy/customUrl/aksk/youdaoKey/tencentSecret/azureEndpoint/robotId/newApiUrl）。`servicesType`/`urls`/`models` 由此自动派生。
2. `config/option.ts`：在 `services` 加键；在 `options.services` 加下拉项（展示顺序/分组/label 手写）。
3. AI 大模型服务：在 `providers/llm/chat.ts` 的 `chatServices` 加一项 —— 缺省即 OpenAI 兼容，差异用 `onRequest`/`onResponse` 钩子表达（见 `CONTEXT.md` 的 chat-completion adapter）。带重辅助逻辑（自定义签名/OAuth）或机器翻译风格的，才新建独立 `providers/<translate|llm>/<name>.ts` 实现 `async function(message) => string`。
4. `providers/service.ts`：独立文件需在分发表注册（`chatServices` 已自动并入）。
5. 如需特殊请求体，在 `providers/llm/template.ts` 加模板。
6. `pnpm test`（`providers.test.ts` 校验下拉↔注册表一致、needs 合法）+ `pnpm compile` 验证。

## 添加 / 调整站点适配

站点规则集中在 `main/site-rules/` 的 `siteRules`（单一真相源，详见 `CONTEXT.md`）：

1. 加一个 `site-rules/xxx.ts` 导出 `xxxRule`、在 `index.ts` 的 `siteRules` 注册一条 `SiteRule`：`pattern`（域名，逗号分隔可多个、支持路径前缀）、`selector`（要翻译的元素；多个用数组，**首项=全局扫描选择器，整组=hover 上卷链**）、`ignoreSelector`（跳过）、`autoScan: false`（只按 selector 扫描，不做通用 TreeWalker）、`rootsSelector`（限定扫描根）。
2. CSS 选择器表达不了的跳过启发式 → `skipNode?(node)=>boolean`（仅 hover/单节点路径生效）；需要保留原 DOM 结构的译文回填 → `replace?(node,text)`。
3. `pnpm test`（`site-rules.test.ts` 黄金快照锁站点的选择/跳过决策）+ `pnpm compile`。

## 注意事项

- 本项目暂无官网；README 是当前文档入口。
- 微软翻译等跨域请求需经 `background.ts` 转发（见 `translateWithMicrosoftInBackground`）。
- 修改 `manifest`（权限等）在 `wxt.config.ts`，不要手写 manifest.json。
