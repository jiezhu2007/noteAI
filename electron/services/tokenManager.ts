/**
 * Token 估算、上下文截断、消耗追踪
 *
 * 采用基于字符数的近似算法，无需额外 tokenizer 依赖：
 *   中文 ≈ 1.5 token/字，英文 ≈ 0.75 token/word
 */

export interface TokenBudget {
  contextLimit: number   // 模型上下文窗口
  maxOutputTokens: number // 单次最大输出
  reserveForOutput: number // 为输出预留的 token 数
}

interface PhaseRecord {
  phase: string
  tokens: number
  durationMs: number
}

const MODEL_BUDGETS: Record<string, TokenBudget> = {
  // Ollama 默认
  ollama: { contextLimit: 8192, maxOutputTokens: 8192, reserveForOutput: 4096 },
  // Claude
  claude: { contextLimit: 200000, maxOutputTokens: 8192, reserveForOutput: 8192 },
  // OpenAI
  openai: { contextLimit: 128000, maxOutputTokens: 8192, reserveForOutput: 8192 },
  // Custom 保守默认
  custom: { contextLimit: 32768, maxOutputTokens: 8192, reserveForOutput: 4096 },
}

// ─── Token 估算 ──────────────────────────────────────────────────────────────

const CJK_RANGE = /[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g

export function estimateTokens(text: string): number {
  if (!text) return 0

  // 统计 CJK 字符数
  const cjkChars = text.match(CJK_RANGE)
  const cjkCount = cjkChars ? cjkChars.length : 0

  // 移除 CJK 字符后统计英文 word 数
  const nonCjk = text.replace(CJK_RANGE, ' ')
  const words = nonCjk.split(/\s+/).filter((w) => w.length > 0)

  // 中文 ≈ 1.5 token/字，英文 ≈ 0.75 token/word，加 10% 安全余量
  const raw = cjkCount * 1.5 + words.length * 0.75
  return Math.ceil(raw * 1.1)
}

export function estimateMessagesTokens(
  messages: { role: string; content: string; images?: { base64: string; mimeType: string }[] }[],
): number {
  let total = 0
  for (const msg of messages) {
    // 每条消息有约 4 token 的 role/delimiter 开销
    total += 4 + estimateTokens(msg.content)
    // 每张图片按 512 token 保守估算（实际可能 512～2048）
    if (msg.images && msg.images.length > 0) {
      total += msg.images.length * 512
    }
  }
  return total
}

// ─── 上下文截断 ──────────────────────────────────────────────────────────────

/**
 * 截断消息历史，使其 token 总量不超过预算。
 *
 * 策略：
 * 1. 保留 system prompt（第一条 system 消息）
 * 2. 保留最近 2 轮用户/助手对话（最后 4 条非 system 消息）
 * 3. 中间历史按时间正序逐条移除，直到 token 预算内
 */
export function truncateMessages(
  messages: { role: string; content: string; images?: { base64: string; mimeType: string }[] }[],
  budget: TokenBudget,
): { role: string; content: string; images?: { base64: string; mimeType: string }[] }[] {
  const maxInputTokens = budget.contextLimit - budget.reserveForOutput

  // 快速检查：未超预算直接返回
  if (estimateMessagesTokens(messages) <= maxInputTokens) {
    return messages
  }

  // 分离 system 消息和对话消息
  const systemMsgs = messages.filter((m) => m.role === 'system')
  const chatMsgs = messages.filter((m) => m.role !== 'system')

  // 保留最近 4 条对话消息（约 2 轮）
  const recentCount = Math.min(4, chatMsgs.length)
  const recentMsgs = chatMsgs.slice(-recentCount)
  const middleMsgs = chatMsgs.slice(0, chatMsgs.length - recentCount)

  const systemTokens = estimateMessagesTokens(systemMsgs)
  const recentTokens = estimateMessagesTokens(recentMsgs)
  let remainingBudget = maxInputTokens - systemTokens - recentTokens

  // 从前往后保留中间消息，直到预算耗尽
  const keptMiddle: { role: string; content: string; images?: { base64: string; mimeType: string }[] }[] = []
  for (const msg of middleMsgs) {
    const cost = 4 + estimateTokens(msg.content)
    if (remainingBudget - cost < 0) break
    keptMiddle.push(msg)
    remainingBudget -= cost
  }

  return [...systemMsgs, ...keptMiddle, ...recentMsgs]
}

// ─── 消耗追踪 ────────────────────────────────────────────────────────────────

export class TokenTracker {
  private phases: PhaseRecord[] = []
  private currentPhaseStart = 0
  private totalTokens = 0

  startPhase(_phase: string) {
    this.currentPhaseStart = Date.now()
  }

  endPhase(phase: string, tokens: number) {
    const durationMs = Date.now() - this.currentPhaseStart
    this.phases.push({ phase, tokens, durationMs })
    this.totalTokens += tokens
  }

  getTotalTokens(): number {
    return this.totalTokens
  }

  getSummary() {
    const totalDurationMs = this.phases.reduce((sum, p) => sum + p.durationMs, 0)
    return {
      totalTokens: this.totalTokens,
      totalDurationMs,
      phases: [...this.phases],
    }
  }
}

// ─── 工具函数 ────────────────────────────────────────────────────────────────

export function getBudgetForProvider(provider: string): TokenBudget {
  return MODEL_BUDGETS[provider] || MODEL_BUDGETS.custom
}
