import { create } from 'zustand'
import type { ChatMessage, ChatNoteAction, ChatAttachment, AgentPhase, AgentChunk, ReflectionResult, AgentMeta, ImageData, SkillReflectionCriteria } from '../types'
import { useSkillStore } from './skillStore'

interface ChatState {
  messages: ChatMessage[]
  isStreaming: boolean
  streamingContent: string
  currentSessionId: string | null
  error: string | null

  // Agent 反思状态
  agentEnabled: boolean
  agentPhase: AgentPhase | null
  agentIteration: number
  agentMaxIterations: number
  lastReflection: ReflectionResult | null
  lastAgentMeta: AgentMeta | null

  sendMessage: (content: string, noteContext?: string, noteTitle?: string, attachments?: ChatAttachment[]) => void
  stopStreaming: () => void
  clearChat: () => void
  setAgentEnabled: (enabled: boolean) => void
  loadAgentEnabled: () => void
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function extractAction(content: string): ChatNoteAction | undefined {
  const match = content.match(/```noteaction\s*\n([\s\S]*?)\n```/)
  if (!match) return undefined
  try {
    const parsed = JSON.parse(match[1])
    if (parsed.type && parsed.content) {
      return {
        type: parsed.type === 'replace' ? 'replace' : 'insert',
        content: parsed.content,
        description: parsed.description || '',
      }
    }
  } catch {}
  return undefined
}

export function stripActionBlock(content: string): string {
  return content.replace(/```noteaction\s*\n[\s\S]*?\n```/, '').trim()
}

// ─── Payload 构建 ────────────────────────────────────────────────────────────

interface MessagePayload {
  sessionId: string
  messagesWithImages: { role: 'user' | 'assistant'; content: string; images?: ImageData[] }[]
  skillSystemPrompt?: string
  skillReflectionCriteria?: SkillReflectionCriteria
}

function buildMessagePayload(
  content: string,
  attachments: ChatAttachment[] | undefined,
  history: ChatMessage[],
  noteContext?: string,
  noteTitle?: string,
): MessagePayload {
  const sessionId = generateId()

  let enhancedContent = content
  const imageDataList: ImageData[] = []

  if (attachments && attachments.length > 0) {
    for (const att of attachments) {
      if (att.type === 'image' && att.base64) {
        imageDataList.push({ base64: att.base64, mimeType: att.mimeType || 'image/png' })
      }
      if (att.textContent) {
        enhancedContent += `\n\n[附件: ${att.filename}]\n${att.textContent}`
      }
    }
  }

  const activeSkill = useSkillStore.getState().activeSkill
  let skillSystemPrompt: string | undefined
  let skillReflectionCriteria: SkillReflectionCriteria | undefined
  let finalContent = enhancedContent

  if (activeSkill && activeSkill.execute) {
    const skillResult = activeSkill.execute(enhancedContent, {
      noteTitle,
      noteContent: noteContext,
      attachments,
      chatHistory: history.map((m) => ({ role: m.role, content: m.content })),
    })
    if (skillResult.systemPrompt) skillSystemPrompt = skillResult.systemPrompt
    if (skillResult.userPrompt) finalContent = skillResult.userPrompt
    if (activeSkill.reflectionCriteria) {
      skillReflectionCriteria = activeSkill.reflectionCriteria
    }
  }

  const historyForAPI = [...history].map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))

  // 最后一条消息使用处理后的 finalContent（含附件文本 + skill prompt）
  if (historyForAPI.length > 0) {
    historyForAPI[historyForAPI.length - 1].content = finalContent
  }

  const messagesWithImages = historyForAPI.map((m, i) =>
    i === historyForAPI.length - 1 && imageDataList.length > 0
      ? { ...m, images: imageDataList }
      : m,
  )

  return { sessionId, messagesWithImages, skillSystemPrompt, skillReflectionCriteria }
}

// ─── 流结束时构建 assistant 消息 ─────────────────────────────────────────────

