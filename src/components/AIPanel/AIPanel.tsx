import { useEffect, useRef } from 'react'
import { useNotesStore } from '../../store/notesStore'
import { useChatStore } from '../../store/chatStore'
import { Sparkles, Trash2 } from 'lucide-react'
import { ChatMessageBubble, StreamingBubble } from './ChatMessageBubble'
import { ChatInput } from './ChatInput'
import { SkillSelector } from './SkillSelector'
import { AgentStatusBar } from './AgentStatusBar'

export function AIPanel() {
  const { selectedNote, noteContent } = useNotesStore()
  const {
    messages, isStreaming, streamingContent, error,
    sendMessage, stopStreaming, clearChat,
    agentEnabled, agentPhase, agentIteration, agentMaxIterations,
    lastReflection, loadAgentEnabled,
  } = useChatStore()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const prevNoteIdRef = useRef<string | null>(null)

  // Load agent config on mount
  useEffect(() => {
    loadAgentEnabled()
  }, [])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent, agentPhase])

  // Clear chat when switching notes
  useEffect(() => {
    if (selectedNote?.id !== prevNoteIdRef.current) {
      if (prevNoteIdRef.current !== null) {
        clearChat()
      }
      prevNoteIdRef.current = selectedNote?.id ?? null
    }
  }, [selectedNote?.id])

  const handleSend = (content: string, attachments?: import('../../types').ChatAttachment[]) => {
    const plainText = noteContent
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    sendMessage(content, plainText || undefined, selectedNote?.title || undefined, attachments)
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-ai-500" />
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">AI 助手</span>
          {agentEnabled && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-ai-500/10 text-ai-500 font-medium">
              Agent
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"
              title="清空对话"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Skill Selector */}
      <SkillSelector />

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-3">
        {messages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center py-8 text-gray-400 dark:text-gray-600 gap-2 text-center">
            <Sparkles size={24} strokeWidth={1} />
            <p className="text-xs">输入消息与 AI 对话</p>
            <p className="text-[10px]">
              {agentEnabled ? 'Agent 模式已开启，AI 会自动反思和改进回答' : 'AI 可以感知当前笔记内容'}
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <ChatMessageBubble key={msg.id} message={msg} />
        ))}

        {/* Agent Status Bar */}
        {isStreaming && agentEnabled && agentPhase && agentPhase !== 'act' && (
          <AgentStatusBar
            phase={agentPhase}
            iteration={agentIteration}
            maxIterations={agentMaxIterations}
            score={lastReflection?.weightedScore}
          />
        )}

        {isStreaming && <StreamingBubble content={streamingContent} />}

        {error && (
          <div className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-2.5 mb-3">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Chat Input */}
      <ChatInput
        onSend={handleSend}
        onStop={stopStreaming}
        isStreaming={isStreaming}
        disabled={!selectedNote}
      />
    </div>
  )
}
