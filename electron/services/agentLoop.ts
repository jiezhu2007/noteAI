/**
 * Agent Loop 引擎
 *
 * 管理 Think → Act → Reflect → Decide 循环：
 * - Think：分析任务，制定回答策略
 * - Act：调用 LLM 生成回答（流式）
 * - Reflect：自我评估回答质量（JSON 评分）
 * - Decide：评分达标则输出，否则携带改进建议回到 Think
 */

import { aiService } from './ai'
import {
  estimateTokens,
  estimateMessagesTokens,
  truncateMessages,
  getBudgetForProvider,
  TokenTracker,
  type TokenBudget,
} from './tokenManager'
import { buildSystemPrompt } from './promptTemplates'
import type { AgentConfig, AgentChunk, AgentRequest, ReflectionResult, SkillReflectionCriteria } from '../../src/types'
import { DEFAULT_AGENT_CONFIG } from '../../src/types'
import { getSetting, setSetting } from './db'

// ─── 配置管理 ────────────────────────────────────────────────────────────────

function loadAgentConfig(): AgentConfig {
  try {
    const raw = getSetting('ai_agent_config')
    if (raw) return { ...DEFAULT_AGENT_CONFIG, ...JSON.parse(raw) }
  } catch {}
  return { ...DEFAULT_AGENT_CONFIG }
}

function saveAgentConfig(config: AgentConfig): AgentConfig {
  setSetting('ai_agent_config', JSON.stringify(config))
  return config
}

// ─── 复杂度自动分级 ──────────────────────────────────────────────────────────

function classifyComplexity(
  message: string,
  hasSkill: boolean,
  noteContextLength: number,
): 0 | 1 | 2 | 3 {
  // 简单问候/确认 → Level 0
  if (/^(你好|谢谢|好的|ok|hi|hello|hey|嗯|是的|对)[！!。.，,\s]*$/i.test(message.trim())) return 0

  // 有技能激活
  if (hasSkill) {
    // 长笔记上下文 + 分析类关键词 → Level 3
    if (noteContextLength > 3000 && /分析|对比|详细|完整|深入|评估|总结/.test(message)) return 3
    return 2
  }

  // 短问答 → Level 1
  if (message.length < 100) return 1

  // 默认 Level 2
  return 2
}

// ─── Prompt 模板 ─────────────────────────────────────────────────────────────

function buildThinkPrompt(
  userMessage: string,
  noteTitle?: string,
  noteContext?: string,
  skillName?: string,
  previousReflection?: ReflectionResult,
): string {
  let prompt = `你是 NoteAI 的 AI 助手。在回答之前，请先分析任务：

## 用户消息
${userMessage}
`

  if (noteTitle || noteContext) {
    prompt += `
## 笔记上下文
标题：${noteTitle || '无标题'}
内容（前 2000 字）：${(noteContext || '').slice(0, 2000)}
`
  }

  if (skillName) {
    prompt += `\n## 当前技能\n已激活技能：${skillName}\n`
  }

  if (previousReflection) {
    prompt += `
## 上轮反思结果
加权评分：${previousReflection.weightedScore}/10
需要改进：
${previousReflection.improvements.map((s) => `- ${s}`).join('\n')}
`
  }

  prompt += `
请简要分析（不超过 100 字）：
1. 用户的核心需求是什么？
2. 需要关注哪些关键点？
3. 回答应该采用什么结构？`

  return prompt
}

function buildReflectPrompt(
  userMessage: string,
  agentResponse: string,
  criteria?: SkillReflectionCriteria,
): string {
  const extraSection = criteria?.extraCriteria
    ? `\n## 额外评估标准\n${criteria.extraCriteria}\n`
    : ''

  return `你是一个严格的质量评估专家。请评估以下 AI 回答的质量。

## 用户问题
${userMessage}

## AI 回答
${agentResponse}
${extraSection}
## 评估要求
从以下 5 个维度评分（0-10 分），并给出改进建议。
严格按 JSON 格式输出，不要有其他文字：

{
  "accuracy": { "score": 8, "reason": "评价原因" },
  "completeness": { "score": 7, "reason": "评价原因" },
  "formatting": { "score": 9, "reason": "评价原因" },
  "relevance": { "score": 8, "reason": "评价原因" },
  "clarity": { "score": 7, "reason": "评价原因" },
  "weightedScore": 7.8,
  "pass": true,
  "improvements": ["改进建议1", "改进建议2"]
}`
}

