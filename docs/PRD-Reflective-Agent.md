# PRD：反思型 Agent — AI 助手升级

- **版本**：v1.0
- **日期**：2026-04-07
- **状态**：草案
- **前置依赖**：PRD-Skills-Redesign（已实施）

---

## 1. 背景与目标

### 1.1 背景

NoteAI 当前 AI 助手采用**单轮请求-响应模式**：用户发送消息 → 调用 LLM → 流式返回结果。这一架构在 `chatStore.ts` → `ai:chatStart` IPC → `aiService.chatStream()` 链路中实现，存在以下局限：

| # | 局限 | 具体表现 |
|---|------|---------|
| 1 | **无自我评估** | 模型输出即最终结果，无法判断回答质量是否达标 |
| 2 | **无迭代改进** | 即使回答明显不完整或格式错误，也不会自动修正 |
| 3 | **无任务规划** | 复杂请求（如"分析这篇论文并给出写作建议"）无法拆解为多步骤 |
| 4 | **无 Token 管理** | 上下文无截断策略，长对话可能超出模型上下文窗口导致报错 |
| 5 | **技能输出无质控** | 5 个内置技能（图片识别/数据分析/智能摘要/多语言翻译/AI 写作）的结构化输出完全依赖模型自觉遵循 |

### 1.2 目标

将 AI 助手升级为**反思型 Agent**，引入 Think → Act → Reflect → Decide 循环机制：

1. **质量提升**：通过自我反思评估，确保回答的准确性、完整性和格式规范
2. **技能增强**：为每个内置技能定义专属反思标准，实现领域化质控
3. **透明可控**：用户可实时看到 Agent 的思考与反思过程，可随时关闭
4. **成本可控**：分级反思策略，小模型/简单任务自动跳过反思，避免无谓消耗
5. **向前兼容**：反思关闭时，行为与现有 `ai:chatStart` 完全一致，零破坏性变更

---

## 2. 核心概念

### 2.1 Agent Loop 工作流

```
┌─────────────────────────────────────────────────────┐
│                  用户发送消息                         │
└───────────────────────┬─────────────────────────────┘
                        ▼
              ┌─────────────────┐
              │   📋 Think      │  分析任务，制定回答策略
              │   (任务规划)     │  判断是否需要反思
              └────────┬────────┘
                       ▼
              ┌─────────────────┐
              │   🔨 Act        │  调用 LLM 生成回答
              │   (流式执行)     │  实时推送 delta 到前端
              └────────┬────────┘
                       ▼
              ┌─────────────────┐
              │   🔍 Reflect    │  自我评估回答质量
              │   (质量评估)     │  输出 JSON 评分
              └────────┬────────┘
                       ▼
              ┌─────────────────┐    score ≥ 阈值
              │   🎯 Decide     │ ──────────────────→ ✅ 输出最终回答
              │   (决策)        │
              └────────┬────────┘
                       │ score < 阈值 且 迭代次数 < maxIterations
                       ▼
              ┌─────────────────┐
              │   🔄 Improve    │  基于反思结果改进
              │   (回到 Think)   │  携带改进指令
              └─────────────────┘
```

### 2.2 反思评估维度

Agent 在 Reflect 阶段对自身输出进行 5 维度评分：

| 维度 | 权重 | 评分范围 | 说明 |
|------|------|---------|------|
| **准确性** (accuracy) | 30% | 0-10 | 事实正确、逻辑自洽、无明显错误 |
| **完整性** (completeness) | 25% | 0-10 | 是否完整回答了用户问题的所有方面 |
| **格式规范** (formatting) | 20% | 0-10 | Markdown 结构、代码块、列表等格式是否正确 |
| **相关性** (relevance) | 15% | 0-10 | 回答是否紧扣用户问题，不跑题 |
| **清晰度** (clarity) | 10% | 0-10 | 表达是否清晰易懂，无歧义 |

**加权总分** = accuracy × 0.3 + completeness × 0.25 + formatting × 0.2 + relevance × 0.15 + clarity × 0.1

**通过阈值**：7.0（可在设置中调整，范围 5.0 - 9.0）

### 2.3 反思策略分级

根据任务复杂度和用户配置，自动选择反思深度：

