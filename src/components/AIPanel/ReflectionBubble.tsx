import { useState } from 'react'
import type { ReflectionResult, AgentMeta } from '../../types'
import { ChevronDown, ChevronRight, Zap } from 'lucide-react'

interface ReflectionBubbleProps {
  reflection: ReflectionResult
  meta?: AgentMeta
}

const DIM_LABELS: Record<string, string> = {
  accuracy: '准确性',
  completeness: '完整性',
  formatting: '格式规范',
  relevance: '相关性',
  clarity: '清晰度',
}

const DIM_COLORS: Record<string, string> = {
  accuracy: 'bg-blue-500',
  completeness: 'bg-green-500',
  formatting: 'bg-purple-500',
  relevance: 'bg-amber-500',
  clarity: 'bg-cyan-500',
}

function ScoreBar({ label, score, color }: { label: string; score: number; color: string }) {
  const pct = Math.min(100, Math.max(0, score * 10))
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span className="w-12 text-gray-500 dark:text-gray-400 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right text-gray-500 dark:text-gray-400">{score}/10</span>
    </div>
  )
}

export function ReflectionBubble({ reflection, meta }: ReflectionBubbleProps) {
  const [expanded, setExpanded] = useState(false)

  const passIcon = reflection.pass ? '✅' : '⚠️'
  const iterations = meta?.iterations ?? 1
  const iterLabel = iterations > 1 ? `${iterations}轮反思` : '1轮反思'

  return (
    <div className="mt-1.5">
      {/* 折叠态标题栏 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[10px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
      >
        {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        <span>{passIcon} {reflection.weightedScore}/10 · {iterLabel}</span>
        <span className="text-gray-300 dark:text-gray-600">
          {expanded ? '收起' : '查看详情'}
        </span>
      </button>

      {/* 展开态详情 */}
      {expanded && (
        <div className="mt-1.5 p-2 rounded-lg bg-gray-50 dark:bg-gray-800/60 space-y-1.5">
          {(['accuracy', 'completeness', 'formatting', 'relevance', 'clarity'] as const).map((dim) => (
            <ScoreBar
              key={dim}
              label={DIM_LABELS[dim]}
              score={reflection[dim].score}
              color={DIM_COLORS[dim]}
            />
          ))}

          {reflection.improvements.length > 0 && (
            <div className="mt-1.5 pt-1.5 border-t border-gray-200 dark:border-gray-700">
              <p className="text-[10px] text-gray-400 mb-0.5">改进建议：</p>
              {reflection.improvements.map((item, i) => (
                <p key={i} className="text-[10px] text-gray-500 dark:text-gray-400">• {item}</p>
              ))}
            </div>
          )}

          {meta && (
            <div className="flex items-center gap-1 mt-1 pt-1 border-t border-gray-200 dark:border-gray-700 text-[10px] text-gray-400">
              <Zap size={9} />
              <span>
                {meta.totalTokens > 1000
                  ? `${(meta.totalTokens / 1000).toFixed(1)}K`
                  : meta.totalTokens} tokens · {(meta.totalDurationMs / 1000).toFixed(1)}s
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
