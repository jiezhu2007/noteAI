export interface Folder {
  id: string
  name: string
  parent_id: string | null
  sort_order: number
  created_at: number
  updated_at: number
}

export interface Note {
  id: string
  title: string
  folder_id: string | null
  file_path: string
  is_pinned: number
  is_archived: number
  is_deleted: number
  deleted_at: number | null
  created_at: number
  updated_at: number
  tag_ids?: string
  tag_names?: string
  preview?: string
}

export interface Tag {
  id: string
  name: string
  color: string
}

export interface Reminder {
  id: string
  title: string
  notes: string | null
  due_date: number | null
  priority: 0 | 1 | 2 | 3
  is_completed: number
  completed_at: number | null
  repeat_rule: string | null
  list_id: string | null
  linked_note_id: string | null
  created_at: number
  updated_at: number
}

export interface ReminderList {
  id: string
  name: string
  color: string
  sort_order: number
}

export type ReminderPriority = 'none' | 'low' | 'medium' | 'high'

// ─── AI Chat Types ──────────────────────────────────────────────────────────

export interface ChatAttachment {
  id: string
  filename: string
  ext: string
  mimeType: string
  size: number
  type: 'image' | 'text' | 'data'
  base64?: string
  textContent?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  action?: ChatNoteAction
  attachments?: ChatAttachment[]
  reflection?: ReflectionResult
  agentMeta?: AgentMeta
}

export interface ChatNoteAction {
  type: 'insert' | 'replace'
  content: string
  description: string
}

export interface ChatStreamChunk {
  sessionId: string
  delta: string
  done: boolean
  error?: string
}

export interface ImageData {
  base64: string
  mimeType: string
}

export interface ChatRequest {
  sessionId: string
  messages: { role: 'user' | 'assistant'; content: string; images?: ImageData[] }[]
  noteContext?: string
  noteTitle?: string
  skillSystemPrompt?: string
}

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

// ─── Reflective Agent Types ─────────────────────────────────────────────────

export interface AgentConfig {
  enabled: boolean              // 反思总开关
  defaultLevel: 0 | 1 | 2 | 3  // 默认反思级别
  passThreshold: number         // 通过阈值 (5.0 - 9.0)
  maxTokenBudget: number        // 单次 Agent 运行 Token 预算
  autoClassify: boolean         // 是否自动分级
  reflectThreshold: number      // 低于此分数触发自动继续（0-10，默认 7.0）
  maxReflectExtra: number       // 未通过后最多追加的反思轮次（默认 2）
}

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  enabled: true,
  defaultLevel: 2,
  passThreshold: 7.0,
  maxTokenBudget: 16384,
  autoClassify: true,
  reflectThreshold: 7.0,
  maxReflectExtra: 2,
}

export type AgentPhase = 'think' | 'act' | 'reflect' | 'improve' | 'done' | 'error'

export interface AgentChunk {
  sessionId: string
  phase: AgentPhase
  iteration: number
  maxIterations: number
  delta?: string                 // phase=act 时的流式文本
  reflection?: ReflectionResult  // phase=reflect 时的评估结果
  finalContent?: string          // phase=done 时的最终内容
  meta?: AgentMeta               // phase=done 时的运行统计
  error?: string                 // phase=error 时的错误信息
}

export interface ReflectionResult {
  accuracy: { score: number; reason: string }
  completeness: { score: number; reason: string }
  formatting: { score: number; reason: string }
  relevance: { score: number; reason: string }
  clarity: { score: number; reason: string }
  weightedScore: number
  pass: boolean
  improvements: string[]
}

export interface AgentMeta {
  totalTokens: number
  iterations: number
  totalDurationMs: number
  phases: {
    phase: string
    tokens: number
    durationMs: number
  }[]
}

export interface AgentRequest {
  sessionId: string
  messages: { role: 'user' | 'assistant'; content: string; images?: ImageData[] }[]
  noteContext?: string
  noteTitle?: string
  skillSystemPrompt?: string
  skillReflectionCriteria?: SkillReflectionCriteria
  agentConfig?: Partial<AgentConfig>
}

export interface SkillReflectionCriteria {
  weights?: Partial<Record<'accuracy' | 'completeness' | 'formatting' | 'relevance' | 'clarity', number>>
  extraCriteria?: string
  forceLevel?: 0 | 1 | 2 | 3
  passThreshold?: number
}

// Extend Window with Electron API
declare global {
  interface Window {
    electronAPI: {
      notes: {
        getAll: () => Promise<Note[]>
        create: (data: { title?: string; folderId?: string; content?: string }) => Promise<Note>
        update: (id: string, data: {
          title?: string
          folderId?: string | null
          isPinned?: boolean
          isArchived?: boolean
          isDeleted?: boolean
        }) => Promise<Note>
        delete: (id: string) => Promise<void>
        getContent: (filePath: string) => Promise<string>
        saveContent: (filePath: string, content: string) => Promise<boolean>
        search: (query: string) => Promise<Note[]>
      }
      folders: {
        getAll: () => Promise<Folder[]>
        create: (data: { name: string; parentId?: string }) => Promise<Folder>
        update: (id: string, data: any) => Promise<Folder>
        delete: (id: string) => Promise<void>
      }
      tags: {
        getAll: () => Promise<Tag[]>
        create: (name: string, color?: string) => Promise<Tag>
        setNoteTags: (noteId: string, tagIds: string[]) => Promise<void>
      }
      reminders: {
        getAll: () => Promise<Reminder[]>
        create: (data: any) => Promise<Reminder>
        update: (id: string, data: any) => Promise<Reminder>
        delete: (id: string) => Promise<void>
        complete: (id: string) => Promise<Reminder>
        getLists: () => Promise<ReminderList[]>
        createList: (data: { name: string; color?: string }) => Promise<ReminderList>
      }
      ai: {
        summarize: (content: string) => Promise<{ summary: string; keyPoints: string[] }>
        extractPoints: (content: string) => Promise<string[]>
        parseReminder: (text: string) => Promise<{
          title: string
          dueDate: string | null
          repeatRule: string | null
          confidence: number
        }>
        autocomplete: (context: string) => Promise<string>
        getConfig: () => Promise<AIConfig>
        setConfig: (config: Partial<AIConfig>) => Promise<AIConfig>
        testConnection: () => Promise<{ ok: boolean; message: string }>
        chatStart: (request: ChatRequest) => Promise<string>
        chatStop: (sessionId: string) => Promise<void>
        agentStart: (request: AgentRequest) => Promise<string>
        agentStop: (sessionId: string) => Promise<void>
        getAgentConfig: () => Promise<AgentConfig>
        setAgentConfig: (config: Partial<AgentConfig>) => Promise<AgentConfig>
      }
      attachments: {
        pick: () => Promise<ChatAttachment | null>
        processPath: (filePath: string) => Promise<ChatAttachment | null>
      }
      skills: {
        getConfig: () => Promise<{ disabledSkillIds: string[]; customSkills: any[] }>
        setConfig: (config: { disabledSkillIds: string[]; customSkills: any[] }) => Promise<any>
      }
      on: (channel: string, callback: (...args: any[]) => void) => (...args: any[]) => void
      off: (channel: string, wrapper: (...args: any[]) => void) => void
    }
  }
}
