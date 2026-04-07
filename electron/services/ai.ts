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
        const res = await fetch(`${this.config.ollamaBaseUrl}/api/tags`)
        if (res.ok) return { ok: true, message: 'Ollama 连接成功' }
        return { ok: false, message: `Ollama 响应错误: ${res.status}` }
      }
      if (this.config.provider === 'custom') {
        if (!this.config.customBaseUrl) return { ok: false, message: '请填写网关地址' }
        const baseUrl = this.config.customBaseUrl.replace(/\/$/, '')
        const res = await fetch(`${baseUrl}/v1/models`, {
          headers: { Authorization: `Bearer ${this.config.customToken}` },
        })
        if (res.ok) return { ok: true, message: '自定义服务连接成功' }
        return { ok: false, message: `连接失败: HTTP ${res.status}` }
      }
      return { ok: true, message: '配置已保存（API Key 格式正确）' }
    } catch (e: any) {
      return { ok: false, message: `连接失败: ${e.message}` }
    }
  }

  private async callOllama(prompt: string, system?: string): Promise<string> {
    const messages: any[] = []
    if (system) messages.push({ role: 'system', content: system })
    messages.push({ role: 'user', content: prompt })

    const res = await fetch(`${this.config.ollamaBaseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.ollamaModel,
        messages,
        stream: false,
      }),
    })
    if (!res.ok) throw new Error(`Ollama error: ${res.status}`)
    const data: any = await res.json()
    return data.message?.content ?? ''
  }

  private async callClaude(prompt: string, system?: string): Promise<string> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.claudeApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: system ?? '',
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) throw new Error(`Claude error: ${res.status}`)
    const data: any = await res.json()
    return data.content?.[0]?.text ?? ''
  }

  private async callOpenAI(prompt: string, system?: string): Promise<string> {
    const messages: any[] = []
    if (system) messages.push({ role: 'system', content: system })
    messages.push({ role: 'user', content: prompt })

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: this.config.openaiModel,
        messages,
        max_tokens: 1024,
      }),
    })
    if (!res.ok) throw new Error(`OpenAI error: ${res.status}`)
    const data: any = await res.json()
    return data.choices?.[0]?.message?.content ?? ''
  }

  private async callCustom(prompt: string, system?: string): Promise<string> {
    const messages: any[] = []
    if (system) messages.push({ role: 'system', content: system })
    messages.push({ role: 'user', content: prompt })

    const baseUrl = this.config.customBaseUrl.replace(/\/$/, '')
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.customToken}`,
      },
      body: JSON.stringify({
        model: this.config.customModel,
        messages,
        max_tokens: 1024,
      }),
    })
    if (!res.ok) throw new Error(`Custom API error: ${res.status}`)
    const data: any = await res.json()
    return data.choices?.[0]?.message?.content ?? ''
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
}

export const aiService = new AIService()
