import type { AgentPhase } from '../../types'
import { Brain, Zap, Search, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react'

interface AgentStatusBarProps {
  phase: AgentPhase
  iteration: number
  maxIterations: number
  score?: number
}

const PHASE_CONFIG: Record<AgentPhase, {
  icon: typeof Brain
  label: string
  color: string
  pulse: boolean
}> = {
  think: { icon: Brain, label: '正在分析任务...', color: 'text-blue-400', pulse: true },
  act: { icon: Zap, label: '正在生成回答...', color: 'text-ai-500', pulse: false },
  reflect: { icon: Search, label: '正在自我评估...', color: 'text-amber-400', pulse: true },
  improve: { icon: RefreshCw, label: '正在改进回答', color: 'text-purple-400', pulse: true },
  done: { icon: CheckCircle, label: '回答完成', color: 'text-green-500', pulse: false },
  error: { icon: AlertCircle, label: '出现错误', color: 'text-red-500', pulse: false },
}

export function AgentStatusBar({ phase, iteration, maxIterations, score }: AgentStatusBarProps) {
  // Act 阶段不显示状态条（此时直接展示流式输出）
  if (phase === 'act') return null

  const config = PHASE_CONFIG[phase]
  const Icon = config.icon

  const label = phase === 'improve'
    ? `${config.label}（第 ${iteration + 1} 轮）...`
    : phase === 'done' && score
      ? `${config.label}（评分 ${score}/10）`
      : config.label

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 mb-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-xs ${config.color}`}>
      <Icon
        size={13}
        className={config.pulse ? 'animate-pulse' : ''}
      />
      <span className="flex-1">{label}</span>
      {maxIterations > 0 && phase !== 'done' && phase !== 'error' && (
        <span className="text-gray-400 text-[10px]">{iteration}/{maxIterations}</span>
      )}
    </div>
  )
}
