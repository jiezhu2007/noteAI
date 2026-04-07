import { useState } from 'react'
import { useRemindersStore } from '../../store/remindersStore'
import { Sparkles, Loader, Check, X } from 'lucide-react'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'

interface NLReminderBarProps {
  onCreated: () => void
}

interface ParsedReminder {
  title: string
  dueDate: string | null
  repeatRule: string | null
  confidence: number
}

export function NLReminderBar({ onCreated }: NLReminderBarProps) {
  const { createReminder, lists } = useRemindersStore()
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [parsed, setParsed] = useState<ParsedReminder | null>(null)
  const [error, setError] = useState('')

  const handleParse = async () => {
    if (!input.trim()) return
    setLoading(true)
    setError('')
    setParsed(null)
    try {
      const result = await window.electronAPI.ai.parseReminder(input.trim())
      setParsed(result)
    } catch (e: any) {
      setError(e.message || 'AI 解析失败')
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = async () => {
    if (!parsed) return
    await createReminder({
      title: parsed.title,
      dueDate: parsed.dueDate ? new Date(parsed.dueDate).getTime() : undefined,
      repeatRule: parsed.repeatRule ?? undefined,
      listId: lists[0]?.id,
    } as any)
    setInput('')
    setParsed(null)
    onCreated()
  }

  const repeatLabel: Record<string, string> = {
    daily: '每天',
    weekly: '每周',
    monthly: '每月',
    none: '不重复',
  }

  return (
    <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
      {/* Input row */}
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 focus-within:border-ai-500 focus-within:ring-1 focus-within:ring-ai-500/20 transition-all">
          <Sparkles size={14} className="text-ai-500 flex-shrink-0" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleParse() }}
            placeholder={'用自然语言描述提醒，如"明天下午三点提醒我提交报告"'}
            className="flex-1 text-sm bg-transparent outline-none text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500"
          />
          {input && (
            <button
              onClick={() => { setInput(''); setParsed(null) }}
              className="text-gray-400 hover:text-gray-600 flex-shrink-0"
            >
              <X size={13} />
            </button>
          )}
        </div>
        <button
          onClick={handleParse}
          disabled={!input.trim() || loading}
          className="px-3 py-2 rounded-xl bg-ai-500 hover:bg-ai-600 text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5"
        >
          {loading ? <Loader size={13} className="animate-spin" /> : <Sparkles size={13} />}
          解析
        </button>
      </div>

      {/* Parsed result */}
      {parsed && !loading && (
        <div className="mt-3 flex items-start gap-3 p-3 rounded-xl bg-ai-500/5 border border-ai-500/20">
          <div className="flex-1 space-y-1">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{parsed.title}</p>
            <div className="flex gap-3 text-xs text-gray-500 dark:text-gray-400">
              {parsed.dueDate && (
                <span>
                  🕐 {format(new Date(parsed.dueDate), 'yyyy年MM月dd日 HH:mm', { locale: zhCN })}
                </span>
              )}
              {parsed.repeatRule && parsed.repeatRule !== 'none' && (
                <span>🔄 {repeatLabel[parsed.repeatRule] ?? parsed.repeatRule}</span>
              )}
              <span className="text-ai-500">
                置信度 {Math.round(parsed.confidence * 100)}%
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setParsed(null)}
              className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400"
            >
              <X size={13} />
            </button>
            <button
              onClick={handleConfirm}
              className="px-3 py-1.5 rounded-lg bg-ai-500 hover:bg-ai-600 text-white text-xs font-medium flex items-center gap-1"
            >
              <Check size={12} />
              确认
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs text-red-500">{error}</p>
      )}
    </div>
  )
}