function buildImproveSystemPrompt(reflection: ReflectionResult): string {
  const lines = [
    '你之前的回答得到了以下反思评估：',
    '',
    '## 评分',
    `- 准确性: ${reflection.accuracy.score}/10 — ${reflection.accuracy.reason}`,
    `- 完整性: ${reflection.completeness.score}/10 — ${reflection.completeness.reason}`,
    `- 格式规范: ${reflection.formatting.score}/10 — ${reflection.formatting.reason}`,
    `- 相关性: ${reflection.relevance.score}/10 — ${reflection.relevance.reason}`,
    `- 清晰度: ${reflection.clarity.score}/10 — ${reflection.clarity.reason}`,
    '',
    '## 需要改进',
    ...reflection.improvements.map((s) => `- ${s}`),
    '',
    '请基于以上反馈，重新生成改进后的回答。重点改进得分较低的维度。不要提及反思过程，直接给出改进后的回答。',
  ]
  return lines.join('\n')
}

// ─── 反思结果解析 ─────────────────────────────────────────────────────────────

const DEFAULT_WEIGHTS = {
  accuracy: 0.3,
  completeness: 0.25,
  formatting: 0.2,
  relevance: 0.15,
  clarity: 0.1,
}

function parseReflection(
  raw: string,
  threshold: number,
  criteria?: SkillReflectionCriteria,
): ReflectionResult {
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON found in reflection response')

  const parsed = JSON.parse(jsonMatch[0])

  // 合并权重
  const weights = { ...DEFAULT_WEIGHTS }
  if (criteria?.weights) {
    for (const [k, v] of Object.entries(criteria.weights)) {
      if (v !== undefined && k in weights) {
        weights[k as keyof typeof weights] = v as number
      }
    }
    // 归一化
    const total = Object.values(weights).reduce((a, b) => a + b, 0)
    if (total > 0) {
      for (const k of Object.keys(weights) as (keyof typeof weights)[]) {
        weights[k] /= total
      }
    }
  }

  const effectiveThreshold = criteria?.passThreshold ?? threshold

  const dims = ['accuracy', 'completeness', 'formatting', 'relevance', 'clarity'] as const
  const result: ReflectionResult = {
    improvements: parsed.improvements || [],
    accuracy: { score: Number(parsed.accuracy?.score ?? 5), reason: String(parsed.accuracy?.reason ?? '') },
    completeness: { score: Number(parsed.completeness?.score ?? 5), reason: String(parsed.completeness?.reason ?? '') },
    formatting: { score: Number(parsed.formatting?.score ?? 5), reason: String(parsed.formatting?.reason ?? '') },
    relevance: { score: Number(parsed.relevance?.score ?? 5), reason: String(parsed.relevance?.reason ?? '') },
    clarity: { score: Number(parsed.clarity?.score ?? 5), reason: String(parsed.clarity?.reason ?? '') },
    weightedScore: 0,
    pass: false,
  }

  result.weightedScore = dims.reduce(
    (sum, d) => sum + result[d].score * weights[d],
    0,
  )
  result.weightedScore = Math.round(result.weightedScore * 10) / 10
  result.pass = result.weightedScore >= effectiveThreshold

  return result
}

// ─── Agent Loop 主逻辑 ──────────────────────────────────────────────────────

const MAX_ITERATIONS_BY_LEVEL = [0, 1, 2, 3]