| Level | 名称 | 条件 | 行为 |
|-------|------|------|------|
| **0** | 无反思 | 用户关闭反思 / Ollama 小模型 / 简单问候 | 直接输出，等同现有行为 |
| **1** | 轻量反思 | 日常问答、短回答（< 200 字） | 1 轮反思，仅检查准确性和相关性 |
| **2** | 标准反思 | 技能调用、中等长度回答 | 最多 2 轮迭代，完整 5 维度评估 |
| **3** | 深度反思 | 长文生成、数据分析、复杂推理 | 最多 3 轮迭代，完整评估 + 改进建议 |

**自动分级规则**（P1，初期可手动）：
- 消息长度 < 20 字 且无技能激活 → Level 0
- 消息长度 < 100 字 且无技能激活 → Level 1
- 有技能激活 → Level 2
- 消息包含"分析"/"对比"/"详细"/"完整"等关键词 → Level 3

---

## 3. 功能需求

### 3.1 P0 — 核心功能（MVP）

#### 3.1.1 Agent Loop 引擎

**新建文件**：`electron/services/agentLoop.ts`

核心职责：
- 管理 Think → Act → Reflect → Decide 循环
- 维护迭代状态（当前轮次、历史评分、累计 Token）
- 通过 IPC 向渲染进程推送阶段性状态更新
- 达到终止条件时输出最终回答

**终止条件**（满足任一即停止）：
1. 反思评分 ≥ 阈值（默认 7.0）
2. 达到最大迭代次数（Level 对应的 maxIterations）
3. 累计 Token 超过预算上限
4. 用户手动中止

#### 3.1.2 反思评估 Prompt

Reflect 阶段调用 LLM 对 Act 阶段的输出进行评估，要求返回结构化 JSON：

```
你是一个严格的质量评估专家。请评估以下 AI 回答的质量。

## 用户问题
{userMessage}

## AI 回答
{agentResponse}

## 评估要求
请从以下 5 个维度进行评分（0-10 分），并给出改进建议。
严格按 JSON 格式输出，不要有其他文字：

{
  "accuracy": { "score": 8, "reason": "..." },
  "completeness": { "score": 7, "reason": "..." },
  "formatting": { "score": 9, "reason": "..." },
  "relevance": { "score": 8, "reason": "..." },
  "clarity": { "score": 7, "reason": "..." },
  "weightedScore": 7.8,
  "pass": true,
  "improvements": ["改进建议1", "改进建议2"]
}
```

#### 3.1.3 反思开关

- Settings 面板新增 "AI 反思" 开关（默认开启，Ollama 小模型默认关闭）
- 反思开关存储在 `ai_reflection_config` SQLite 设置项中
- 关闭时走现有 `ai:chatStart` 通道，无任何额外开销

#### 3.1.4 过程可视化

Agent 运行过程中，前端实时展示当前阶段：

| 阶段 | 状态文案 | UI 表现 |
|------|---------|--------|
| Think | "正在分析任务..." | 灰色状态条，脉冲动画 |
| Act | "正在生成回答..." | 流式输出（与现有行为一致） |
| Reflect | "正在自我评估..." | 灰色状态条 + 评分预览 |
| Improve | "正在改进回答（第 N 轮）..." | 状态条 + 上轮评分摘要 |
| Done | "回答完成（评分 X.X/10）" | 绿色完成标记 |

#### 3.1.5 Token 截断管理

**新建文件**：`electron/services/tokenManager.ts`

职责：
- 估算消息 Token 数（基于字符数的近似算法：中文 ≈ 1.5 token/字，英文 ≈ 0.75 token/word）
- 当上下文超过模型限制时，执行截断策略：
  1. 保留 system prompt（不截断）
  2. 保留最近 2 轮用户/助手对话
  3. 中间历史按时间倒序逐条移除，直到 Token 预算内
- 为 Agent Loop 的每轮迭代追踪 Token 消耗

**模型上下文限制参考**：

| Provider | 模型 | 上下文限制 | 默认 maxTokens |
|----------|------|-----------|---------------|
| Ollama | llama3 | 8K | 2048 |
| Claude | claude-haiku-4-5 | 200K | 2048 |
| OpenAI | gpt-4o-mini | 128K | 2048 |
| Custom | - | 可配置，默认 8K | 2048 |

#### 3.1.6 流式中间状态推送

Agent Loop 的每个阶段通过 IPC 推送 `AgentChunk` 事件：

