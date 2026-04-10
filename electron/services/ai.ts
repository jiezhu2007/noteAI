import { getSetting, setSetting } from './db'

export interface AIConfig {
  provider: 'ollama' | 'claude' | 'openai' | 'custom'
  ollamaBaseUrl: string
  ollamaModel: string
  claudeApiKey: string
  openaiApiKey: string
  openaiModel: string
  customBaseUrl: string
  customToken: string
  customModel: string
}

const DEFAULT_CONFIG: AIConfig = {
  provider: 'ollama',
  ollamaBaseUrl: 'http://localhost:11434',
  ollamaModel: 'llama3',
  claudeApiKey: '',
  openaiApiKey: '',
  openaiModel: 'gpt-4o-mini',
  customBaseUrl: '',
  customToken: '',
  customModel: '',
}

// ─── 错误类型 ──────────────────────────────────────────────────────────────

interface APIErrorInfo {
  status: number
  retryable: boolean
  retryAfter?: number
  message: string
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504])
const RETRYABLE_ERROR_TYPES = new Set([
  'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EPIPE',
  'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT',
])

/** 带超时的 fetch —— 防止请求无限挂起 */
async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const { timeoutMs = 30_000, ...fetchInit } = init ?? {}

  const controller = new AbortController()
  // 合并外部 signal
  if (fetchInit.signal) {
    fetchInit.signal.addEventListener('abort', () => controller.abort(fetchInit.signal!.reason), { once: true })
  }
  const timer = setTimeout(() => controller.abort(new Error('请求超时')), timeoutMs)

  try {
    return await fetch(input, { ...fetchInit, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** 从 HTTP 错误响应中提取详细信息 */
async function parseAPIError(res: Response, provider: string): Promise<APIErrorInfo> {
  const status = res.status
  const retryable = RETRYABLE_STATUSES.has(status)
  const retryAfterHeader = res.headers.get('Retry-After')
  const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader) : undefined

  let detail = ''
  try {
    const body = await res.text()
    const json = JSON.parse(body)
    // OpenAI: { error: { message, type, code } }
    // Claude: { error: { type, message } }
    detail = json.error?.message || json.error?.type || json.message || ''
  } catch {
    // 响应体不是 JSON，忽略
  }

  const message = detail
    ? `${provider} error ${status}: ${detail}`
    : `${provider} error: ${status}`

  return { status, retryable, retryAfter, message }
}

/** 判断一个 catch 到的错误是否为网络层面可重试 */
function isRetryableNetworkError(e: any): boolean {
  if (e?.name === 'AbortError') return false
  const code = e?.cause?.code || e?.code || ''
  if (RETRYABLE_ERROR_TYPES.has(code)) return true
  const msg = String(e?.message || '')
  return /timeout|network|socket|ECONNRESET|ETIMEDOUT/i.test(msg)
}

class AIService {
  private config: AIConfig = DEFAULT_CONFIG
  private initialized = false

  constructor() {
    // 不在构造器中加载配置，改为懒加载（initDB 完成后再读取）
  }

  private ensureConfig() {
    if (!this.initialized) {
      this.loadConfig()
      this.initialized = true
    }
  }

  private loadConfig() {
    try {
      const saved = getSetting('ai_config')
      if (saved) {
        this.config = { ...DEFAULT_CONFIG, ...JSON.parse(saved) }
      }
    } catch {}
  }

  getConfig(): AIConfig {
    this.ensureConfig()
    return this.config
  }

  setConfig(config: Partial<AIConfig>) {
    this.ensureConfig()
    this.config = { ...this.config, ...config }
    setSetting('ai_config', JSON.stringify(this.config))
    return this.config
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    this.ensureConfig()
    try {
      if (this.config.provider === 'ollama') {
        const res = await fetchWithTimeout(`${this.config.ollamaBaseUrl}/api/tags`, { timeoutMs: 10_000 })
        if (res.ok) return { ok: true, message: 'Ollama 连接成功' }
        return { ok: false, message: `Ollama 响应错误: ${res.status}` }
      }
      if (this.config.provider === 'openai') {
        if (!this.config.openaiApiKey) return { ok: false, message: '请填写 OpenAI API Key' }
        const res = await fetchWithTimeout('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${this.config.openaiApiKey}` },
          timeoutMs: 10_000,
        })
        if (res.ok) return { ok: true, message: 'OpenAI 连接成功' }
        const errInfo = await parseAPIError(res, 'OpenAI')
        return { ok: false, message: errInfo.message }
      }
      if (this.config.provider === 'claude') {
        if (!this.config.claudeApiKey) return { ok: false, message: '请填写 Claude API Key' }
        // 发送一个最小请求来验证 Key 有效性
        const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.config.claudeApiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'hi' }],
          }),
          timeoutMs: 15_000,
        })
        if (res.ok) return { ok: true, message: 'Claude 连接成功' }
        const errInfo = await parseAPIError(res, 'Claude')
        if (errInfo.status === 401) return { ok: false, message: 'Claude API Key 无效' }
        if (errInfo.status === 403) return { ok: false, message: 'Claude API Key 权限不足' }
        return { ok: false, message: errInfo.message }
      }
      if (this.config.provider === 'custom') {
        if (!this.config.customBaseUrl) return { ok: false, message: '请填写网关地址' }
        const baseUrl = this.config.customBaseUrl.replace(/\/$/, '')
        // 对网关类服务，发一个最小真实请求来验证模型渠道是否可用
        // 仅检查 /v1/models 不够 —— 网关可能列出模型但无可用渠道
        const res = await fetchWithTimeout(`${baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.customToken}`,
          },
          body: JSON.stringify({
            model: this.config.customModel,
            messages: [{ role: 'user', content: 'hi' }],
            max_tokens: 1,
          }),
          timeoutMs: 15_000,
        })
        if (res.ok) return { ok: true, message: `自定义服务连接成功（模型: ${this.config.customModel}）` }
        const errInfo = await parseAPIError(res, '自定义服务')
        // 针对常见网关错误给出友好提示
        if (errInfo.message.includes('无可用渠道')) {
          return { ok: false, message: `模型 "${this.config.customModel}" 在网关中无可用渠道，请检查网关配置` }
        }
        if (errInfo.status === 401) return { ok: false, message: 'Token 无效或已过期' }
        return { ok: false, message: errInfo.message }
      }
      return { ok: false, message: '未知的 provider' }
    } catch (e: any) {
      const msg = e?.message?.includes('超时') ? '连接超时，请检查网络' : `连接失败: ${e.message}`
      return { ok: false, message: msg }
    }
  }

  // ─── 重试引擎 ──────────────────────────────────────────────────────────────

  /**
   * 带指数退避 + jitter 的重试引擎。
   * - 可重试状态码：429 / 500 / 502 / 503 / 504
   * - 可重试网络错误：timeout / ECONNRESET / ECONNREFUSED 等
   * - 不可重试：400 / 401 / 403 / 404 及其他客户端错误
   * - AbortSignal 触发时立即停止
   */
  private async withRetry<T>(
    fn: () => Promise<T>,
    signal?: AbortSignal,
    maxRetries = 3,
  ): Promise<T> {
    let lastErr: any = new Error('unknown')

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

      try {
        return await fn()
      } catch (e: any) {
        if (e?.name === 'AbortError') throw e

        lastErr = e
        const isLast = attempt === maxRetries

        // 判断是否可重试
        const isRetryable = e?.retryable === true || isRetryableNetworkError(e)
        if (!isRetryable || isLast) break

        // 计算退避时间：指数退避 + 随机 jitter（防止惊群）
        const baseMs = e?.retryAfter ? e.retryAfter * 1000 : 1000 * 2 ** attempt
        const jitter = Math.random() * 500
        const delayMs = baseMs + jitter

        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, delayMs)
          signal?.addEventListener('abort', () => {
            clearTimeout(timer)
            reject(new DOMException('Aborted', 'AbortError'))
          }, { once: true })
        })
      }
    }

    // 构造最终错误信息
    const msg = lastErr?.message || String(lastErr)
    throw new Error(`${msg} (已重试 ${maxRetries} 次)`)
  }

  // ─── 统一请求方法 ──────────────────────────────────────────────────────────

  /** 发送 API 请求并处理错误，返回 Response（供流式和非流式共用） */
  private async apiRequest(
    url: string,
    init: RequestInit & { timeoutMs?: number },
    provider: string,
    signal?: AbortSignal,
  ): Promise<Response> {
    const res = await fetchWithTimeout(url, { ...init, signal, timeoutMs: init.timeoutMs ?? 30_000 })
    if (res.ok) return res

    const errInfo = await parseAPIError(res, provider)
    const err: any = new Error(errInfo.message)
    err.status = errInfo.status
    err.retryable = errInfo.retryable
    if (errInfo.retryAfter) err.retryAfter = errInfo.retryAfter
    throw err
  }

  // ─── 非流式调用（全部走重试） ──────────────────────────────────────────────

  private async callOllama(prompt: string, system?: string): Promise<string> {
    const messages: any[] = []
    if (system) messages.push({ role: 'system', content: system })
    messages.push({ role: 'user', content: prompt })

    return this.withRetry(async () => {
      const res = await this.apiRequest(
        `${this.config.ollamaBaseUrl}/api/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: this.config.ollamaModel, messages, stream: false }),
          timeoutMs: 60_000,
        },
        'Ollama',
      )
      const data: any = await res.json()
      return data.message?.content ?? ''
    })
  }

  private async callClaude(prompt: string, system?: string): Promise<string> {
    return this.withRetry(async () => {
      const res = await this.apiRequest(
        'https://api.anthropic.com/v1/messages',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.config.claudeApiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 8192,
            system: system ?? '',
            messages: [{ role: 'user', content: prompt }],
          }),
          timeoutMs: 30_000,
        },
        'Claude',
      )
      const data: any = await res.json()
      return data.content?.[0]?.text ?? ''
    })
  }

  private async callOpenAICompatible(url: string, apiKey: string, model: string, prompt: string, system?: string): Promise<string> {
    const messages: { role: string; content: string }[] = []
    if (system) messages.push({ role: 'system', content: system })
    messages.push({ role: 'user', content: prompt })

    return this.withRetry(async () => {
      const res = await this.apiRequest(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ model, messages, max_tokens: 8192 }),
          timeoutMs: 30_000,
        },
        'OpenAI',
      )
      const data: any = await res.json()
      return data.choices?.[0]?.message?.content ?? ''
    })
  }

  private async callOpenAI(prompt: string, system?: string): Promise<string> {
    return this.callOpenAICompatible(
      'https://api.openai.com/v1/chat/completions',
      this.config.openaiApiKey,
      this.config.openaiModel,
      prompt,
      system,
    )
  }

  private async callCustom(prompt: string, system?: string): Promise<string> {
    const baseUrl = this.config.customBaseUrl.replace(/\/$/, '')
    return this.callOpenAICompatible(
      `${baseUrl}/v1/chat/completions`,
      this.config.customToken,
      this.config.customModel,
      prompt,
      system,
    )
  }

  private async call(prompt: string, system?: string): Promise<string> {
    switch (this.config.provider) {
      case 'ollama':
        return this.callOllama(prompt, system)
      case 'claude':
        return this.callClaude(prompt, system)
      case 'openai':
        return this.callOpenAI(prompt, system)
      case 'custom':
        return this.callCustom(prompt, system)
    }
  }

  async summarize(content: string): Promise<{ summary: string; keyPoints: string[] }> {
    this.ensureConfig()
    const system =
      '你是一个笔记助手，专门帮助用户整理和总结笔记内容。请用中文回答。'
    const prompt = `请对以下笔记内容进行总结：
1. 生成一个3-5句话的摘要
2. 提取5个关键要点，以JSON数组形式返回

请严格按以下JSON格式输出（不要有其他文字）：
{
  "summary": "摘要内容",
  "keyPoints": ["要点1", "要点2", "要点3", "要点4", "要点5"]
}

笔记内容：
${content.slice(0, 4000)}`

    try {
      const raw = await this.call(prompt, system)
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        return {
          summary: parsed.summary ?? '',
          keyPoints: parsed.keyPoints ?? [],
        }
      }
      return { summary: raw.slice(0, 500), keyPoints: [] }
    } catch (e: any) {
      throw new Error(`AI 摘要失败: ${e.message}`)
    }
  }

  async extractKeyPoints(content: string): Promise<string[]> {
    this.ensureConfig()
    const system = '你是一个笔记助手。请用中文回答。'
    const prompt = `请从以下笔记中提取5-8个关键要点，以JSON数组格式输出（只输出数组，不要其他文字）：
["要点1", "要点2", ...]

笔记内容：
${content.slice(0, 4000)}`

    try {
      const raw = await this.call(prompt, system)
      const arrayMatch = raw.match(/\[[\s\S]*\]/)
      if (arrayMatch) return JSON.parse(arrayMatch[0])
      return []
    } catch {
      return []
    }
  }

  async parseReminder(text: string): Promise<{
    title: string
    dueDate: string | null
    repeatRule: string | null
    confidence: number
  }> {
    this.ensureConfig()
    const now = new Date()
    const system = `你是一个时间解析助手。当前时间: ${now.toISOString()}（北京时间 UTC+8）。请用中文解析用户输入的提醒信息。`
    const prompt = `请解析以下提醒文本，提取出提醒标题、时间和重复规则。

输出严格按以下JSON格式（不要有其他文字）：
{
  "title": "提醒标题（精简的事项名称）",
  "dueDate": "ISO 8601格式的时间，如2026-04-05T10:00:00+08:00，如果没有明确时间则为null",
  "repeatRule": "none/daily/weekly/monthly，如果不重复则为null",
  "confidence": 0.9
}

提醒文本：${text}`

    try {
      const raw = await this.call(prompt, system)
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }
      return { title: text, dueDate: null, repeatRule: null, confidence: 0.3 }
    } catch {
      return { title: text, dueDate: null, repeatRule: null, confidence: 0.1 }
    }
  }

  async autocomplete(context: string): Promise<string> {
    this.ensureConfig()
    const system = '你是一个写作助手，帮助用户续写内容。输出续写文本，不要重复已有内容，不要解释。'
    const prompt = `请续写以下内容（输出30-80个字的续写，只输出续写部分）：
...${context.slice(-300)}`

    try {
      return await this.call(prompt, system)
    } catch {
      return ''
    }
  }

  // ─── 流式读取工具 ────────────────────────────────────────────────────────

  /**
   * 带超时检测的 SSE 流读取器。
   * 如果连续 stallTimeoutMs 毫秒没收到任何数据，则中断读取并抛出错误。
   */
  private async readSSEStream(
    res: Response,
    onLine: (line: string) => void,
    signal: AbortSignal,
    stallTimeoutMs = 30_000,
  ): Promise<void> {
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    let stallTimer: ReturnType<typeof setTimeout> | null = null

    const resetStallTimer = () => {
      if (stallTimer) clearTimeout(stallTimer)
      stallTimer = setTimeout(() => {
        reader.cancel('stream stalled').catch(() => {})
      }, stallTimeoutMs)
    }

    try {
      resetStallTimer()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        resetStallTimer()

        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop()!
        for (const line of lines) {
          onLine(line)
        }
      }
    } catch (e: any) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      if (String(e).includes('stream stalled')) {
        throw new Error('流式响应超时：服务端长时间未返回数据')
      }
      throw e
    } finally {
      if (stallTimer) clearTimeout(stallTimer)
    }
  }

  // ─── Streaming Chat ───────────────────────────────────────────────────────

  private async streamOllama(
    messages: { role: string; content: string; images?: { base64: string; mimeType: string }[] }[],
    onChunk: (delta: string) => void,
    signal: AbortSignal,
  ): Promise<void> {
    const ollamaMessages = messages.map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.images && m.images.length > 0 ? { images: m.images.map((img) => img.base64) } : {}),
    }))

    const res = await this.withRetry(async () => {
      return this.apiRequest(
        `${this.config.ollamaBaseUrl}/api/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: this.config.ollamaModel, messages: ollamaMessages, stream: true }),
          timeoutMs: 30_000,
        },
        'Ollama',
        signal,
      )
    }, signal)

    await this.readSSEStream(res, (line) => {
      if (!line.trim()) return
      try {
        const json = JSON.parse(line)
        if (json.message?.content) onChunk(json.message.content)
      } catch {}
    }, signal, 60_000)
  }

  private async streamClaude(
    messages: { role: string; content: string; images?: { base64: string; mimeType: string }[] }[],
    onChunk: (delta: string) => void,
    signal: AbortSignal,
  ): Promise<void> {
    const systemMsg = messages.find((m) => m.role === 'system')
    const chatMsgs = messages.filter((m) => m.role !== 'system')

    const claudeMessages = chatMsgs.map((m) => {
      if (m.images && m.images.length > 0) {
        const content: any[] = []
        for (const img of m.images) {
          content.push({
            type: 'image',
            source: { type: 'base64', media_type: img.mimeType, data: img.base64 },
          })
        }
        content.push({ type: 'text', text: m.content })
        return { role: m.role, content }
      }
      return { role: m.role, content: m.content }
    })

    const res = await this.withRetry(async () => {
      return this.apiRequest(
        'https://api.anthropic.com/v1/messages',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.config.claudeApiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 8192,
            stream: true,
            messages: claudeMessages,
          }),
          timeoutMs: 30_000,
        },
        'Claude',
        signal,
      )
    }, signal)

    await this.readSSEStream(res, (line) => {
      if (!line.startsWith('data: ')) return
      const data = line.slice(6)
      if (data === '[DONE]') return
      try {
        const json = JSON.parse(data)
        if (json.type === 'content_block_delta' && json.delta?.text) {
          onChunk(json.delta.text)
        }
      } catch {}
    }, signal)
  }

  private async streamOpenAI(
    url: string,
    apiKey: string,
    model: string,
    messages: { role: string; content: string; images?: { base64: string; mimeType: string }[] }[],
    onChunk: (delta: string) => void,
    signal: AbortSignal,
  ): Promise<void> {
    // Vision 模型白名单校验
    const hasImages = messages.some((m) => m.images && m.images.length > 0)
    if (hasImages) {
      const visionModels = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4-vision-preview']
      const isVision = visionModels.some((v) => model.startsWith(v))
      if (!isVision) {
        throw new Error(`模型 "${model}" 不支持图片输入，请在设置中切换为支持 Vision 的模型（如 gpt-4o 或 gpt-4o-mini）`)
      }
    }

    const openaiMessages = messages.map((m) => {
      if (m.images && m.images.length > 0) {
        const content: any[] = []
        for (const img of m.images) {
          content.push({
            type: 'image_url',
            image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
          })
        }
        content.push({ type: 'text', text: m.content || '请分析图片' })
        return { role: m.role, content }
      }
      return { role: m.role, content: m.content }
    })

    const res = await this.withRetry(async () => {
      return this.apiRequest(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ model, messages: openaiMessages, max_tokens: 8192, stream: true }),
          timeoutMs: 30_000,
        },
        'OpenAI',
        signal,
      )
    }, signal)

    await this.readSSEStream(res, (line) => {
      if (!line.startsWith('data: ')) return
      const data = line.slice(6)
      if (data === '[DONE]') return
      try {
        const json = JSON.parse(data)
        const delta = json.choices?.[0]?.delta?.content
        if (delta) onChunk(delta)
      } catch {}
    }, signal)
  }

  async chatStream(
    messages: { role: string; content: string; images?: { base64: string; mimeType: string }[] }[],
    onChunk: (delta: string) => void,
    signal: AbortSignal,
  ): Promise<void> {
    this.ensureConfig()
    switch (this.config.provider) {
      case 'ollama':
        return this.streamOllama(messages, onChunk, signal)
      case 'claude':
        return this.streamClaude(messages, onChunk, signal)
      case 'openai':
        return this.streamOpenAI(
          'https://api.openai.com/v1/chat/completions',
          this.config.openaiApiKey,
          this.config.openaiModel,
          messages,
          onChunk,
          signal,
        )
      case 'custom': {
        const baseUrl = this.config.customBaseUrl.replace(/\/$/, '')
        return this.streamOpenAI(
          `${baseUrl}/v1/chat/completions`,
          this.config.customToken,
          this.config.customModel,
          messages,
          onChunk,
          signal,
        )
      }
    }
  }
}

export const aiService = new AIService()
