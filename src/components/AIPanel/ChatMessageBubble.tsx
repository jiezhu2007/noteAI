import { useNotesStore } from '../../store/notesStore'
import { stripActionBlock } from '../../store/chatStore'
import { AttachmentChip } from './AttachmentChip'
import { ReflectionBubble } from './ReflectionBubble'
import type { ChatMessage } from '../../types'
import { FileText } from 'lucide-react'

interface ChatMessageBubbleProps {
  message: ChatMessage
}

export function ChatMessageBubble({ message }: ChatMessageBubbleProps) {
  const applyAIContent = useNotesStore((s) => s.applyAIContent)
  const isUser = message.role === 'user'
  const displayContent = isUser ? message.content : stripActionBlock(message.content)

  const handleApply = () => {
    if (!message.action) return
    applyAIContent(message.action.content, message.action.type)
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
          isUser
            ? 'bg-ai-500 text-white rounded-br-sm'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-bl-sm'
        }`}
      >
        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {message.attachments.map((att) => (
              <AttachmentChip key={att.id} attachment={att} />
            ))}
          </div>
        )}

        <div className="whitespace-pre-wrap break-words">{displayContent}</div>
        {!isUser && message.action && (
          <button
            onClick={handleApply}
            className="mt-2 flex items-center gap-1 px-2 py-1 rounded-md bg-ai-500/10 hover:bg-ai-500/20 text-ai-600 dark:text-ai-400 text-xs font-medium transition-colors"
          >
            <FileText size={12} />
            应用到笔记 ({message.action.type === 'replace' ? '替换' : '插入'})
          </button>
        )}

        {/* Reflection details */}
        {!isUser && message.reflection && (
          <ReflectionBubble reflection={message.reflection} meta={message.agentMeta} />
        )}
      </div>
    </div>
  )
}

interface StreamingBubbleProps {
  content: string
}

export function StreamingBubble({ content }: StreamingBubbleProps) {
  if (!content) return null
  return (
    <div className="flex justify-start mb-3">
      <div className="max-w-[85%] rounded-xl rounded-bl-sm px-3 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs leading-relaxed">
        <div className="whitespace-pre-wrap break-words">
          {content}
          <span className="inline-block w-1.5 h-3.5 bg-ai-500 animate-pulse ml-0.5 -mb-0.5 rounded-sm" />
        </div>
      </div>
    </div>
  )
}