```typescript
// 新增 IPC 通道: ai:agentChunk
interface AgentChunk {
  sessionId: string
  phase: 'think' | 'act' | 'reflect' | 'improve' | 'done'
  iteration: number        // 当前迭代轮次 (1-based)
  maxIterations: number    // 最大迭代次数

  // phase === 'act' 时
  delta?: string           // 流式文本 delta（与现有 chatChunk 一致）

  // phase === 'reflect' 时
  reflection?: ReflectionResult

  // phase === 'done' 时
  finalContent?: string    // 最终回答内容
  meta?: AgentMeta         // 运行统计
}
```

---

### 3.2 P1 — 增强功能

#### 3.2.1 技能专属反思标准

在 `src/skills/types.ts` 的 `Skill` 接口中扩展 `reflectionCriteria` 字段：

```typescript
export interface SkillReflectionCriteria {
  /** 覆盖默认维度权重 */
  weights?: Partial<Record<'accuracy' | 'completeness' | 'formatting' | 'relevance' | 'clarity', number>>
  /** 附加评估指令（追加到 Reflect prompt） */
  extraCriteria?: string
  /** 强制反思级别（覆盖自动分级） */
  forceLevel?: 0 | 1 | 2 | 3
  /** 通过阈值覆盖 */
  passThreshold?: number
}
```

**各技能的专属反思标准**：

| 技能 | 权重调整 | 附加评估指令 | 默认 Level |
|------|---------|-------------|-----------|
| 图片识别 | accuracy: 40%, formatting: 10% | "检查是否遗漏图片中的关键元素" | 2 |
| 数据分析 | accuracy: 35%, completeness: 30% | "检查统计数据是否有计算错误；检查是否包含五步输出结构" | 3 |
| 智能摘要 | completeness: 35%, clarity: 15% | "检查摘要是否覆盖原文核心论点；检查要点是否独立不重叠" | 2 |
| 多语言翻译 | accuracy: 40%, formatting: 15% | "检查是否有漏译、误译；检查专有名词是否保留原文" | 2 |
| AI 写作 | clarity: 20%, formatting: 25% | "检查修改对比表格是否完整；检查修改后文本是否自然" | 2 |

#### 3.2.2 复杂度自动分级

基于消息特征自动判定反思级别，替代手动配置：

```typescript
function classifyComplexity(
  message: string,
  hasSkill: boolean,
  noteContextLength: number
): 0 | 1 | 2 | 3 {
  // 简单问候/确认 → Level 0
  if (/^(你好|谢谢|好的|ok|hi|hello)[！!。.]*$/i.test(message)) return 0

  // 有技能激活 → 至少 Level 2
  if (hasSkill) {
    // 长笔记上下文 + 分析类关键词 → Level 3
    if (noteContextLength > 3000 && /分析|对比|详细|完整|深入/.test(message)) return 3
    return 2
  }

  // 短问答 → Level 1
  if (message.length < 100) return 1

  // 默认 Level 2
  return 2
}
```

#### 3.2.3 反思历史查看

在 `ChatMessageBubble` 组件中，为经过反思的回答添加可折叠的反思详情：

- 折叠状态：显示最终评分徽标（如 "8.2/10 · 2 轮"）
- 展开状态：显示每轮反思的 5 维度评分条 + 改进建议

#### 3.2.4 成本统计

在 `AgentMeta` 中记录并展示：

```typescript
interface AgentMeta {
  totalTokens: number          // 总 Token 消耗
  iterations: number           // 实际迭代轮次
  totalDurationMs: number      // 总耗时
  phases: {
    phase: string
    tokens: number
    durationMs: number
  }[]
}
```

在 AI 面板底部或消息气泡中以紧凑格式展示：`⚡ 1.2K tokens · 2 轮 · 3.4s`

---

### 3.3 P2 — 未来扩展

#### 3.3.1 工具调用（Tool Use）

允许 Agent 在 Act 阶段调用预定义工具：
- `search_notes(query)` — 搜索相关笔记
- `read_note(id)` — 读取指定笔记内容
- `create_reminder(title, dueDate)` — 创建提醒

#### 3.3.2 多步任务规划

对复杂任务自动拆解为子步骤，逐步执行：
```
用户："把这篇论文翻译成英文，然后生成摘要"
→ Step 1: 翻译（translation 技能）
→ Step 2: 摘要（document-summary 技能）
→ 合并输出
```

#### 3.3.3 用户反馈学习

