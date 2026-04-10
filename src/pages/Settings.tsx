import { useState, useEffect, useRef, useCallback } from 'react'
import { Sun, Moon, Monitor, Server, Key, CheckCircle2, XCircle, Loader, Brain } from 'lucide-react'
import clsx from 'clsx'
import type { AIConfig, AgentConfig } from '../types'
import { DEFAULT_AGENT_CONFIG } from '../types'

interface SettingsPageProps {
  theme: 'light' | 'dark' | 'system'
  onThemeChange: (t: 'light' | 'dark' | 'system') => void
}

export function SettingsPage({ theme, onThemeChange }: SettingsPageProps) {
  const [aiConfig, setAiConfig] = useState<AIConfig | null>(null)
  const [agentConfig, setAgentConfig] = useState<AgentConfig>(DEFAULT_AGENT_CONFIG)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const agentConfigSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const saveAgentConfigDebounced = useCallback((next: AgentConfig) => {
    if (agentConfigSaveTimer.current) clearTimeout(agentConfigSaveTimer.current)
    agentConfigSaveTimer.current = setTimeout(() => {
      window.electronAPI.ai.setAgentConfig(next)
    }, 500)
  }, [])

  useEffect(() => {
    window.electronAPI.ai.getConfig().then(setAiConfig)
    window.electronAPI.ai.getAgentConfig().then(setAgentConfig).catch(() => {})
  }, [])

  const handleSaveAI = async () => {
    if (!aiConfig) return
    setSaving(true)
    try {
      await window.electronAPI.ai.setConfig(aiConfig)
    } finally {
      setSaving(false)
    }
  }

  const handleTestConnection = async () => {
    if (!aiConfig) return
    await window.electronAPI.ai.setConfig(aiConfig)
    setTesting(true)
    setTestResult(null)
    try {
      const result = await window.electronAPI.ai.testConnection()
      setTestResult(result)
    } catch (e: any) {
      setTestResult({ ok: false, message: e.message })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="flex-1 h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto py-10 px-8 space-y-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">设置</h1>

        {/* Appearance */}
        <Section title="外观">
          <div>
            <Label>主题</Label>
            <div className="flex gap-3 mt-2">
              {([
                { value: 'light', icon: <Sun size={16} />, label: '浅色' },
                { value: 'dark', icon: <Moon size={16} />, label: '深色' },
                { value: 'system', icon: <Monitor size={16} />, label: '跟随系统' },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => onThemeChange(opt.value)}
                  className={clsx(
                    'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
                    theme === opt.value
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                  )}
                >
                  {opt.icon}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </Section>

        {/* AI Configuration */}
        <Section title="AI 模型配置">
          {aiConfig && (
            <div className="space-y-4">
              {/* Provider */}
              <div>
                <Label>AI 服务商</Label>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {(['ollama', 'claude', 'openai', 'custom'] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setAiConfig({ ...aiConfig, provider: p })}
                      className={clsx(
                        'px-3 py-1.5 rounded-lg text-sm border transition-colors capitalize',
                        aiConfig.provider === p
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-600'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                      )}
                    >
                      {p === 'ollama' ? 'Ollama（本地）' : p === 'claude' ? 'Claude API' : p === 'openai' ? 'OpenAI API' : '自定义'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Ollama settings */}
              {aiConfig.provider === 'ollama' && (
                <>
                  <Field
                    label="Ollama 地址"
                    value={aiConfig.ollamaBaseUrl}
                    onChange={(v) => setAiConfig({ ...aiConfig, ollamaBaseUrl: v })}
                    placeholder="http://localhost:11434"
                  />
                  <Field
                    label="模型名称"
                    value={aiConfig.ollamaModel}
                    onChange={(v) => setAiConfig({ ...aiConfig, ollamaModel: v })}
                    placeholder="llama3"
                  />
                </>
              )}

              {/* Claude settings */}
              {aiConfig.provider === 'claude' && (
                <Field
                  label="Claude API Key"
                  value={aiConfig.claudeApiKey}
                  onChange={(v) => setAiConfig({ ...aiConfig, claudeApiKey: v })}
                  placeholder="sk-ant-..."
                  type="password"
                />
              )}

              {/* OpenAI settings */}
              {aiConfig.provider === 'openai' && (
                <>
                  <Field
                    label="OpenAI API Key"
                    value={aiConfig.openaiApiKey}
                    onChange={(v) => setAiConfig({ ...aiConfig, openaiApiKey: v })}
                    placeholder="sk-..."
                    type="password"
                  />
                  <Field
                    label="模型"
                    value={aiConfig.openaiModel}
                    onChange={(v) => setAiConfig({ ...aiConfig, openaiModel: v })}
                    placeholder="gpt-4o-mini"
                  />
                </>
              )}

              {/* Custom settings */}
              {aiConfig.provider === 'custom' && (
                <>
                  <Field
                    label="网关地址"
                    value={aiConfig.customBaseUrl}
                    onChange={(v) => setAiConfig({ ...aiConfig, customBaseUrl: v })}
                    placeholder="https://your-gateway.com"
                  />
                  <Field
                    label="Token"
                    value={aiConfig.customToken}
                    onChange={(v) => setAiConfig({ ...aiConfig, customToken: v })}
                    placeholder="Bearer Token 或 API Key"
                    type="password"
                  />
                  <Field
                    label="模型名称"
                    value={aiConfig.customModel}
                    onChange={(v) => setAiConfig({ ...aiConfig, customModel: v })}
                    placeholder="如 qwen-turbo、ernie-4.0 等"
                  />
                </>
              )}

              {/* Test connection */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleTestConnection}
                  disabled={testing}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                >
                  {testing ? (
                    <Loader size={14} className="animate-spin" />
                  ) : (
                    <Server size={14} />
                  )}
                  测试连接
                </button>

                {testResult && (
                  <span
                    className={clsx(
                      'flex items-center gap-1.5 text-sm',
                      testResult.ok ? 'text-green-600' : 'text-red-500'
                    )}
                  >
                    {testResult.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                    {testResult.message}
                  </span>
                )}
              </div>

              {/* Save */}
              <button
                onClick={handleSaveAI}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {saving ? '保存中…' : '保存配置'}
              </button>
            </div>
          )}
        </Section>

        {/* AI Reflection / Agent Config */}
        <Section title="AI 反思">
          <div className="space-y-4">
            {/* Enable toggle */}
            <div className="flex items-center justify-between">
              <div>
                <Label>启用反思</Label>
                <p className="text-xs text-gray-400 dark:text-gray-600 mt-0.5">
                  开启后 AI 会自动评估并改进回答质量
                </p>
              </div>
              <button
                onClick={() => {
                  const next = { ...agentConfig, enabled: !agentConfig.enabled }
                  setAgentConfig(next)
                  window.electronAPI.ai.setAgentConfig(next)
                }}
                className={clsx(
                  'relative w-11 h-6 rounded-full transition-colors',
                  agentConfig.enabled ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'
                )}
              >
                <span
                  className={clsx(
                    'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform',
                    agentConfig.enabled && 'translate-x-5'
                  )}
                />
              </button>
            </div>

            {agentConfig.enabled && (
              <>
                {/* Reflection level */}
                <div>
                  <Label>反思级别</Label>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {([
                      { value: -1, label: '自动' },
                      { value: 1, label: '轻量' },
                      { value: 2, label: '标准' },
                      { value: 3, label: '深度' },
                    ] as const).map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => {
                          const isAuto = opt.value === -1
                          const next = {
                            ...agentConfig,
                            autoClassify: isAuto,
                            defaultLevel: isAuto ? agentConfig.defaultLevel : (opt.value as 1 | 2 | 3),
                          }
                          setAgentConfig(next)
                          window.electronAPI.ai.setAgentConfig(next)
                        }}
                        className={clsx(
                          'px-3 py-1.5 rounded-lg text-sm border transition-colors',
                          (opt.value === -1 ? agentConfig.autoClassify : !agentConfig.autoClassify && agentConfig.defaultLevel === opt.value)
                            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-600'
                            : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Pass threshold slider */}
                <div>
                  <Label>通过阈值</Label>
                  <div className="flex items-center gap-3 mt-2">
                    <input
                      type="range"
                      min="5"
                      max="9"
                      step="0.5"
                      value={agentConfig.passThreshold}
                      onChange={(e) => {
                        const next = { ...agentConfig, passThreshold: parseFloat(e.target.value) }
                        setAgentConfig(next)
                        saveAgentConfigDebounced(next)
                      }}
                      className="flex-1 accent-primary-500"
                    />
                    <span className="text-sm font-mono text-gray-600 dark:text-gray-400 w-8 text-right">
                      {agentConfig.passThreshold}
                    </span>
                  </div>
                </div>

                {/* Token budget */}
                <div>
                  <Label>Token 预算</Label>
                  <div className="flex items-center gap-3 mt-2">
                    <input
                      type="range"
                      min="1024"
                      max="65536"
                      step="1024"
                      value={agentConfig.maxTokenBudget}
                      onChange={(e) => {
                        const next = { ...agentConfig, maxTokenBudget: parseInt(e.target.value) }
                        setAgentConfig(next)
                        saveAgentConfigDebounced(next)
                      }}
                      className="flex-1 accent-primary-500"
                    />
                    <span className="text-sm font-mono text-gray-600 dark:text-gray-400 w-12 text-right">
                      {agentConfig.maxTokenBudget > 1000
                        ? `${(agentConfig.maxTokenBudget / 1024).toFixed(0)}K`
                        : agentConfig.maxTokenBudget}
                    </span>
                  </div>
                </div>

                {/* Reflect threshold */}
                <div>
                  <Label>自动继续阈值</Label>
                  <p className="text-xs text-gray-400 dark:text-gray-600 mt-0.5 mb-2">
                    反思得分低于此值时，自动追加反思轮次继续完善答案
                  </p>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="5"
                      max="9"
                      step="0.5"
                      value={agentConfig.reflectThreshold ?? 7.0}
                      onChange={(e) => {
                        const next = { ...agentConfig, reflectThreshold: parseFloat(e.target.value) }
                        setAgentConfig(next)
                        saveAgentConfigDebounced(next)
                      }}
                      className="flex-1 accent-primary-500"
                    />
                    <span className="text-sm font-mono text-gray-600 dark:text-gray-400 w-8 text-right">
                      {agentConfig.reflectThreshold ?? 7.0}
                    </span>
                  </div>
                </div>

                {/* Max reflect extra */}
                <div>
                  <Label>最大追加轮次</Label>
                  <p className="text-xs text-gray-400 dark:text-gray-600 mt-0.5 mb-2">
                    任务未完成时最多自动追加几轮反思（0 = 不自动追加）
                  </p>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="0"
                      max="4"
                      step="1"
                      value={agentConfig.maxReflectExtra ?? 2}
                      onChange={(e) => {
                        const next = { ...agentConfig, maxReflectExtra: parseInt(e.target.value) }
                        setAgentConfig(next)
                        saveAgentConfigDebounced(next)
                      }}
                      className="flex-1 accent-primary-500"
                    />
                    <span className="text-sm font-mono text-gray-600 dark:text-gray-400 w-8 text-right">
                      {agentConfig.maxReflectExtra ?? 2}
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-2 text-xs text-gray-400 dark:text-gray-600 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2.5">
                  <Brain size={14} className="shrink-0 mt-0.5" />
                  <div>
                    <p>反思功能会增加约 1.5-4.6 倍 Token 消耗和延迟。</p>
                    <p className="mt-0.5">Ollama 本地小模型（&lt; 7B）建议关闭反思以获得更好体验。</p>
                  </div>
                </div>
              </>
            )}
          </div>
        </Section>

        {/* About */}
        <Section title="关于">
          <div className="text-sm text-gray-500 dark:text-gray-400 space-y-1">
            <p>NoteAI v1.0.0</p>
            <p>智能笔记与提醒一体化 macOS 应用</p>
            <p className="text-xs text-gray-400 dark:text-gray-600 mt-2">
              所有数据均存储在本地，不上传任何内容到云端。
            </p>
          </div>
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-4 pb-2 border-b border-gray-100 dark:border-gray-800">
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium text-gray-600 dark:text-gray-400">{children}</label>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600 outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 transition-all"
      />
    </div>
  )
}
