import { useState } from 'react'
import { useNotesStore } from '../../store/notesStore'
import { Sparkles, X, Loader, Copy, ChevronDown, ChevronUp } from 'lucide-react'
import clsx from 'clsx'

interface AIPanelProps {
  onClose: () => void
}

export function AIPanel({ onClose }: AIPanelProps) {
  const { selectedNote, noteContent } = useNotesStore()
  const [summary, setSummary] = useState<string>('')
  const [keyPoints, setKeyPoints] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [pointsExpanded, setPointsExpanded] = useState(true)

  const handleGenerate = async () => {
    if (!noteContent.trim()) {
      setError('笔记内容为空，无法生成摘要')
      return
    }
    setLoading(true)
    setError('')
    try {
      // Strip HTML tags for AI input
      const plainText = noteContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
      const result = await window.electronAPI.ai.summarize(plainText)
      setSummary(result.summary)
      setKeyPoints(result.keyPoints)
    } catch (e: any) {
      setError(e.message || 'AI 服务错误，请检查设置')
    } finally {
      setLoading(false)
    }
  }

  const handleExtractPoints = async () => {
    if (!noteContent.trim()) return
    setLoading(true)
    setError('')
    try {
      const plainText = noteContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
      const points = await window.electronAPI.ai.extractPoints(plainText)
      setKeyPoints(points)
    } catch (e: any) {
      setError(e.message || 'AI 服务错误')
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  return (
    <div className="w-[300px] flex-shrink-0 border-l border-gray-200 dark:border-gray-700 flex flex-col bg-white dark:bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-ai-500" />
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">AI 助手</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"
        >
          <X size={14} />
        </button>
      </div>

      {/* Actions */}
      <div className="flex gap-2 p-3 border-b border-gray-100 dark:border-gray-800">
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-ai-500 hover:bg-ai-600 text-white text-xs font-medium transition-colors disabled:opacity-50"
        >
          {loading ? <Loader size={12} className="animate-spin" /> : <Sparkles size={12} />}
          生成摘要
        </button>
        <button
          onClick={handleExtractPoints}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium transition-colors disabled:opacity-50"
        >
          提取要点
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {error && (
          <div className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
            {error}
          </div>
        )}

        {!summary && !keyPoints.length && !error && !loading && (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-600 gap-3 text-center">
            <Sparkles size={28} strokeWidth={1} />
            <p className="text-xs">点击"生成摘要"让 AI 分析当前笔记</p>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-400 dark:text-gray-600">
            <Loader size={24} className="animate-spin text-ai-500" />
            <p className="text-xs">AI 正在分析笔记…</p>
          </div>
        )}

        {summary && !loading && (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800">
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">摘要</span>
              <button
                onClick={() => copyToClipboard(summary)}
                className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400"
              >
                <Copy size={11} />
              </button>
            </div>
            <p className="text-xs text-gray-700 dark:text-gray-300 p-3 leading-relaxed">
              {summary}
            </p>
          </div>
        )}

        {keyPoints.length > 0 && !loading && (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              onClick={() => setPointsExpanded((v) => !v)}
            >
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                关键要点 ({keyPoints.length})
              </span>
              {pointsExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            {pointsExpanded && (
              <ul className="p-3 space-y-1.5">
                {keyPoints.map((point, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-300">
                    <span className="text-ai-500 font-bold flex-shrink-0 mt-0.5">{i + 1}.</span>
                    <span className="leading-relaxed">{point}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="px-3 pb-3">
              <button
                onClick={() => copyToClipboard(keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n'))}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <Copy size={11} />
                复制全部
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