- 用户对回答点赞/点踩
- 收集反馈数据，用于调整反思阈值和权重
- 长期优化个人偏好模型

---

## 4. 技术架构设计

### 4.1 新增文件

| 文件 | 说明 |
|------|------|
| `electron/services/agentLoop.ts` | Agent Loop 引擎：管理 Think→Act→Reflect→Decide 循环 |
| `electron/services/tokenManager.ts` | Token 估算、上下文截断、消耗追踪 |
| `src/components/AIPanel/ReflectionBubble.tsx` | 反思详情折叠组件（5 维评分条 + 改进建议） |
| `src/components/AIPanel/AgentStatusBar.tsx` | Agent 运行状态指示器（阶段文案 + 动画） |

### 4.2 修改文件

| 文件 | 修改内容 |
|------|---------|
| `electron/main.ts` | 新增 `ai:agentStart` / `ai:agentStop` IPC handler；注册 `ai:agentChunk` 推送通道 |
| `electron/preload.ts` | 暴露 `agentStart` / `agentStop` API 到 `window.electronAPI.ai` |
| `src/types.ts` | 新增 `AgentConfig`、`AgentChunk`、`ReflectionResult`、`AgentMeta` 类型 |
| `src/store/chatStore.ts` | 新增 `agentPhase`、`agentIteration`、`reflectionResult` 状态；`sendMessage` 根据反思开关分流 `ai:chatStart` 或 `ai:agentStart` |
| `src/skills/types.ts` | `Skill` 接口新增 `reflectionCriteria?: SkillReflectionCriteria` 字段 |
| `src/components/AIPanel/ChatMessageBubble.tsx` | 为反思消息渲染 `ReflectionBubble` 折叠区 |
| `src/components/AIPanel/AIPanel.tsx` | 集成 `AgentStatusBar`；处理 `agentChunk` 事件 |

### 4.3 核心接口定义

```typescript
// ─── Agent 配置 ─────────────────────────────────────────────
interface AgentConfig {
  enabled: boolean             // 反思总开关
  defaultLevel: 0 | 1 | 2 | 3 // 默认反思级别
  passThreshold: number        // 通过阈值 (5.0 - 9.0)
  maxTokenBudget: number       // 单次 Agent 运行 Token 预算
  autoClassify: boolean        // 是否自动分级（P1）
}

// ─── Agent 运行时 Chunk ──────────────────────────────────────
interface AgentChunk {
  sessionId: string
  phase: 'think' | 'act' | 'reflect' | 'improve' | 'done' | 'error'
  iteration: number
  maxIterations: number
  delta?: string               // phase=act 时的流式文本
  reflection?: ReflectionResult // phase=reflect 时的评估结果
  finalContent?: string        // phase=done 时的最终内容
  meta?: AgentMeta             // phase=done 时的运行统计
  error?: string               // phase=error 时的错误信息
}

// ─── 反思评估结果 ────────────────────────────────────────────
interface ReflectionResult {
  accuracy: { score: number; reason: string }
  completeness: { score: number; reason: string }
  formatting: { score: number; reason: string }
  relevance: { score: number; reason: string }
  clarity: { score: number; reason: string }
  weightedScore: number
  pass: boolean
  improvements: string[]
}

// ─── 技能反思标准 ────────────────────────────────────────────
interface SkillReflectionCriteria {
  weights?: Partial<Record<'accuracy' | 'completeness' | 'formatting' | 'relevance' | 'clarity', number>>
  extraCriteria?: string
  forceLevel?: 0 | 1 | 2 | 3
  passThreshold?: number
}

// ─── Agent 运行统计 ──────────────────────────────────────────
interface AgentMeta {
  totalTokens: number
  iterations: number
  totalDurationMs: number
  phases: {
    phase: string
    tokens: number
    durationMs: number
  }[]
}
```

### 4.4 关键 Prompt 设计

#### 4.4.1 Think 阶段 Prompt

```
你是 NoteAI 的 AI 助手。在回答之前，请先分析任务：

## 用户消息
{userMessage}

## 笔记上下文
标题：{noteTitle}
内容（前 2000 字）：{noteContext}

## 当前技能
{skillName ? `已激活技能：${skillName}` : '无特定技能'}

请简要分析：
1. 用户的核心需求是什么？
2. 需要关注哪些关键点？
3. 回答应该采用什么结构？

（内部分析，不会直接展示给用户。简洁回答，不超过 100 字。）
```