function buildAssistantMsg(
  finalContent: string,
  activeSkill: ReturnType<typeof useSkillStore.getState>['activeSkill'],
  reflection?: ReflectionResult,
  agentMeta?: AgentMeta,
): { finalContent: string; msg: ChatMessage } {
  let processed = finalContent
  if (activeSkill?.execute) {
    const skillResult = activeSkill.execute('', { chatHistory: [] })
    if (skillResult.postProcess) processed = skillResult.postProcess(processed)
  }
  const action = extractAction(processed)
  return {
    finalContent: processed,
    msg: {
      id: generateId(),
      role: 'assistant',
      content: processed,
      timestamp: Date.now(),
      action,
      ...(reflection ? { reflection } : {}),
      ...(agentMeta ? { agentMeta } : {}),
    },
  }
}

// ─── 停止当前 session ────────────────────────────────────────────────────────

function stopSession(sessionId: string, agentEnabled: boolean) {
  if (agentEnabled) {
    window.electronAPI.ai.agentStop(sessionId)
  } else {
    window.electronAPI.ai.chatStop(sessionId)
  }
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isStreaming: false,
  streamingContent: '',
  currentSessionId: null,
  error: null,

  agentEnabled: true,
  agentPhase: null,
  agentIteration: 0,
  agentMaxIterations: 0,
  lastReflection: null,
  lastAgentMeta: null,

  loadAgentEnabled: () => {
    window.electronAPI.ai.getAgentConfig().then((cfg) => {
      set({ agentEnabled: cfg.enabled })
    }).catch(() => {})
  },

  setAgentEnabled: (enabled) => {
    set({ agentEnabled: enabled })
    window.electronAPI.ai.setAgentConfig({ enabled }).catch(() => {})
  },

  sendMessage: (content, noteContext, noteTitle, attachments) => {
    const activeSkill = useSkillStore.getState().activeSkill

    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: Date.now(),
      attachments,
    }

    set((s) => ({
      messages: [...s.messages, userMsg],
      isStreaming: true,
      streamingContent: '',
      error: null,
      agentPhase: null,
      agentIteration: 0,
      agentMaxIterations: 0,
      lastReflection: null,
      lastAgentMeta: null,
    }))

    const { sessionId, messagesWithImages, skillSystemPrompt, skillReflectionCriteria } =
      buildMessagePayload(content, attachments, get().messages, noteContext, noteTitle)

    set({ currentSessionId: sessionId })

    const { agentEnabled } = get()

    if (agentEnabled) {
      runAgentMode(sessionId, messagesWithImages, noteContext, noteTitle, skillSystemPrompt, skillReflectionCriteria, activeSkill, set, get)
    } else {
      runChatMode(sessionId, messagesWithImages, noteContext, noteTitle, skillSystemPrompt, activeSkill, set, get)
    }
  },

  stopStreaming: () => {
    const { currentSessionId, streamingContent, agentEnabled } = get()
    if (currentSessionId) {
      stopSession(currentSessionId, agentEnabled)
    }
    if (streamingContent) {
      const action = extractAction(streamingContent)
      const assistantMsg: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: streamingContent,
        timestamp: Date.now(),
        action,
      }
      set((s) => ({
        messages: [...s.messages, assistantMsg],
        isStreaming: false,
        streamingContent: '',
        currentSessionId: null,
        agentPhase: null,
      }))
    } else {
      set({ isStreaming: false, streamingContent: '', currentSessionId: null, agentPhase: null })
    }
  },

  clearChat: () => {
    const { currentSessionId, agentEnabled } = get()
    if (currentSessionId) {
      stopSession(currentSessionId, agentEnabled)
    }
    set({
      messages: [],
      isStreaming: false,
      streamingContent: '',
      currentSessionId: null,
      error: null,
      agentPhase: null,
      agentIteration: 0,
      agentMaxIterations: 0,
      lastReflection: null,
      lastAgentMeta: null,
    })
  },
}))

// ─── Agent 模式 ──────────────────────────────────────────────────────────────

type SetFn = Parameters<Parameters<typeof create<ChatState>>[0]>[0]
type GetFn = Parameters<Parameters<typeof create<ChatState>>[0]>[1]