export class AgentLoop {
  async run(
    request: AgentRequest,
    onChunk: (chunk: AgentChunk) => void,
    signal: AbortSignal,
  ): Promise<void> {
    const config = { ...loadAgentConfig(), ...(request.agentConfig || {}) }
    const { sessionId, messages, noteContext, noteTitle, skillSystemPrompt, skillReflectionCriteria } = request

    // 确定反思级别
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
    const userText = lastUserMsg?.content || ''
    const hasSkill = !!skillSystemPrompt

    let level: 0 | 1 | 2 | 3
    if (skillReflectionCriteria?.forceLevel !== undefined) {
      level = skillReflectionCriteria.forceLevel
    } else if (config.autoClassify) {
      level = classifyComplexity(userText, hasSkill, (noteContext || '').length)
    } else {
      level = config.defaultLevel
    }

    const maxIterations = MAX_ITERATIONS_BY_LEVEL[level] || 0
    const tracker = new TokenTracker()
    const provider = aiService.getConfig().provider
    const budget = getBudgetForProvider(provider)

    // Level 0：无反思，直接走普通流式
    if (maxIterations === 0) {
      await this.directStream(request, onChunk, signal, tracker)
      return
    }

    let lastReflection: ReflectionResult | undefined
    let bestResponse = ''
    let bestScore = 0
    let iteration = 0

    // 动态上限：基础轮次 + 最多 maxReflectExtra 次额外反思
    const maxReflectExtra = config.maxReflectExtra ?? 2
    const reflectThreshold = config.reflectThreshold ?? config.passThreshold
    let totalMax = maxIterations
    let extraUsed = 0

    for (let i = 1; i <= totalMax; i++) {
      if (signal.aborted) break
      iteration = i

      // Token 预算检查
      if (config.maxTokenBudget > 0 && tracker.getTotalTokens() > config.maxTokenBudget) {
        break
      }

      // ── Think ──
      tracker.startPhase('think')
      onChunk({ sessionId, phase: 'think', iteration: i, maxIterations })

      let plan = ''
      try {
        const thinkPrompt = buildThinkPrompt(
          userText, noteTitle, noteContext,
          hasSkill ? '当前技能' : undefined,
          lastReflection,
        )
        plan = await this.callNonStreaming(thinkPrompt, '你是一个任务分析助手，简洁地分析用户需求。', signal)
      } catch (err: any) {
        if (err.name === 'AbortError') return
        // Think 失败不阻塞，继续 Act
      }
      tracker.endPhase('think', estimateTokens(plan))

      // ── Act ──
      tracker.startPhase('act')
      onChunk({ sessionId, phase: 'act', iteration: i, maxIterations })

      let currentResponse = ''
      try {
        const actMessages = this.buildActMessages(
          messages, noteContext, noteTitle, skillSystemPrompt,
          plan, lastReflection, budget,
        )
        await aiService.chatStream(
          actMessages,
          (delta) => {
            currentResponse += delta
            onChunk({ sessionId, phase: 'act', iteration: i, maxIterations, delta })
          },
          signal,
        )
      } catch (err: any) {
        if (err.name === 'AbortError') return
        onChunk({ sessionId, phase: 'error', iteration: i, maxIterations, error: err.message })
        return
      }
      tracker.endPhase('act', estimateTokens(currentResponse))

      // 空回答 → 停止
      if (!currentResponse.trim()) {
        onChunk({ sessionId, phase: 'error', iteration: i, maxIterations, error: 'AI 返回空回答' })
        return
      }

      // 记录最佳
      if (!bestResponse) {
        bestResponse = currentResponse
        bestScore = 0
      }

      // ── Reflect ──
      tracker.startPhase('reflect')
      onChunk({ sessionId, phase: 'reflect', iteration: i, maxIterations })

      let reflection: ReflectionResult
      try {
        const reflectPrompt = buildReflectPrompt(userText, currentResponse, skillReflectionCriteria)
        const reflectRaw = await this.callNonStreaming(
          reflectPrompt,
          '你是一个严格的质量评估专家。只输出 JSON，不要有其他文字。',
          signal,
        )
        reflection = parseReflection(reflectRaw, config.passThreshold, skillReflectionCriteria)
      } catch (err: any) {
        if (err.name === 'AbortError') return
        // JSON 解析失败 → 降级为 pass
        reflection = {
          accuracy: { score: 7, reason: '评估降级' },
          completeness: { score: 7, reason: '评估降级' },
          formatting: { score: 7, reason: '评估降级' },
          relevance: { score: 7, reason: '评估降级' },
          clarity: { score: 7, reason: '评估降级' },
          weightedScore: 7.0,
          pass: true,
          improvements: [],
        }
      }
      tracker.endPhase('reflect', estimateTokens(JSON.stringify(reflection)))

      onChunk({ sessionId, phase: 'reflect', iteration: i, maxIterations, reflection })

      // 更新最佳
      if (reflection.weightedScore > bestScore) {
        bestScore = reflection.weightedScore
        bestResponse = currentResponse
      }

      // ── Decide ──
      if (reflection.pass) break

      // 早停：已到总上限
      if (i === totalMax) break

      // ── Improve（准备下一轮）──
      // 若当前分数低于反思阈值且还有 extra 配额，动态扩展轮次上限
      if (!reflection.pass && reflection.weightedScore < reflectThreshold && extraUsed < maxReflectExtra) {
        totalMax += 1
        extraUsed += 1
        onChunk({
          sessionId,
          phase: 'improve',
          iteration: i,
          maxIterations: totalMax,
          delta: `\n\n> 正在反思改进...第 ${extraUsed}/${maxReflectExtra} 次（当前得分 ${reflection.weightedScore}）`,
        })
      } else {
        onChunk({ sessionId, phase: 'improve', iteration: i, maxIterations: totalMax })
      }
      lastReflection = reflection
    }

    // ── Done ──
    const taskIncomplete = lastReflection && !lastReflection.pass

    // 任务未完成时，在最佳回答后附加结构化摘要
    let finalContent = bestResponse
    if (taskIncomplete && lastReflection) {
      const issueLines = lastReflection.improvements.length > 0
        ? lastReflection.improvements.map((s) => `- ${s}`).join('\n')
        : '- 达到最大反思轮次'
      finalContent += `\n\n---\n⚠️ **任务未能在限定轮次内完全完成**\n\n**未完成原因：**\n${issueLines}\n\n**当前得分：** ${lastReflection.weightedScore} / 10`
    }

    const summary = tracker.getSummary()
    onChunk({
      sessionId,
      phase: 'done',
      iteration,
      maxIterations: totalMax,
      finalContent,
      meta: {
        totalTokens: summary.totalTokens,
        iterations: iteration,
        totalDurationMs: summary.totalDurationMs,
        phases: summary.phases,
      },
    })
  }