#### 4.4.2 Reflect 阶段 Prompt

```
你是一个严格的质量评估专家。请评估以下 AI 回答的质量。

## 用户问题
{userMessage}

## AI 回答
{agentResponse}

{skillExtraCriteria ? `## 额外评估标准\n${skillExtraCriteria}` : ''}

## 评估要求
从以下 5 个维度评分（0-10 分），并给出改进建议。
严格按 JSON 格式输出，不要有其他文字：

{
  "accuracy": { "score": <0-10>, "reason": "..." },
  "completeness": { "score": <0-10>, "reason": "..." },
  "formatting": { "score": <0-10>, "reason": "..." },
  "relevance": { "score": <0-10>, "reason": "..." },
  "clarity": { "score": <0-10>, "reason": "..." },
  "weightedScore": <加权总分>,
  "pass": <true/false>,
  "improvements": ["...", "..."]
}
```

#### 4.4.3 Improve 迭代 Prompt

```
你之前的回答得到了以下反思评估：

## 评分
- 准确性: {accuracy}/10 — {accuracyReason}
- 完整性: {completeness}/10 — {completenessReason}
- 格式规范: {formatting}/10 — {formattingReason}
- 相关性: {relevance}/10 — {relevanceReason}
- 清晰度: {clarity}/10 — {clarityReason}

## 需要改进
{improvements.join('\n')}

请基于以上反馈，重新生成改进后的回答。重点改进得分较低的维度。
```

---

## 5. 数据流

### 5.1 反思关闭时（兼容模式）

```
渲染进程                              主进程
  │                                    │
  ├─ chatStore.sendMessage() ──────────┤
  │  ai:chatStart (ChatRequest)        │
  │                                    ├─ aiService.chatStream()
  │  ai:chatChunk { delta, done } ◄────┤  (现有流式逻辑，完全不变)
  │                                    │
```

与现有行为 100% 一致，不经过 agentLoop。

### 5.2 反思开启时（Agent 模式）

```
渲染进程                              主进程
  │                                    │
  ├─ chatStore.sendMessage() ──────────┤
  │  ai:agentStart (AgentRequest)      │
  │                                    ├─ agentLoop.run()
  │                                    │   │
  │  agentChunk { phase: 'think' } ◄───┤   ├─ Think: LLM 分析任务
  │  (状态条: "正在分析任务...")         │   │
  │                                    │   │
  │  agentChunk { phase: 'act',    ◄───┤   ├─ Act: 流式生成回答
  │    delta: '...' }                  │   │  (实时推送 delta)
  │  (流式渲染回答内容)                 │   │
  │                                    │   │
  │  agentChunk { phase: 'reflect',◄───┤   ├─ Reflect: LLM 自我评估
  │    reflection: {...} }             │   │
  │  (状态条: "评分 7.8/10")            │   │
  │                                    │   │
  │         [若 pass=false]             │   │
  │  agentChunk { phase: 'improve' ◄───┤   ├─ 回到 Think（第 2 轮）
  │    iteration: 2 }                  │   │
  │  (状态条: "正在改进 (2/3)...")       │   │
  │                                    │   │  ... 重复 Act → Reflect ...
  │                                    │   │
  │  agentChunk { phase: 'done',   ◄───┤   └─ Decide: 输出最终回答
  │    finalContent, meta }            │
  │  (渲染最终回答 + 反思徽标)           │
