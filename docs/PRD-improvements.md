# PRD：NoteAI 三项体验改进

**版本**：1.0
**日期**：2026-04-10
**状态**：已实现

---

## 概述

本文档记录三项由用户反馈驱动的体验改进，分别解决 AI 输出被截断、编辑区无法滚动、以及笔记列表加载慢三个问题。

---

## 功能 1：去除 AI Token 输出上限

### 背景与问题

用户在使用 Claude 和 OpenAI 模型时，发现 AI 回复在达到约 1024 / 2048 token 时会被硬截断，导致代码、长文分析等需要较多 token 输出的场景中，返回内容不完整。

### 用户问题

> "让 AI 解释 Rust 的所有权系统，回答到一半就停了，没有结束。"

### 功能描述

将 AI 服务中所有对话相关接口的 `max_tokens` 硬编码值从低位（1024 / 2048）统一提升至 8192，并同步提升 tokenManager 中各模型的输出预算配置，以及 Settings 页面滑块上限。

**修改范围：**

| 文件 | 修改内容 |
|------|---------|
| `electron/services/ai.ts` | `callClaude` 非流式 1024→8192；`callOpenAICompatible` 非流式 1024→8192；`streamClaude` 流式 2048→8192；`streamOpenAI` 流式 2048→8192 |
| `electron/services/tokenManager.ts` | 各模型 `maxOutputTokens` 和 `reserveForOutput` 提升至 8192（ollama reserveForOutput 为 4096，避免超过 contextLimit）|
| `src/types.ts` | `DEFAULT_AGENT_CONFIG.maxTokenBudget` 4096→16384 |
| `src/pages/Settings.tsx` | Token 预算滑块 `max` 16384→65536 |

**保留不变：** `testConnection` 专用的 `max_tokens: 1` 不受影响。

### 验收标准

- [ ] 使用 Claude / OpenAI 发送"详细解释 Rust 的所有权系统"，回复可超过 1500 token 完整输出
- [ ] Settings 页面 Token 预算滑块上限显示为 65536
- [ ] `testConnection` 仍正常工作

---

## 功能 2：编辑区域支持上下滚动

### 背景与问题

笔记编辑区在内容超出可视区域后无法滚动，用户无法看到屏幕外的内容。根因是 `Notes.tsx` 的两个 flex 子列（AI 面板列、编辑器列）未设置 `min-height: 0`，导致 flex 子项默认的 `min-height: auto` 使内容向下无限撑高，内部的 `overflow-y-auto` 永远无法触发。

### 用户问题

> "粘贴了一大段文字，滚动条出来了但是滚不动，底下的内容看不到。"

### 功能描述

在 `Notes.tsx` 的两个 flex 子列 div 上增加 `min-h-0` CSS class，重置 flex 子项的默认最小高度行为，使子项内部的 `overflow-y-auto` 可以正常触发。

**修改范围：**

| 文件 | 修改内容 |
|------|---------|
| `src/pages/Notes.tsx` | 行 9 AI 面板列 div、行 17 编辑器列 div 各加 `min-h-0` |

### 验收标准

- [ ] 新建笔记，粘贴超过一屏的长文本，编辑区出现垂直滚动条
- [ ] 可以通过鼠标滚轮或拖动滚动条滚动至底部
- [ ] AI 面板同样可正常滚动

---

## 功能 3：笔记列表启动时立即渲染

### 背景与问题

应用启动后笔记列表有明显的空白等待期。原因是 `notes:getAll` IPC handler 对每条笔记都同步读取磁盘文件以提取 preview，笔记数量较多时耗时明显，主窗口虽已显示但列表区域仍空白。

### 用户问题

> "打开 App 后要等好几秒列表才出来，电脑慢的时候更明显。"

### 功能描述

采用**两阶段加载**方案：

1. **第一阶段**：`notes:getAll` 立即返回基础数据（`preview: ''`），渲染器收到后立刻显示笔记列表（标题、修改时间等）。
2. **第二阶段**：主进程在 `setImmediate` 中异步读取所有笔记文件，完成后通过 `notes:previewsReady` IPC 事件将 preview 字典推送给渲染进程，store 合并后 UI 自动更新。

`NoteList.tsx` 中 `NoteCard` 已采用 `{note.preview && (...)}` 条件渲染，preview 为空时不显示占位行，无需修改。

**修改范围：**

| 文件 | 修改内容 |
|------|---------|
| `electron/main.ts` | 重写 `notes:getAll` handler，第一阶段返回空 preview，第二阶段 `setImmediate` 推送 `notes:previewsReady` |
| `src/store/notesStore.ts` | `loadNotes` 立即 `set({ notes })` 后，监听 `notes:previewsReady` 合并 preview 补丁 |

### 验收标准

- [ ] 重启应用，笔记列表在主窗口出现后立刻渲染（无空白等待）
- [ ] 约 0-500ms 后各笔记的 preview 文字补充显示
- [ ] DevTools IPC 面板可确认 `notes:previewsReady` 在 `notes:getAll` 之后异步推送

---

## 非功能要求

- 以上改动不得影响笔记创建、编辑、删除、搜索等已有功能
- 不得破坏 `testConnection` 的最小 token 行为
- 两阶段加载不得在 `notes:getAll` 响应延迟时造成列表闪烁或重复渲染
