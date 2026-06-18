# CONTEXT.md — 领域术语表

本文件给项目里反复出现的概念命名，统一架构与领域用语。操作指南见 `AGENTS.md`。

## 翻译服务（Provider）

一个可被选用的翻译来源——机器翻译引擎或 AI 大模型（claude、microsoft、google…）。名字常量集中在 `utils/option.ts` 的 `services`。

## Provider 注册表（Provider Registry / PROVIDERS）

`utils/providers.ts` 中的单一真相源：每个 Provider 一条记录，描述它的全部静态事实——

```ts
{ name, kind: 'machine' | 'ai', url?, models?, needs: Need[], label }
```

`servicesType`（能力集合与谓词）、`urls`、`models` 都是对 `PROVIDERS` 做一次 **派生（derived view）** 得到的，不再手工与之并列维护。新增 Provider = 往 `PROVIDERS` 加一条记录 + 往下拉 `options.services` 加一项展示。

> 注册表是**纯数据**，不 import 任何 service 实现，故可在 vitest 下直接 import 并测试派生结果。

## 能力词表（Capability / needs）

一个 Provider 需要哪些配置字段，用 `needs` 数组声明，取代过去散落的 5 个 `servicesType` Set 与一批硬编码服务名谓词：

`token · model · proxy · customUrl · aksk · youdaoKey · tencentSecret · azureEndpoint · robotId · newApiUrl`

UI（`Main.tsx`）据 `needs` 决定显示哪些输入框；约定**勿在业务里硬编码服务名**，一律走 `needs`。

## 分发接线（Dispatch）

`name → 翻译函数` 的绑定，住在 `service/_service.ts`。它 import 各 service 实现（进而 import `config`，带 storage 副作用），与纯数据的注册表**刻意分离**：注册表可测，dispatch 不污染其可测性。

## chat-completion adapter

`service/chat.ts` 的 `chatCompletion(hooks, message)` 是一个深 adapter，拥有 fetch / 错误处理 / `contentPostHandler`。几乎所有 AI 大模型服务（OpenAI 兼容及其变体）经它统一分发，per-provider 变化点收敛为两段生命周期钩子：

- `onRequest(message) => { url, headers, body }`（可 async），缺省 `openaiRequest`（Bearer token + `proxy‖urls[name]` + `commonMsgTemplate`）
- `onResponse(json) => string`，缺省取 `choices[0].message.content`

`chatServices` 集中登记走 adapter 的 provider；带重辅助逻辑的（`zhipu` 的 JWT、`yiyan` 的 OAuth）保留独立文件但复用同一 adapter。腾讯云签名风格的 `huanYuanTranslation` 与机器翻译类不走 adapter。