```

---

## 6. UI/UX 设计

### 6.1 Agent 状态指示器（AgentStatusBar）

位置：AI 面板中，位于流式输出区域上方。

```
┌─────────────────────────────────────────────┐
│ 🔍 正在自我评估...                 (2/3)    │
│ ▓▓▓▓▓▓▓▓░░░░░░░░░                          │
└─────────────────────────────────────────────┘
```

- 显示当前阶段图标 + 文案
- 右侧显示迭代进度（当前轮/最大轮）
- 进度条指示当前阶段进展
- Think / Reflect / Improve 阶段使用 `text-gray-400` 脉冲动画
- Act 阶段隐藏状态条（此时直接展示流式输出）
- Done 阶段短暂显示绿色 "完成" 后消失

### 6.2 反思详情折叠（ReflectionBubble）

在经过反思的 assistant 消息气泡底部：

**折叠态**（默认）：
```
┌──────────────────────────────────────────┐
│ [AI 回答内容...]                         │
│                                          │
│  ✅ 8.2/10 · 2轮反思    ▶ 查看详情       │
└──────────────────────────────────────────┘
```

**展开态**：
```
┌──────────────────────────────────────────┐
│ [AI 回答内容...]                         │
│                                          │
│  ✅ 8.2/10 · 2轮反思    ▼ 收起           │
│ ┌──────────────────────────────────────┐ │
│ │ 准确性    ▓▓▓▓▓▓▓▓░░  8/10         │ │
│ │ 完整性    ▓▓▓▓▓▓▓▓▓░  9/10         │ │
│ │ 格式规范  ▓▓▓▓▓▓▓░░░  7/10         │ │
│ │ 相关性    ▓▓▓▓▓▓▓▓▓░  9/10         │ │
│ │ 清晰度    ▓▓▓▓▓▓▓▓░░  8/10         │ │
│ │                                      │ │
│ │ ⚡ 1.2K tokens · 3.4s               │ │
│ └──────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

### 6.3 Settings 反思配置面板

在 Settings → AI 配置区域新增：

```
┌─ AI 反思 ──────────────────────────────────┐
│                                            │
│  启用反思            [开关: ON]             │
│  反思级别            [自动 ▼]              │
│  通过阈值            [====●===] 7.0        │
│  Token 预算          [====●=] 4096         │
│                                            │
│  ℹ️ 反思功能会增加 1.5-4.6 倍 Token 消耗    │
│     Ollama 本地小模型建议关闭               │
└────────────────────────────────────────────┘
```

---

## 7. 实施路线图

### Phase 1：Agent Loop 引擎（P0 核心）

**目标**：后端 Agent 循环可运行，支持 IPC 推送

| 任务 | 文件 | 预计复杂度 |
|------|------|-----------|
| 实现 TokenManager | `electron/services/tokenManager.ts` | 中 |
| 实现 AgentLoop 核心逻辑 | `electron/services/agentLoop.ts` | 高 |
| 新增 IPC handlers | `electron/main.ts` | 低 |
| 扩展 preload bridge | `electron/preload.ts` | 低 |
| 新增 TypeScript 类型 | `src/types.ts` | 低 |

**验收**：通过 IPC 手动触发 `ai:agentStart`，控制台可见完整 Think → Act → Reflect → Decide 日志。

### Phase 2：前端集成（P0 可视化）

**目标**：UI 展示 Agent 运行过程

| 任务 | 文件 | 预计复杂度 |
|------|------|-----------|
| AgentStatusBar 组件 | `src/components/AIPanel/AgentStatusBar.tsx` | 中 |
| chatStore 状态扩展 | `src/store/chatStore.ts` | 中 |
| AIPanel 集成 Agent 流程 | `src/components/AIPanel/AIPanel.tsx` | 中 |

**验收**：发送消息后可看到阶段切换动画，Act 阶段流式输出正常，Done 阶段显示最终回答。

### Phase 3：技能标准 + 设置（P1 增强）

**目标**：技能专属反思 + 用户可配置

| 任务 | 文件 | 预计复杂度 |
|------|------|-----------|
| Skill 接口扩展 reflectionCriteria | `src/skills/types.ts` + 5 个内置技能 | 中 |
| ReflectionBubble 组件 | `src/components/AIPanel/ReflectionBubble.tsx` | 中 |
| ChatMessageBubble 集成反思详情 | `src/components/AIPanel/ChatMessageBubble.tsx` | 低 |
| Settings 反思配置面板 | Settings 组件 | 中 |
| 复杂度自动分级 | `electron/services/agentLoop.ts` | 低 |

**验收**：激活技能后发送消息，反思使用对应技能的专属标准；Settings 可调整阈值和级别。

### Phase 4：优化与打磨

**目标**：性能优化、边界情况处理

| 任务 | 说明 |
|------|------|
| 早停机制 | 首次评分 ≥ 9.0 直接通过，跳过后续迭代 |
| 非流式 Think/Reflect | Think 和 Reflect 阶段改为非流式调用，减少 SSE 开销 |
| 降级兜底 | Reflect JSON 解析失败时给默认 pass，不阻塞输出 |
| 成本统计展示 | AgentMeta 在 UI 中的紧凑展示 |
| Ollama 检测 | 检测 Ollama 模型参数量，< 7B 自动建议关闭反思 |