function runAgentMode(
  sessionId: string,
  messagesWithImages: MessagePayload['messagesWithImages'],
  noteContext: string | undefined,
  noteTitle: string | undefined,
  skillSystemPrompt: string | undefined,
  skillReflectionCriteria: SkillReflectionCriteria | undefined,
  activeSkill: ReturnType<typeof useSkillStore.getState>['activeSkill'],
  set: SetFn,
  get: GetFn,
) {
  const agentChunkHandler = (chunk: AgentChunk) => {
    if (chunk.sessionId !== sessionId) return

    if (chunk.phase === 'error') {
      set({ error: chunk.error || 'Agent 运行错误', isStreaming: false, streamingContent: '', agentPhase: 'error' })
      window.electronAPI.off('ai:agentChunk', agentChunkHandler)
      return
    }

    if (chunk.phase === 'done') {
      const rawContent = chunk.finalContent || get().streamingContent
      if (rawContent) {
        const { msg } = buildAssistantMsg(rawContent, activeSkill, get().lastReflection ?? undefined, chunk.meta)
        set((s) => ({
          messages: [...s.messages, msg],
          isStreaming: false,
          streamingContent: '',
          currentSessionId: null,
          agentPhase: 'done',
          lastAgentMeta: chunk.meta || null,
        }))
      } else {
        set({ isStreaming: false, currentSessionId: null, agentPhase: 'done' })
      }
      window.electronAPI.off('ai:agentChunk', agentChunkHandler)
      return
    }

    if (chunk.phase === 'act' && chunk.delta) {
      set((s) => ({
        streamingContent: s.streamingContent + chunk.delta,
        agentPhase: 'act',
        agentIteration: chunk.iteration,
        agentMaxIterations: chunk.maxIterations,
      }))
      return
    }

    if (chunk.phase === 'act' && !chunk.delta) {
      set({ streamingContent: '', agentPhase: 'act', agentIteration: chunk.iteration, agentMaxIterations: chunk.maxIterations })
      return
    }

    if (chunk.phase === 'reflect' && chunk.reflection) {
      set({ lastReflection: chunk.reflection, agentPhase: 'reflect', agentIteration: chunk.iteration, agentMaxIterations: chunk.maxIterations })
      return
    }

    set({ agentPhase: chunk.phase, agentIteration: chunk.iteration, agentMaxIterations: chunk.maxIterations })
  }

  window.electronAPI.on('ai:agentChunk', agentChunkHandler)

  window.electronAPI.ai
    .agentStart({ sessionId, messages: messagesWithImages, noteContext, noteTitle, skillSystemPrompt, skillReflectionCriteria })
    .catch((err: Error) => {
      set({ error: err.message || 'Agent 启动失败', isStreaming: false })
      window.electronAPI.off('ai:agentChunk', agentChunkHandler)
    })
}

// ─── 普通模式 ────────────────────────────────────────────────────────────────

function runChatMode(
  sessionId: string,
  messagesWithImages: MessagePayload['messagesWithImages'],
  noteContext: string | undefined,
  noteTitle: string | undefined,
  skillSystemPrompt: string | undefined,
  activeSkill: ReturnType<typeof useSkillStore.getState>['activeSkill'],
  set: SetFn,
  get: GetFn,
) {
  const chunkHandler = (chunk: { sessionId: string; delta?: string; done?: boolean; error?: string }) => {
    if (chunk.sessionId !== sessionId) return

    if (chunk.error) {
      set({ error: chunk.error, isStreaming: false, streamingContent: '' })
      window.electronAPI.off('ai:chatChunk', chunkHandler)
      return
    }

    if (chunk.done) {
      const rawContent = get().streamingContent
      if (rawContent) {
        const { msg } = buildAssistantMsg(rawContent, activeSkill)
        set((s) => ({
          messages: [...s.messages, msg],
          isStreaming: false,
          streamingContent: '',
          currentSessionId: null,
        }))
      } else {
        set({ isStreaming: false, currentSessionId: null })
      }
      window.electronAPI.off('ai:chatChunk', chunkHandler)
      return
    }

    set((s) => ({ streamingContent: s.streamingContent + chunk.delta }))
  }

  window.electronAPI.on('ai:chatChunk', chunkHandler)

  window.electronAPI.ai
    .chatStart({ sessionId, messages: messagesWithImages, noteContext, noteTitle, skillSystemPrompt })
    .catch((err: Error) => {
      set({ error: err.message || 'AI 服务错误', isStreaming: false })
      window.electronAPI.off('ai:chatChunk', chunkHandler)
    })
}
