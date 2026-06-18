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
    compat.ts          # 站点适配层：按域名定制 YouTube/Twitter/GitHub/Reddit 等规则
  offscreen/           # Chrome 内置 Translation API 的 offscreen 文档
  popup/               # 设置面板入口（App.tsx → Header/Main/Footer）
  service/             # 各翻译服务实现，_service.ts 为分发表
  utils/               # config / option / model / template / cache / 队列等
components/            # Preact 组件：Main、CustomHotkeyInput 等
styles/ + entrypoints/style.css   # 主题变量与译文样式
```

## 核心架构

### 翻译数据流
1. 触发（快捷键/悬停/全文）→ `main/trans.ts`
2. `main/dom.ts` 的 `grabNode` 决定翻译哪个 DOM 节点（`main/compat.ts` 按域名特殊处理）
3. `utils/translateApi.ts` 统一入口：缓存命中 → 队列(`translateQueue.ts`) → `browser.runtime.sendMessage`
4. `background.ts` 收到消息 → `_service[config.service](message)` 调用具体服务
5. 结果回填 DOM（双语 append / 单语 replace），写入 `utils/cache.ts`（localStorage）

### 全局配置
- 单一响应式对象 `config`（`utils/config.ts`，实例化 `utils/model.ts` 的 `Config` 类，含全部默认值）。
- 持久化在 `storage.local` 的 `local:config`，通过 `storage.watch` 跨 popup/content/background 同步。
- 改默认值或加配置项时：**同时**改 `utils/model.ts`（字段+默认值）和 `utils/option.ts`（选项）。服务的能力/URL/模型集中在 `utils/providers.ts` 的 `PROVIDERS`（见 `CONTEXT.md`）。

## 约定

- **语言**：代码注释、commit、与用户交流统一用**中文**。
- **服务能力判定**：一律走 `utils/providers.ts` 的 `servicesType`（`isAI`/`isUseToken`/`isUseModel`/`isUseProxy`）或 `providerOf(name).needs`，勿在业务里硬编码服务名。
- **消息模板**：AI 服务的请求体集中在 `utils/template.ts`，复用 `commonMsgTemplate` 等。
- **样式 class 前缀**：注入页面的元素用 `bilingual-translate-*` / `bilingual-display-*` / `bt-*`，避免污染宿主页面。
- **已翻译标记**：用 `data-bt-translated` / `data-bt-node-id` 属性追踪，便于 `restoreOriginalContent` 还原。
- 优先**最小改动**，遵循既有代码风格，不引入未要求的功能或依赖。

## 添加一个新翻译服务

1. `utils/providers.ts`：在 `PROVIDERS` 加一条记录 —— `name`（用 `services` 里的键）、`kind`（machine/ai）、`url?`（静态翻译 endpoint，动态拼接/无 fetch 的留空）、`models?`、`needs`（能力词表：token/model/proxy/customUrl/aksk/youdaoKey/tencentSecret/azureEndpoint/robotId/newApiUrl）。`servicesType`/`urls`/`models` 由此自动派生。
2. `utils/option.ts`：在 `services` 加键；在 `options.services` 加下拉项（展示顺序/分组/label 手写）。
3. `entrypoints/service/<name>.ts`：实现 `async function(message) => string`，OpenAI 兼容的可直接复用 `service/common.ts`。
4. `service/_service.ts`：在分发表注册。
5. 如需特殊请求体，在 `utils/template.ts` 加模板。
6. `pnpm test`（`providers.test.ts` 校验下拉↔注册表一致、needs 合法）+ `pnpm compile` 验证。

## 注意事项

- 本项目暂无官网；README 是当前文档入口。
- 微软翻译等跨域请求需经 `background.ts` 转发（见 `translateWithMicrosoftInBackground`）。
- 修改 `manifest`（权限等）在 `wxt.config.ts`，不要手写 manifest.json。