  /**
   * Level 0 快速路径：不经过反思，直接流式输出
   */
  private async directStream(
    request: AgentRequest,
    onChunk: (chunk: AgentChunk) => void,
    signal: AbortSignal,
    tracker: TokenTracker,
  ): Promise<void> {
    const { sessionId, messages, noteContext, noteTitle, skillSystemPrompt } = request
    const budget = getBudgetForProvider(aiService.getConfig().provider)

    tracker.startPhase('act')
    onChunk({ sessionId, phase: 'act', iteration: 1, maxIterations: 0 })

    let content = ''
    try {
      const actMessages = this.buildActMessages(
        messages, noteContext, noteTitle, skillSystemPrompt,
        undefined, undefined, budget,
      )
      await aiService.chatStream(
        actMessages,
        (delta) => {
          content += delta
          onChunk({ sessionId, phase: 'act', iteration: 1, maxIterations: 0, delta })
        },
        signal,
      )
    } catch (err: any) {
      if (err.name === 'AbortError') return
      onChunk({ sessionId, phase: 'error', iteration: 1, maxIterations: 0, error: err.message })
      return
    }
    tracker.endPhase('act', estimateTokens(content))

    const summary = tracker.getSummary()
    onChunk({
      sessionId,
      phase: 'done',
      iteration: 1,
      maxIterations: 0,
      finalContent: content,
      meta: {
        totalTokens: summary.totalTokens,
        iterations: 1,
        totalDurationMs: summary.totalDurationMs,
        phases: summary.phases,
      },
    })
  }

  /**
   * 构建 Act 阶段的完整消息列表（含 system prompt、截断）
   */
  private buildActMessages(
    messages: { role: string; content: string; images?: { base64: string; mimeType: string }[] }[],
    noteContext?: string,
    noteTitle?: string,
    skillSystemPrompt?: string,
    plan?: string,
    lastReflection?: ReflectionResult,
    budget?: TokenBudget,
  ): { role: string; content: string; images?: { base64: string; mimeType: string }[] }[] {
    // 构建 system prompt（复用 promptTemplates，与 main.ts ai:chatStart 保持一致）
    let systemContent = buildSystemPrompt({ noteTitle, noteContext, skillSystemPrompt })

    // 注入 Think 阶段的分析结果
    if (plan) {
      systemContent += `\n\n## 任务分析\n${plan}`
    }

    // 注入改进指令
    if (lastReflection) {
      systemContent += '\n\n' + buildImproveSystemPrompt(lastReflection)
    }

    const fullMessages = [
      { role: 'system', content: systemContent },
      ...messages.map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.images && m.images.length > 0 ? { images: m.images } : {}),
      })),
    ]

    // Token 截断：先用含 images 的完整消息做 token 预算计算，再按索引映射回含 images 的消息
    if (budget) {
      const truncated = truncateMessages(fullMessages, budget)
      // truncateMessages 只移除整条消息（不修改 content），用 index 映射回含 images 的原始消息
      const truncatedIndices = new Set(
        truncated.map((t) => fullMessages.findIndex((f) => f === t))
      )
      return fullMessages.filter((_, i) => truncatedIndices.has(i))
    }

    return fullMessages
  }

  /**
   * 非流式 LLM 调用（用于 Think 和 Reflect 阶段）
   */
  private async callNonStreaming(prompt: string, system: string, signal: AbortSignal): Promise<string> {
    let result = ''
    const messages = [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ]
    await aiService.chatStream(
      messages,
      (delta) => { result += delta },
      signal,
    )
    return result
  }
}

export const agentLoop = new AgentLoop()

// 导出配置管理函数供 IPC 使用
export { loadAgentConfig, saveAgentConfig }
