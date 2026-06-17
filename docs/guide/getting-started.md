# 快速安装

本指南将帮助你在几分钟内开始使用 bilingual translate。

## 安装插件

目前尚未发布到浏览器商店，请从源码构建后手动加载扩展。

### 构建扩展

```bash
pnpm install
pnpm build
```

Chrome / Edge 构建产物位于 `.output/chrome-mv3`。

如需 Firefox 版本：

```bash
pnpm build:firefox
```

Firefox 构建产物位于 `.output/firefox-mv2`。

### 手动加载

1. 打开浏览器的扩展程序管理页面
2. 启用"开发者模式"
3. 选择构建产物目录完成加载

<div style="display: flex; justify-content: space-between;">
  <img src="/screenshot-1.png" alt="开启开发者模式" style="width: 45%; max-width: 100%;border: 1px solid black;margin: 5px;border-radius: 8px;box-shadow: 0 2px 4px rgba(0,0,0,0.1);" />
  <img src="/screenshot-2.png" alt="拖入安装包" style="width: 45%; max-width: 100%;border: 1px solid black;margin: 5px;border-radius: 8px;box-shadow: 0 2px 4px rgba(0,0,0,0.1);" />
</div>

## 下一步

- 了解[功能介绍](./features.md)来掌握所有功能
- 查看[基本配置](../config/)和[翻译引擎配置](../config/translation-engines.md)了解更多设置选项
