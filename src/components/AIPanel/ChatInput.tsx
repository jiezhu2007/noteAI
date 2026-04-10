import { useState, useRef, useEffect } from 'react'
import { Send, Square, Paperclip } from 'lucide-react'
import { AttachmentChip } from './AttachmentChip'
import type { ChatAttachment } from '../../types'

interface ChatInputProps {
  onSend: (content: string, attachments?: ChatAttachment[]) => void
  onStop: () => void
  isStreaming: boolean
  disabled?: boolean
}

export function ChatInput({ onSend, onStop, isStreaming, disabled }: ChatInputProps) {
  const [text, setText] = useState('')
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px'
    }
  }, [text])

  const handleSend = () => {
    const trimmed = text.trim()
    if ((!trimmed && pendingAttachments.length === 0) || isStreaming) return
    onSend(trimmed || '请分析这些文件', pendingAttachments.length > 0 ? pendingAttachments : undefined)
    setText('')
    setPendingAttachments([])
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handlePickFile = async () => {
    try {
      const result = await window.electronAPI.attachments.pick()
      if (result) {
        setPendingAttachments((prev) => [...prev, result])
      }
    } catch (e) {
      console.error('Failed to pick file:', e)
    }
  }

  const handleRemoveAttachment = (id: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id))
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = () => {
    setIsDragOver(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const files = e.dataTransfer.files
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      try {
        const result = await window.electronAPI.attachments.processPath(file.path)
        if (result) {
          setPendingAttachments((prev) => [...prev, result])
        }
      } catch (e) {
        console.error('Failed to process dropped file:', e)
      }
    }
  }

  return (
    <div
      className={`border-t border-gray-100 dark:border-gray-800 p-3 ${isDragOver ? 'bg-ai-500/5 border-ai-500' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Pending attachments */}
      {pendingAttachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {pendingAttachments.map((att) => (
            <AttachmentChip key={att.id} attachment={att} onRemove={() => handleRemoveAttachment(att.id)} />
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <button
          onClick={handlePickFile}
          disabled={disabled}
          className="flex-shrink-0 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors disabled:opacity-50"
          title="添加附件"
        >
          <Paperclip size={14} />
        </button>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isDragOver ? '释放文件…' : '输入消息…'}
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-xs text-gray-700 dark:text-gray-300 placeholder-gray-400 outline-none focus:border-ai-500 focus:ring-1 focus:ring-ai-500/30 transition-colors disabled:opacity-50"
        />
        {isStreaming ? (
          <button
            onClick={onStop}
            className="flex-shrink-0 p-2 rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors"
            title="停止生成"
          >
            <Square size={14} />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={(!text.trim() && pendingAttachments.length === 0) || disabled}
            className="flex-shrink-0 p-2 rounded-lg bg-ai-500 hover:bg-ai-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="发送"
          >
            <Send size={14} />
          </button>
        )}
      </div>
      <p className="text-[10px] text-gray-400 mt-1.5">Enter 发送 · Shift+Enter 换行 · 拖拽文件到此处</p>
    </div>
  )
}