---

## 8. 兼容性

### 8.1 现有通道保留

| IPC 通道 | 状态 | 说明 |
|----------|------|------|
| `ai:chatStart` | **不变** | 反思关闭时仍走此通道 |
| `ai:chatChunk` | **不变** | 反思关闭时的流式推送 |
| `ai:chatStop` | **不变** | 中止当前流 |
| `ai:agentStart` | **新增** | 反思开启时的 Agent 入口 |
| `ai:agentChunk` | **新增** | Agent 阶段性状态推送 |
| `ai:agentStop` | **新增** | 中止 Agent 运行 |

### 8.2 降级策略

| 场景 | 降级行为 |
|------|---------|
| Reflect 阶段 JSON 解析失败 | 视为 pass，直接输出当前回答 |
| Reflect 阶段 API 调用失败 | 同上，输出当前回答 + 错误提示 |
| 累计 Token 超预算 | 停止迭代，输出当前最佳回答 |
| 网络中断 | Agent 中止，保留已生成内容（与现有 stopStreaming 行为一致） |
| Act 阶段生成空内容 | 跳过 Reflect，返回错误提示 |

### 8.3 模型兼容性

| Provider | 默认行为 |
|----------|---------|
| **Ollama**（本地小模型） | 默认关闭反思（Level 0）。用户可手动开启，但提示 Token 消耗较高 |
| **Claude** | 默认开启反思（Level 自动）。claude-haiku-4-5 的 JSON 输出稳定性较好 |
| **OpenAI** | 默认开启反思（Level 自动） |
| **Custom** | 默认关闭反思。用户可手动开启，需确保自定义 API 支持足够上下文长度 |

---

## 9. 性能与成本分析

### 9.1 Token 消耗倍率

| 反思级别 | LLM 调用次数 | Token 消耗倍率（相对无反思） | 说明 |
|---------|-------------|--------------------------|------|
| Level 0 | 1 次（Act） | **1.0x** | 无反思，与现有一致 |
| Level 1 | 3 次（Think + Act + Reflect） | **~2.0x** | 轻量反思，1 轮 |
| Level 2 | 3-5 次 | **~2.5x - 3.2x** | 标准反思，最多 2 轮迭代 |
| Level 3 | 3-7 次 | **~3.0x - 4.6x** | 深度反思，最多 3 轮迭代 |

> 注：Think 和 Reflect 的 Prompt 较短（< 500 tokens），实际消耗主要在 Act 阶段。上述倍率为估算上限。

### 9.2 延迟分析

| 阶段 | 预计延迟 | 用户感知 |
|------|---------|---------|
| Think | 0.5-1.5s | 状态条 "正在分析..." |
| Act | 2-10s（取决于回答长度） | 流式输出，用户实时可见 |
| Reflect | 1-3s | 状态条 "正在评估..." |
| Improve（回到 Think） | 同上循环 | 状态条 "改进中 (2/3)..." |

**总延迟**：Level 1 增加 ~2s，Level 2 增加 ~4-8s，Level 3 增加 ~8-15s

### 9.3 优化措施

| 措施 | 效果 |
|------|------|
| **Think/Reflect 非流式** | 减少 SSE 连接开销，降低 ~200ms/次 |
| **早停机制** | 首轮评分 ≥ 9.0 直接通过，避免无效迭代 |
| **Token 预算上限** | 硬性保底，防止极端情况下的无限消耗 |
| **Level 0 短路** | 简单消息完全跳过 Agent 开销 |
| **Reflect prompt 精简** | 评估 prompt 控制在 300 tokens 内 |

---

## 10. 风险与验收标准

### 10.1 风险矩阵

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| Reflect 阶段 JSON 解析频繁失败 | 中 | 中 | 降级为 pass + 日志记录；优化 Prompt 中的 JSON 示例 |
| 多轮迭代导致响应延迟过高 | 中 | 高 | 严格控制 maxIterations；Level 分级；用户可随时中止 |
| Ollama 小模型反思能力不足 | 高 | 低 | 默认关闭反思；检测模型参数量提示用户 |
| Token 预算估算不准确 | 低 | 中 | 使用保守估算（宁多不少）；截断策略保留安全余量 |
| 反思导致回答风格变化 | 低 | 低 | Improve prompt 强调"改进，不要完全重写" |
| 新增 IPC 通道与现有通道冲突 | 低 | 高 | 使用独立的 `ai:agent*` 命名空间，不修改现有 `ai:chat*` |

### 10.2 验收标准

#### P0 验收

- [ ] 反思关闭时，`ai:chatStart` 链路行为不变，TypeScript 编译通过
- [ ] 反思开启时，`ai:agentStart` 触发完整 Think → Act → Reflect → Decide 循环
- [ ] Agent 状态指示器正确展示当前阶段和迭代进度
- [ ] 流式输出在 Act 阶段正常工作（与现有体验一致）
- [ ] 反思评分 ≥ 阈值时一轮即通过；< 阈值时触发迭代
- [ ] 达到 maxIterations 时停止并输出当前最佳回答
- [ ] Token 截断不导致 API 调用失败
- [ ] 用户可通过 stopStreaming 中止 Agent 运行

#### P1 验收

- [ ] 5 个内置技能各有专属反思标准，评估时使用对应权重
- [ ] ReflectionBubble 正确展示 5 维度评分条
- [ ] Settings 面板可配置反思开关、阈值、级别
- [ ] 成本统计在 UI 中可见
- [ ] 自动分级根据消息特征选择合理的反思级别

---

## 附录 A：agentLoop.ts 伪代码

```typescript
class AgentLoop {
  private config: AgentConfig
  private tokenManager: TokenManager

  async run(request: AgentRequest, onChunk: (chunk: AgentChunk) => void, signal: AbortSignal) {
    const { sessionId, messages, level, skillCriteria } = request
    const maxIterations = [0, 1, 2, 3][level]

    let currentResponse = ''
    let bestResponse = ''
    let bestScore = 0

    for (let i = 1; i <= maxIterations; i++) {
      if (signal.aborted) break

      // ── Think ──
      onChunk({ sessionId, phase: 'think', iteration: i, maxIterations })
      const plan = await this.think(messages, i > 1 ? lastReflection : undefined)

      // ── Act ──
      onChunk({ sessionId, phase: 'act', iteration: i, maxIterations })
      currentResponse = ''
      await aiService.chatStream(
        this.buildActMessages(messages, plan, i > 1 ? lastReflection : undefined),
        (delta) => {
          currentResponse += delta
          onChunk({ sessionId, phase: 'act', iteration: i, maxIterations, delta })
        },
        signal
      )

      if (!currentResponse.trim()) break // 空回答，停止

      // ── Reflect ──
      onChunk({ sessionId, phase: 'reflect', iteration: i, maxIterations })
      let reflection: ReflectionResult
      try {
        reflection = await this.reflect(messages, currentResponse, skillCriteria)
      } catch {
        // JSON 解析失败，降级为 pass
        reflection = { pass: true, weightedScore: 7.0, /* ... defaults */ }
      }
      onChunk({ sessionId, phase: 'reflect', iteration: i, maxIterations, reflection })

      // 记录最佳
      if (reflection.weightedScore > bestScore) {
        bestScore = reflection.weightedScore
        bestResponse = currentResponse
      }

      // ── Decide ──
      if (reflection.pass || i === maxIterations) {
        break
      }

      // ── Improve ──
      onChunk({ sessionId, phase: 'improve', iteration: i, maxIterations })
      lastReflection = reflection
    }

    // ── Done ──
    const meta = this.tokenManager.getSummary()
    onChunk({ sessionId, phase: 'done', iteration: i, maxIterations, finalContent: bestResponse, meta })
  }
}
```

---

## 附录 B：与现有代码的映射关系

| 现有代码 | 新增/修改 | 关系 |
|---------|----------|------|
| `aiService.chatStream()` | `agentLoop.run()` | Agent 的 Act 阶段内部调用 chatStream |
| `ChatRequest.skillSystemPrompt` | `AgentRequest.skillCriteria` | Agent 模式下额外携带技能反思标准 |
| `chatStore.isStreaming` | `chatStore.agentPhase` | Agent 模式用 agentPhase 替代简单的 boolean |
| `chatStore.streamingContent` | 不变 | Act 阶段的 delta 仍累积到 streamingContent |
| `ChatStreamChunk` | `AgentChunk` | Agent 模式使用更丰富的 Chunk 结构 |
| `window.electronAPI.ai.chatStart` | `window.electronAPI.ai.agentStart` | 新增，不替换 |
